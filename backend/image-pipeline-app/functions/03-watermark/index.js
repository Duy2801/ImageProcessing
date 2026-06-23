const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../common/logger');
const { downloadFile, uploadFile } = require('../../common/s3-helper');

const sqs = new SQSClient({});
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  logger.info('Processing watermark event batch', { recordCount: event.Records.length });
  logger.info('Event watermark stage: ', {event})
  for (const record of event.Records) {
    let payload;
    try {
      payload = JSON.parse(record.body);
    } catch (e) {
      logger.error('Failed to parse SQS message body', e);
      continue;
    }

    const { jobId, imageId, userId, userEmail, s3Bucket, s3Key, options = {}, logs = [], metadata = {} } = payload;
    logger.info('Processing watermark for job', { jobId, imageId });

    // Defensive input check
    if (!UUID_REGEX.test(jobId) || !UUID_REGEX.test(imageId)) {
      logger.error('Invalid UUID formats in SQS record, halting processing of this message.', null, { jobId, imageId });
      continue;
    }

    const startTime = Date.now();
    const stageName = 'WatermarkStage';
    const watermarkOptions = options.watermark;

    // Check if watermark stage should run
    if (!watermarkOptions || !watermarkOptions.type) {
      logger.info('Watermark options not provided. Skipping stage.', { jobId });
      logs.push({
        stage: stageName,
        status: 'skipped',
        message: 'No watermark options provided',
        timestamp: new Date().toISOString(),
        duration: 0
      });

      // Forward directly to next stage
      await forwardToNextStage(payload, process.env.COMPRESS_QUEUE_URL);
      continue;
    }

    const ext = path.extname(s3Key).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (!allowedExts.includes(ext)) {
      logger.error(`Unsupported file type extension: ${ext}`, null, { jobId });
      continue;
    }

    const inputLocalPath = `/tmp/${jobId}-watermark-input${ext}`;
    const outputLocalKey = `processed/${jobId}/watermarked${ext}`;
    const outputLocalPath = `/tmp/${jobId}-watermark-output${ext}`;
    const wmLocalPath = `/tmp/${jobId}-wm-overlay`; // Used if downloading image watermark

    try {
      // 1. Download image from S3
      logger.info('Downloading file from S3', { s3Bucket, s3Key, inputLocalPath });
      await downloadFile(s3Bucket, s3Key, inputLocalPath);

      // 2. Prepare watermark composite
      let sharpInstance = sharp(inputLocalPath);
      const imgWidth = metadata.width || 800;
      const imgHeight = metadata.height || 600;
      const position = watermarkOptions.position || 'bottom-right';

      if (watermarkOptions.type === 'text') {
        if (!watermarkOptions.text) {
          throw new Error('Watermark text is required for type "text"');
        }

        const fontSize = watermarkOptions.fontSize || 24;
        const opacity = watermarkOptions.opacity || 0.5;

        // Calculate position
        const { x, y } = calculatePosition(
          position,
          imgWidth,
          imgHeight,
          watermarkOptions.text.length * fontSize * 0.6,
          fontSize * 1.5
        );

        // Create SVG text overlay
        const svgText = `
          <svg width="${imgWidth}" height="${imgHeight}" viewBox="0 0 ${imgWidth} ${imgHeight}">
            <style>
              .watermark {
                fill: rgba(255, 255, 255, ${opacity});
                font-size: ${fontSize}px;
                font-family: Arial, sans-serif;
                font-weight: bold;
              }
            </style>
            <text x="${x}" y="${y}" class="watermark">${escapeXml(watermarkOptions.text)}</text>
          </svg>
        `;

        const svgBuffer = Buffer.from(svgText);
        sharpInstance = sharpInstance.composite([
          {
            input: svgBuffer,
            top: 0,
            left: 0,
          },
        ]);

      } else if (watermarkOptions.type === 'image') {
        if (!watermarkOptions.imagePath) {
          throw new Error('Watermark imagePath is required for type "image"');
        }

        // download image watermark from S3
        logger.info('Downloading watermark image from S3', { key: watermarkOptions.imagePath });
        await downloadFile(s3Bucket, watermarkOptions.imagePath, wmLocalPath);

        // Resize watermark image to reasonable size (20% of main image width)
        const watermarkWidth = Math.floor(imgWidth * 0.2);
        const watermarkBuffer = await sharp(wmLocalPath)
          .resize(watermarkWidth)
          .toBuffer();

        const watermarkMeta = await sharp(watermarkBuffer).metadata();
        const wmWidth = watermarkMeta.width || watermarkWidth;
        const wmHeight = watermarkMeta.height || watermarkWidth;

        const { x, y } = calculatePosition(
          position,
          imgWidth,
          imgHeight,
          wmWidth,
          wmHeight
        );

        sharpInstance = sharpInstance.composite([
          {
            input: watermarkBuffer,
            top: Math.max(0, Math.floor(y)),
            left: Math.max(0, Math.floor(x)),
          },
        ]);
      } else {
        throw new Error(`Unsupported watermark type: ${watermarkOptions.type}`);
      }

      await sharpInstance.toFile(outputLocalPath);

      // Extract new metadata & size
      const newMeta = await sharp(outputLocalPath).metadata();
      const newSize = fs.statSync(outputLocalPath).size;

      // 3. Upload watermarked image to S3
      logger.info('Uploading watermarked file to S3', { outputLocalKey });
      const contentType = `image/${newMeta.format === 'jpg' ? 'jpeg' : newMeta.format}`;
      await uploadFile(s3Bucket, outputLocalKey, outputLocalPath, contentType);

      // 4. Update payload logs and metadata
      const duration = Date.now() - startTime;
      logs.push({
        stage: stageName,
        status: 'completed',
        message: `Successfully applied watermark: ${watermarkOptions.type}`,
        timestamp: new Date().toISOString(),
        duration
      });

      const updatedPayload = {
        ...payload,
        s3Key: outputLocalKey,
        metadata: {
          ...metadata,
          width: newMeta.width,
          height: newMeta.height,
          format: newMeta.format,
          size: newSize
        },
        logs
      };

      // 5. Forward to Compress Stage (Next Queue)
      await forwardToNextStage(updatedPayload, process.env.COMPRESS_QUEUE_URL);

      // 6. Dispatch watermarked notification
      await sendNotification('image.watermarked', {
        jobId,
        imageId,
        userId,
        userEmail,
        metadata: {
          watermarkType: watermarkOptions.type,
          width: newMeta.width,
          height: newMeta.height,
          format: newMeta.format,
          size: newSize
        }
      });

    } catch (err) {
      logger.error('Error during WatermarkStage processing', err, { jobId });

      // Dispatch failure notification
      await sendNotification('image.failed', {
        jobId,
        imageId,
        userId,
        userEmail,
        metadata: {
          error: err.message,
          failedStage: stageName
        }
      });

    } finally {
      // Clean up temporary files
      cleanupFiles([inputLocalPath, outputLocalPath, wmLocalPath]);
    }
  }
};

