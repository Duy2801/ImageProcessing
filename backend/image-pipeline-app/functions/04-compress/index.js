const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const logger = require("../../common/logger");
const { downloadFile, uploadFile } = require("../../common/s3-helper");

const sqs = new SQSClient({});
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  logger.info("Processing compress event batch", {
    recordCount: event.Records.length,
  });
  logger.info("Event compress stage: ", { event });
  for (const record of event.Records) {
    let payload;
    try {
      payload = JSON.parse(record.body);
    } catch (e) {
      logger.error("Failed to parse SQS message body", e);
      continue;
    }

    const {
      jobId,
      imageId,
      userId,
      s3Bucket,
      s3Key,
      options = {},
      logs = [],
      metadata = {},
    } = payload;
    logger.info("Processing compression for job", { jobId, imageId });

    // Defensive input check
    if (!UUID_REGEX.test(jobId) || !UUID_REGEX.test(imageId)) {
      logger.error(
        "Invalid UUID formats in SQS record, halting processing of this message.",
        null,
        { jobId, imageId },
      );
      continue;
    }

    const startTime = Date.now();
    const stageName = "CompressionStage";
    const compressionOptions = options.compression || {};

    const format = compressionOptions.format || "jpeg";
    const quality = compressionOptions.quality || 80;

    // Output extension
    const ext = format === "jpeg" ? ".jpg" : `.${format}`;
    const inputExt = path.extname(s3Key).toLowerCase();

    const inputLocalPath = `/tmp/${jobId}-compress-input${inputExt}`;
    const outputLocalKey = `processed/${jobId}/final${ext}`;
    const outputLocalPath = `/tmp/${jobId}-compress-output${ext}`;

    try {
      // 1. Download image from S3
      logger.info("Downloading file from S3", {
        s3Bucket,
        s3Key,
        inputLocalPath,
      });
      await downloadFile(s3Bucket, s3Key, inputLocalPath);

      // 2. Perform compression and formatting using Sharp
      logger.info("Applying compression settings", { format, quality });
      let sharpInstance = sharp(inputLocalPath);

      switch (format) {
        case "jpeg":
          sharpInstance = sharpInstance.jpeg({
            quality,
            progressive: true,
            mozjpeg: true,
          });
          break;

        case "png":
          // Map quality 0-100 to compression level 0-9 (higher means slower but smaller)
          const compressionLevel = Math.min(
            9,
            Math.floor((100 - quality) / 11),
          );
          sharpInstance = sharpInstance.png({
            compressionLevel,
            progressive: true,
          });
          break;

        case "webp":
          sharpInstance = sharpInstance.webp({
            quality,
            effort: 4,
          });
          break;

        default:
          throw new Error(`Unsupported output compression format: ${format}`);
      }

      await sharpInstance.toFile(outputLocalPath);

      // Extract new metadata & size
      const newMeta = await sharp(outputLocalPath).metadata();
      const newSize = fs.statSync(outputLocalPath).size;

      // 3. Upload compressed file to S3
      logger.info("Uploading final compressed file to S3", { outputLocalKey });
      const contentType = `image/${format}`;
      await uploadFile(s3Bucket, outputLocalKey, outputLocalPath, contentType);

      // 4. Update logs and finish pipeline
      const duration = Date.now() - startTime;
      logs.push({
        stage: stageName,
        status: "completed",
        message: `Successfully compressed image to ${format} with quality ${quality}`,
        timestamp: new Date().toISOString(),
        duration,
      });

      // 5. Dispatch final completed notification
      await sendNotification("image.completed", {
        jobId,
        imageId,
        userId,
        metadata: {
          s3Key: outputLocalKey,
          width: newMeta.width,
          height: newMeta.height,
          format: format,
          size: newSize,
          logs,
        },
      });
      logger.info("Pipeline execution finished successfully", {
        jobId,
        imageId,
      });
      logger.info("Image completed: ", {
        jobId,
        imageId,
        userId,
        metadata: {
          s3Key: outputLocalKey,
          width: newMeta.width,
          height: newMeta.height,
          format: format,
          size: newSize,
          logs,
        },
      });
    } catch (err) {
      logger.error("Error during CompressionStage processing", err, { jobId });

      // Dispatch failure notification
      await sendNotification("image.failed", {
        jobId,
        imageId,
        userId,
        metadata: {
          error: err.message,
          failedStage: stageName,
        },
      });
    } finally {
      // Clean up temporary files
      cleanupFiles([inputLocalPath, outputLocalPath]);
    }
  }
};

async function sendNotification(eventType, data) {
  const notificationPayload = {
    eventId: crypto.randomUUID(),
    eventType,
    timestamp: new Date().toISOString(),
    source: "image-pipeline-app",
    data,
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
      // Ignore
    }
  }
}
