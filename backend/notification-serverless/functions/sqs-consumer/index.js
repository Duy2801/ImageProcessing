const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// axios dependency removed to use native fetch in Node.js 20
const crypto = require('crypto');
const logger = require('../../common/logger');
const { getSubscriptionsForUser, saveNotificationHistory } = require('../../common/dynamo-helper');
const { getEmailHtml } = require('./email-template');

// Initialize SES Client
const ses = new SESClient({});

exports.handler = async (event) => {
  logger.info('Processing SQS Notification batch', { recordCount: event.Records.length });

  for (const record of event.Records) {
    let eventPayload;
    try {
      eventPayload = JSON.parse(record.body);
    } catch (e) {
      logger.error('Failed to parse SQS message body', e);
      continue;
    }

    const { eventId, eventType, timestamp, data } = eventPayload;
    if (!data || !data.userId || !data.jobId || !data.imageId) {
      logger.warn('Skipping invalid event payload (missing data fields)', { eventPayload });
      continue;
    }

    const { userId, jobId, imageId, metadata = {} } = data;
    logger.info('Processing notification event', { eventType, jobId, userId });

    // 1. Publish progress to AWS AppSync (GraphQL Mutation)
    try {
      await publishProgressToAppSync(eventPayload);
    } catch (err) {
      logger.error('Failed to publish progress to AWS AppSync', err, { jobId });
      // Don't fail the whole function; AppSync failure shouldn't block email/webhook notifications
    }

    // 2. Fetch and evaluate user subscriptions from DynamoDB
    let subscriptions = [];
    try {
      subscriptions = await getSubscriptionsForUser(userId);
    } catch (err) {
      logger.error('Failed to query subscriptions from DynamoDB', err, { userId });
      continue;
    }

    // 3. Dispatch notifications for matching active subscriptions
    for (const sub of subscriptions) {
      if (!sub.isActive) continue;

      // Check if subscription has subscribed to this event type
      const subscribedEvents = Array.isArray(sub.events) ? sub.events : [sub.events];
      if (!subscribedEvents.includes(eventType)) {
        continue;
      }

      // Check filter options (like jobId filter if present)
      if (sub.filters && sub.filters.jobId && sub.filters.jobId !== jobId) {
        continue;
      }

      const historyId = crypto.randomUUID();
      const historyEntry = {
        id: historyId,
        jobId: jobId,
        subscriptionId: sub.id,
        eventId: eventId,
        status: 'pending',
        sentAt: new Date().toISOString(),
        retryCount: 0
      };

      try {
        await saveNotificationHistory(historyEntry);

        if (sub.channel === 'webhook') {
          await sendWebhookWithRetry(sub.destination, eventPayload, historyEntry);
        } else if (sub.channel === 'email') {
          await sendEmailViaSES(sub.destination, eventType, data, historyEntry);
        } else {
          logger.warn(`Unsupported subscription channel: ${sub.channel}`, { subscriptionId: sub.id });
        }
      } catch (err) {
        logger.error(`Failed to dispatch notification for subscription ${sub.id}`, err);
      }
    }
  }
};

/**
 * Publishes progress update to AWS AppSync to trigger GraphQL subscription
 */
async function publishProgressToAppSync(eventPayload) {
  const endpoint = process.env.APPSYNC_ENDPOINT;
  const apiKey = process.env.APPSYNC_API_KEY;

  if (!endpoint || !apiKey) {
    logger.warn('AppSync endpoint or API key not set. Skipping AppSync publish.');
    return;
  }

  const query = `
    mutation PublishProgress(
      $jobId: String!,
      $imageId: String!,
      $userId: String!,
      $eventType: String!,
      $status: String!,
      $timestamp: String!,
      $metadata: String
    ) {
      publishProgress(
        jobId: $jobId,
        imageId: $imageId,
        userId: $userId,
        eventType: $eventType,
        status: $status,
        timestamp: $timestamp,
        metadata: $metadata
      ) {
        jobId
        imageId
        userId
        eventType
        status
        timestamp
        metadata
      }
    }
  `;

  const { eventType, timestamp, data } = eventPayload;
  const variables = {
    jobId: data.jobId,
    imageId: data.imageId,
    userId: data.userId,
    eventType: eventType,
    status: eventType === 'image.failed' ? 'FAILED' : 'SUCCESS',
    timestamp: timestamp,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null
  };

  logger.info('Publishing to AppSync', { variables });
  const response = await fetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(5000)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
  }
}

/**
 * Dispatches webhook with retry rules
 */
async function sendWebhookWithRetry(destination, payload, historyEntry, attempt = 1) {
  const retryLimit = parseInt(process.env.WEBHOOK_RETRY_LIMIT || '3', 10);
  try {
    const response = await fetch(destination, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    historyEntry.status = 'success';
    historyEntry.retryCount = attempt;
    await saveNotificationHistory(historyEntry);
    logger.info('Webhook sent successfully', { destination, jobId: historyEntry.jobId });
  } catch (error) {
    logger.warn(`Webhook attempt ${attempt} failed for ${destination}: ${error.message}`);
    
    if (attempt < retryLimit) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      await sendWebhookWithRetry(destination, payload, historyEntry, attempt + 1);
    } else {
      historyEntry.status = 'failed';
      historyEntry.retryCount = attempt;
      historyEntry.lastError = error.message;
      await saveNotificationHistory(historyEntry);
      logger.error(`Webhook failed permanently after ${attempt} attempts`, error, { destination });
    }
  }
}

/**
 * Dispatches email using AWS SES
 */
async function sendEmailViaSES(destination, eventType, eventData, historyEntry) {
  const sourceEmail = process.env.EMAIL_FROM;
  if (!sourceEmail) {
    throw new Error('EMAIL_FROM environment variable is not defined.');
  }

  const isSuccess = eventType === 'image.completed';
  const displaySubject = isSuccess 
    ? `[Pipeline Studio] Xử lý ảnh thành công (Job: ${eventData.jobId.slice(0, 8)})` 
    : `[Pipeline Studio] Xử lý ảnh thất bại (Job: ${eventData.jobId.slice(0, 8)})`;

  const textBody = `Image processing update: ${eventType}\nJob ID: ${eventData.jobId}\nImage ID: ${eventData.imageId}\nDetails: ${JSON.stringify(eventData.metadata || {})}`;
  const htmlBody = getEmailHtml(eventType, eventData);

  const command = new SendEmailCommand({
    Destination: {
      ToAddresses: [destination],
    },
    Message: {
      Body: {
        Text: { 
          Data: textBody,
          Charset: 'UTF-8'
        },
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        }
      },
      Subject: { 
        Data: displaySubject,
        Charset: 'UTF-8'
      },
    },
    Source: sourceEmail,
  });

  try {
    await ses.send(command);
    historyEntry.status = 'success';
    await saveNotificationHistory(historyEntry);
    logger.info('Email sent successfully via SES', { destination, jobId: eventData.jobId });
  } catch (error) {
    historyEntry.status = 'failed';
    historyEntry.lastError = error.message;
    await saveNotificationHistory(historyEntry);
    logger.error('Failed to send email via SES', error, { destination });
    throw error;
  }
}