function calculatePosition(position, imgWidth, imgHeight, wmWidth, wmHeight) {
  const padding = 20;

  switch (position) {
    case 'top-left':
      return { x: padding, y: padding };
    case 'top-right':
      return { x: imgWidth - wmWidth - padding, y: padding };
    case 'bottom-left':
      return { x: padding, y: imgHeight - wmHeight - padding };
    case 'bottom-right':
      return { x: imgWidth - wmWidth - padding, y: imgHeight - wmHeight - padding };
    case 'center':
      return {
        x: (imgWidth - wmWidth) / 2,
        y: (imgHeight - wmHeight) / 2,
      };
    default:
      return { x: imgWidth - wmWidth - padding, y: imgHeight - wmHeight - padding };
  }
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function forwardToNextStage(payload, queueUrl) {
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
  });
  await sqs.send(command);
}

async function sendNotification(eventType, data) {
  const notificationPayload = {
    eventId: crypto.randomUUID(),
    eventType,
    timestamp: new Date().toISOString(),
    source: 'image-pipeline-app',
    data
  };

  const command = new SendMessageCommand({
    QueueUrl: process.env.NOTIFICATION_QUEUE_URL,
    MessageBody: JSON.stringify(notificationPayload),
  });
  await sqs.send(command);
}

function cleanupFiles(paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch (e) {
      // Ignore errors if file doesn't exist
    }
  }
}
