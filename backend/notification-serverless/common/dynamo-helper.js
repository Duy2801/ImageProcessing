const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Retrieves all subscriptions matching a specific userId from DynamoDB
 * @param {string} userId
 * @returns {Promise<Array>} List of subscriptions
 */
async function getSubscriptionsForUser(userId) {
  if (!process.env.SUBSCRIPTIONS_TABLE) {
    throw new Error('SUBSCRIPTIONS_TABLE environment variable is not defined.');
  }

  const command = new QueryCommand({
    TableName: process.env.SUBSCRIPTIONS_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
  });

  const response = await docClient.send(command);
  return response.Items || [];
}

/**
 * Saves a notification event dispatch history record to DynamoDB
 * @param {Object} history - The history item structure
 */
async function saveNotificationHistory(history) {
  if (!process.env.HISTORY_TABLE) {
    throw new Error('HISTORY_TABLE environment variable is not defined.');
  }

  const command = new PutCommand({
    TableName: process.env.HISTORY_TABLE,
    Item: {
      ...history,
      createdAt: new Date().toISOString()
    },
  });

  await docClient.send(command);
}

/**
 * Saves or updates a user subscription in DynamoDB
 * @param {Object} subscription
 */
async function saveSubscription(subscription) {
  if (!process.env.SUBSCRIPTIONS_TABLE) {
    throw new Error('SUBSCRIPTIONS_TABLE environment variable is not defined.');
  }

  const command = new PutCommand({
    TableName: process.env.SUBSCRIPTIONS_TABLE,
    Item: subscription,
  });

  await docClient.send(command);
}

module.exports = {
  getSubscriptionsForUser,
  saveNotificationHistory,
  saveSubscription,
};
