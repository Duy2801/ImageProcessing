const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const crypto = require('crypto');
const path = require('path');
const logger = require('../../common/logger');

// Initialize SQS Client
const sqs = new SQSClient({});

exports.handler = async (event) => {
  logger.info('Received start request', { event });

  try {
    // Parse body (handles API Gateway proxy or direct invocation)
    let body = event.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    if (!body) {
      return response(400, { success: false, error: 'Request body is required' });
    }

    const { s3Key, options = {}, userId, userEmail } = body;

    // 1. Input Validation
    if (!userId || typeof userId !== 'string') {
      return response(400, { success: false, error: 'userId is required and must be a string' });
    }

    if (!s3Key || typeof s3Key !== 'string') {
      return response(400, { success: false, error: 's3Key is required and must be a string' });
    }

    // TODO(security): Validate S3 Key format & prevent directory traversal sequences in S3 path
    const normalizedKey = path.normalize(s3Key);
    if (normalizedKey.includes('..') || normalizedKey.startsWith('/')) {
      return response(400, { success: false, error: 'Invalid s3Key format. Traversal is not allowed.' });
    }

    const ext = path.extname(s3Key).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (!allowedExts.includes(ext)) {
      return response(400, { success: false, error: `Unsupported file type: ${ext}. Allowed: ${allowedExts.join(', ')}` });
    }

    // 2. Generate UUIDs for tracking
    const jobId = body.jobId || crypto.randomUUID();
    const imageId = body.imageId || crypto.randomUUID();

    // Prepare pipeline context payload
    const pipelinePayload = {
      jobId,
      imageId,
      userId,
      userEmail,
      s3Bucket: process.env.S3_BUCKET_NAME,
      s3Key,
      options,
      metadata: {
        originalName: path.basename(s3Key),
        format: ext.replace('.', '')
      },
      logs: [
        {
          stage: 'InputStage',
          status: 'completed',
          message: `Pipeline initialized for S3 Key: ${s3Key}`,
          timestamp: new Date().toISOString()
        }
      ]
    };

    // 3. Send message to Resize SQS Queue (Next Stage)
    const resizeCommand = new SendMessageCommand({
      QueueUrl: process.env.RESIZE_QUEUE_URL,
      MessageBody: JSON.stringify(pipelinePayload),
    });
    await sqs.send(resizeCommand);
    logger.info('Queued job to Resize Stage', { jobId, imageId });

    // 4. Send notification to Notification Queue
    const notificationPayload = {
      eventId: crypto.randomUUID(),
      eventType: 'image.processing.started',
      timestamp: new Date().toISOString(),
      source: 'image-pipeline-app',
      data: {
        jobId,
        imageId,
        userId,
        userEmail,
        metadata: {
          originalName: path.basename(s3Key)
        }
      }
    };

    const notifyCommand = new SendMessageCommand({
      QueueUrl: process.env.NOTIFICATION_QUEUE_URL,
      MessageBody: JSON.stringify(notificationPayload),
    });
    await sqs.send(notifyCommand);
    logger.info('Dispatched started notification', { jobId, imageId });

    return response(200, {
      success: true,
      message: 'Image pipeline successfully started',
      data: {
        jobId,
        imageId
      }
    });

  } catch (error) {
    logger.error('Error starting image pipeline', error);
    return response(500, {
      success: false,
      error: 'Failed to start image pipeline: ' + error.message
    });
  }
};

/**
 * Standard HTTP response helper
 */
function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(body),
  };
}
