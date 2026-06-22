# API Gateway

Single public facade for the frontend. The frontend should call this API only, and this gateway invokes internal Lambda services directly.

## Routes

- `GET /health` checks the gateway.
- `/api/auth/*` invokes `AUTH_SERVICE_FUNCTION_NAME`.
- `/api/pipeline/*` invokes `AUTH_SERVICE_FUNCTION_NAME` because auth-service owns authenticated upload and pipeline forwarding.
- `/api/notifications/users/{userId}/subscriptions` invokes notification subscription Lambdas.

Only this service should expose an API Gateway. The downstream services should not have `events: http` in their `serverless.yml`.

## Deploy

```bash
cd backend/api-gateway
npm install
FRONTEND_API_KEY=replace-with-at-least-20-characters \
npx serverless deploy --stage prod --region ap-southeast-2 --conceal
```

Default internal Lambda names are:

```text
auth-service-{stage}-api
notification-serverless-{stage}-saveSubscription
notification-serverless-{stage}-getSubscriptions
```

Override them when needed:

```bash
AUTH_SERVICE_FUNCTION_NAME=auth-service-prod-api
NOTIFICATION_SAVE_SUBSCRIPTION_FUNCTION_NAME=notification-serverless-prod-saveSubscription
NOTIFICATION_GET_SUBSCRIPTIONS_FUNCTION_NAME=notification-serverless-prod-getSubscriptions
```

Use the deployed gateway URL as the frontend `VITE_API_GATEWAY_URL`, and use the same `FRONTEND_API_KEY` value as `VITE_API_GATEWAY_KEY`.

## Removing Old Public APIs

The old APIs in AWS were created by HTTP events in other services. After deploying the updated service configs, remove/redeploy the old stacks:

```bash
cd backend/image-pipeline-app
npx serverless deploy --stage prod --region ap-southeast-2

cd ../notification-serverless
AWS_ACCOUNT_ID=your-aws-account-id \
npx serverless deploy --stage prod --region ap-southeast-2

cd ../auth-service
npx serverless deploy --stage prod --region ap-southeast-2

cd ../api-gateway
FRONTEND_API_KEY=replace-with-at-least-20-characters \
npx serverless deploy --stage prod --region ap-southeast-2
```

If a stack is no longer needed, remove it with `npx serverless remove --stage prod --region ap-southeast-2`. Do not delete shared resources manually unless you know which stack owns them.
