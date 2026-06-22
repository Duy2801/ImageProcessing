# API Gateway

Single public facade for the frontend. The frontend should call this API only, and this gateway forwards requests to the internal service APIs.

## Routes

- `GET /health` checks the gateway.
- `/api/auth/*` proxies to `AUTH_SERVICE_URL`.
- `/api/pipeline/*` proxies to `AUTH_SERVICE_URL` because auth-service owns authenticated upload and pipeline forwarding.
- `/api/notifications/*` proxies to `NOTIFICATION_SERVICE_URL` when configured.

## Deploy

```bash
cd backend/api-gateway
npm install
AUTH_SERVICE_URL=https://your-auth-api.execute-api.ap-southeast-2.amazonaws.com/prod \
FRONTEND_API_KEY=replace-with-at-least-20-characters \
npx serverless deploy --stage prod --region ap-southeast-2 --conceal
```

Use the deployed gateway URL as the frontend `VITE_API_GATEWAY_URL`, and use the same `FRONTEND_API_KEY` value as `VITE_API_GATEWAY_KEY`.
