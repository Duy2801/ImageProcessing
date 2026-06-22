# Auth Service

Serverless authentication API for the image processing test UI.

## AWS Resources

`serverless.yml` deploys:

- API Gateway HTTP endpoints
- One Lambda handler: `src/lambda.handler`
- DynamoDB table: `auth-service-{stage}-users`
- DynamoDB GSI: `email-index`
- IAM permissions for DynamoDB and S3 upload into the image pipeline bucket

The S3 bucket is expected to match the image pipeline convention:

```text
image-pipeline-bucket-{stage}-{awsAccountId}
```

## Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/pipeline/process`
- `POST /api/pipeline/upload-and-process`
- `GET /health`

## Deploy

```bash
cd backend/auth-service
npm install
npx serverless deploy --stage prod --region ap-southeast-2 --conceal
```

Required environment variables for deploy:

```env
JWT_SECRET=replace-with-a-long-random-secret
PIPELINE_API_URL=https://your-pipeline-api.execute-api.ap-southeast-2.amazonaws.com/prod
CORS_ORIGIN=http://localhost:5173
```

For GitHub Actions, add repository secrets:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
JWT_SECRET
PIPELINE_API_URL
CORS_ORIGIN
```

After deploy, set the frontend API base to the Auth Service API Gateway URL.
