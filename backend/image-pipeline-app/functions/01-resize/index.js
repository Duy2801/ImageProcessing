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
  logger.info('Processing resize event batch', { recordCount: event.Records.length });
  logger.info('Event resize stage: ', {event})
  for (const record of event.Records) {
    let payload;
    try {
      payload = JSON.parse(record.body);
    } catch (e) {
      logger.error('Failed to parse SQS message body', e);
      continue;
    }

    const { jobId, imageId, userId, s3Bucket, s3Key, options = {}, logs = [], metadata = {} } = payload;
    logger.info('Processing resize for job', { jobId, imageId });

    // Defensive input check
    if (!UUID_REGEX.test(jobId) || !UUID_REGEX.test(imageId)) {
      logger.error('Invalid UUID formats in SQS record, halting processing of this message.', null, { jobId, imageId });
      continue;
    }

    const startTime = Date.now();
    const stageName = 'ResizeStage';
    const resizeOptions = options.resize;

    // Check if resize stage should run
    if (!resizeOptions || (!resizeOptions.width && !resizeOptions.height)) {
      logger.info('Resize options not provided. Skipping stage.', { jobId });
      logs.push({
        stage: stageName,
        status: 'skipped',
        message: 'No resize options provided',
        timestamp: new Date().toISOString(),
        duration: 0
      });

      // Forward directly to next stage
      await forwardToNextStage(payload, process.env.FILTER_QUEUE_URL);
      continue;
    }

    // Temporary file paths (strictly restricted under /tmp, with safe names)
    const ext = path.extname(s3Key).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (!allowedExts.includes(ext)) {
      logger.error(`Unsupported file type extension: ${ext}`, null, { jobId });
      continue;
    }

    const inputLocalPath = `/tmp/${jobId}-resize-input${ext}`;
    const outputLocalKey = `processed/${jobId}/resize${ext}`;
    const outputLocalPath = `/tmp/${jobId}-resize-output${ext}`;

    try {
      // 1. Download original from S3
      logger.info('Downloading file from S3', { s3Bucket, s3Key, inputLocalPath });
      await downloadFile(s3Bucket, s3Key, inputLocalPath);

      // 2. Perform resize using Sharp
      logger.info('Performing resize transformation', { resizeOptions });
      const sharpInstance = sharp(inputLocalPath);

      const originalMeta = await sharpInstance.metadata();
      const originalWidth = originalMeta.width || 800;
      const originalHeight = originalMeta.height || 600;

      const width = resizeOptions.width || originalWidth;
      const height = resizeOptions.height || originalHeight;
      const fit = resizeOptions.fit || 'cover';

      await sharpInstance
        .resize({ width, height, fit })
        .toFile(outputLocalPath);

      // Extract new metadata & size
      const newMeta = await sharp(outputLocalPath).metadata();
      const newSize = fs.statSync(outputLocalPath).size;

      // 3. Upload resized image to S3
      logger.info('Uploading resized file to S3', { outputLocalKey });
      const contentType = `image/${newMeta.format === 'jpg' ? 'jpeg' : newMeta.format}`;
      await uploadFile(s3Bucket, outputLocalKey, outputLocalPath, contentType);

      // 4. Update payload logs and metadata
      const duration = Date.now() - startTime;
      logs.push({
        stage: stageName,
        status: 'completed',
        message: `Successfully resized image to ${newMeta.width}x${newMeta.height}`,
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

      // 5. Forward to Filter Stage (Next Queue)
      await forwardToNextStage(updatedPayload, process.env.FILTER_QUEUE_URL);

      // 6. Dispatch resized notification
      await sendNotification('image.resized', {
        jobId,
        imageId,
        userId,
        metadata: {
          width: newMeta.width,
          height: newMeta.height,
          format: newMeta.format,
          size: newSize
        }
      });

    } catch (err) {
      logger.error('Error during ResizeStage processing', err, { jobId });

      // Dispatch failure notification
      await sendNotification('image.failed', {
        jobId,
        imageId,
        userId,
        metadata: {
          error: err.message,
          failedStage: stageName
        }
      });

    } finally {
      // Clean up temporary files
      cleanupFiles([inputLocalPath, outputLocalPath]);
    }
  }
};

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
      logger.warn('Failed to delete temp file', e, { path: p });
    }
  }
}
