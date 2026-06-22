# Notification Serverless Service

This project replaces the containerized, poll-based `notification-service` with a fully serverless, event-driven notification engine on AWS. 

It is triggered by the `NotificationQueue` (from `image-pipeline-app`) and uses:
- **AWS DynamoDB**: For lightweight subscription configuration and delivery logs.
- **AWS SES**: For verified email delivery.
- **AWS AppSync (GraphQL)**: For real-time processing updates to frontend clients over WebSockets.

---

## Architecture Overview

```
[SQS NotificationQueue] ──> [sqsConsumer Lambda]
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      ▼                           ▼                           ▼
[AWS AppSync]              [AWS DynamoDB]                 [AWS SES]
 (WebSockets)            (Query subscriptions /          (Send Emails)
  Push real-time           Log histories)
  updates to frontend
```

### GraphQL API & Client Connection
AWS AppSync exposes a GraphQL schema that supports real-time WebSockets subscriptions.

#### 1. Mutation (Triggered by SQS Consumer)
```graphql
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
  }
}
```

#### 2. Subscription (Subscribed by Frontend Web/Mobile Client)
Clients connect via WebSockets (using Apollo Client, AWS Amplify, or raw WS) to listen to updates for a specific user:
```graphql
subscription OnProgressUpdate($userId: String!) {
  onProgressUpdate(userId: $userId) {
    jobId
    imageId
    userId
    eventType
    status
    timestamp
    metadata
  }
}
```

---

## DynamoDB Table Structures

### 1. Subscriptions Table (`notification-serverless-dev-subscriptions`)
Stores user preferences on what events to receive and where.
- **Partition Key (`Hash Key`)**: `userId` (String)
- **Sort Key (`Range Key`)**: `id` (String)
- **Attributes**:
  - `channel`: `'email' | 'webhook'` (String)
  - `destination`: `'user@example.com' | 'https://webhook.site/...'` (String)
  - `events`: `['image.resized', 'image.completed', 'image.failed']` (List of Strings)
  - `isActive`: `true | false` (Boolean)

### 2. Notification History Table (`notification-serverless-dev-history`)
Stores execution history.
- **Partition Key (`Hash Key`)**: `jobId` (String)
- **Sort Key (`Range Key`)**: `id` (String)
- **Attributes**:
  - `subscriptionId`: (String)
  - `eventId`: (String)
  - `status`: `'pending' | 'success' | 'failed'` (String)
  - `sentAt`: (String)
  - `retryCount`: (Number)
  - `lastError`: (String, optional)

---

## Local Setup & Deployment

### 1. Installation
Install the Serverless Framework AppSync plugin and Lambda dependencies:
```bash
# In the notification-serverless directory:
serverless plugin install --name serverless-appsync-plugin

# Install sqs-consumer function dependencies
cd functions/sqs-consumer
npm install
cd -
```

### 2. Deployment
Deploy to AWS (using dev or prod stage):
```bash
# Deploy to development
npx serverless deploy --stage dev --conceal

# Deploy to production
npx serverless deploy --stage prod --conceal
```

Upon successful production deployment, the stack generates:
*   **GraphQL Endpoint**: `https://slkwfm6c2vaszpnponhcxlxs6i.appsync-api.us-east-1.amazonaws.com/graphql`
*   **Realtime WebSocket Endpoint**: `wss://slkwfm6c2vaszpnponhcxlxs6i.appsync-realtime-api.us-east-1.amazonaws.com/graphql`
*   **API Key**: *(Will be output in AWS Console/CloudFormation outputs or dynamically retrieved)*

### 3. Verify SES Email (SES Sandbox)
If your AWS account is in the SES Sandbox:
- Go to the AWS Console -> SES -> Verified Identities.
- Verify the recipient email addresses and the sender email address (`EMAIL_FROM` configured in `serverless.yml`).

---

## Client Integration Guide

To consume real-time updates on a web/mobile client, connect to the AppSync service using the details below.

### Authenticating Requests
All client requests must include the API key header:
```http
x-api-key: <your-appsync-api-key>
Content-Type: application/json
```

### Option A: Connecting with Apollo Client
You can use `aws-appsync` or standard Apollo client links. Here is a connection configuration template:

```javascript
import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { ApolloLink } from '@apollo/client/link/core';
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link';

const url = 'https://slkwfm6c2vaszpnponhcxlxs6i.appsync-api.us-east-1.amazonaws.com/graphql';
const region = 'us-east-1';
const auth = {
  type: 'API_KEY',
  apiKey: '<your-appsync-api-key>',
};

const httpLink = createHttpLink({ uri: url });

const link = ApolloLink.from([
  createSubscriptionHandshakeLink({ url, region, auth }, httpLink),
]);

const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});
```

### Option B: Connecting with AWS Amplify
Configure Amplify in your entry point:
```javascript
import { Amplify } from 'aws-amplify';

Amplify.configure({
  API: {
    GraphQL: {
      endpoint: 'https://slkwfm6c2vaszpnponhcxlxs6i.appsync-api.us-east-1.amazonaws.com/graphql',
      region: 'us-east-1',
      defaultAuthMode: 'apiKey',
      apiKey: '<your-appsync-api-key>'
    }
  }
});
```

---

## Verification & Seeding

### Seeding a Subscription (AWS CLI Example)
To receive email or webhook notifications, seed a subscription into the production subscriptions table:
```bash
aws dynamodb put-item \
  --table-name notification-serverless-prod-subscriptions \
  --item '{
    "userId": {"S": "user-999"},
    "id": {"S": "sub-111"},
    "channel": {"S": "email"},
    "destination": {"S": "your-verified-email@example.com"},
    "events": {"L": [{"S": "image.completed"}, {"S": "image.failed"}]},
    "isActive": {"BOOL": true}
  }'
```

Once added, any pipeline events (such as `image.completed`) containing `userId: "user-999"` will:
1. Dispatch an email update to `your-verified-email@example.com` via AWS SES.
2. Publish real-time state changes to the AppSync endpoint, notifying WebSocket clients listening to subscription `onProgressUpdate(userId: "user-999")`.

