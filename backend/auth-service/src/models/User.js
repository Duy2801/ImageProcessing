const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { ConditionalCheckFailedException, DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const config = require('../config');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.aws.region }));
const localUsersFile = path.resolve(__dirname, '../../.data/users.json');

async function readLocalUsers() {
  try {
    const raw = await fs.readFile(localUsersFile, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeLocalUsers(users) {
  await fs.mkdir(path.dirname(localUsersFile), { recursive: true });
  await fs.writeFile(localUsersFile, JSON.stringify(users, null, 2));
}

function useLocalStore() {
  return !config.usersTable;
}

function tableName() {
  if (!config.usersTable) {
    throw new Error('USERS_TABLE environment variable is required');
  }

  return config.usersTable;
}

function publicUser(item) {
  if (!item) return null;

  return {
    id: item.id,
    name: item.name,
    email: item.email,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    passwordHash: item.passwordHash,
    toJSON() {
      return {
        id: item.id,
        name: item.name,
        email: item.email,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    },
  };
}

async function findById(id) {
  if (useLocalStore()) {
    const users = await readLocalUsers();
    return publicUser(users.find((user) => user.id === id));
  }

  const response = await dynamo.send(new GetCommand({
    TableName: tableName(),
    Key: { id },
  }));

  return publicUser(response.Item);
}

async function findOne(query) {
  if (!query?.email) {
    throw new Error('Only findOne({ email }) is supported');
  }

  if (useLocalStore()) {
    const email = String(query.email).trim().toLowerCase();
    const users = await readLocalUsers();
    return publicUser(users.find((user) => user.email === email));
  }

  const response = await dynamo.send(new QueryCommand({
    TableName: tableName(),
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': String(query.email).trim().toLowerCase(),
    },
    Limit: 1,
  }));

  return publicUser(response.Items?.[0]);
}

async function create(input) {
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    name: input.name,
    email: String(input.email).trim().toLowerCase(),
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  if (useLocalStore()) {
    const users = await readLocalUsers();
    const exists = users.some((user) => user.email === item.email);

    if (exists) {
      const err = new Error('User already exists');
      err.statusCode = 409;
      throw err;
    }

    users.push(item);
    await writeLocalUsers(users);
    return publicUser(item);
  }

  try {
    await dynamo.send(new PutCommand({
      TableName: tableName(),
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      const err = new Error('User already exists');
      err.statusCode = 409;
      throw err;
    }

    throw error;
  }

  return publicUser(item);
}

module.exports = {
  findById,
  findOne,
  create,
};
