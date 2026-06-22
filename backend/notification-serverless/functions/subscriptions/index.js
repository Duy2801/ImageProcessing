const logger = require('../../common/logger');
const { getSubscriptionsForUser, saveSubscription } = require('../../common/dynamo-helper');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

/**
 * GET /users/{userId}/subscriptions
 */
exports.get = async (event) => {
  logger.info('Received get subscriptions request', { event });
  const userId = event.pathParameters?.userId;

  if (!userId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'userId path parameter is required' }),
    };
  }

  try {
    const items = await getSubscriptionsForUser(userId);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(items),
    };
  } catch (error) {
    logger.error('Error fetching subscriptions', error, { userId });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Failed to fetch subscriptions: ' + error.message }),
    };
  }
};

/**
 * POST /users/{userId}/subscriptions
 */
exports.save = async (event) => {
  logger.info('Received save subscription request', { event });
  const userId = event.pathParameters?.userId;

  if (!userId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'userId path parameter is required' }),
    };
  }

  try {
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON request body' }),
      };
    }

    if (!body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Request body is required' }),
      };
    }

    const { id, channel, destination, events, isActive } = body;

    // Validate fields
    if (!id || typeof id !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'id (subscription id) is required and must be a string' }),
      };
    }
    if (!channel || !['email', 'webhook'].includes(channel)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'channel must be either "email" or "webhook"' }),
      };
    }
    if (!destination || typeof destination !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'destination is required and must be a string' }),
      };
    }
    if (!Array.isArray(events) || events.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'events must be a non-empty array of strings' }),
      };
    }

    const subscription = {
      userId,
      id,
      channel,
      destination,
      events,
      isActive: isActive !== false, // default true
      updatedAt: new Date().toISOString(),
    };

    logger.info('Saving subscription to DynamoDB', { userId, id });
    await saveSubscription(subscription);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, item: subscription }),
    };
  } catch (error) {
    logger.error('Error saving subscription', error, { userId });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Failed to save subscription: ' + error.message }),
    };
  }
};
