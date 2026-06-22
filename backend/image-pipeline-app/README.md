# Image Processing Serverless Pipeline

This project refactors the monolithic image processing stages into a series of decoupled, serverless functions on AWS Lambda. The functions communicate asynchronously via AWS SQS (Message Broker) and persist intermediate/final assets on AWS S3.

## Architectural Overview

Each processing stage runs as an isolated serverless function triggered by its own SQS queue. This architecture improves reliability, horizontal scalability, and allows stages to be retried independently.

```
[Client] ──(POST /process)──> [00-start]
                                │
                      (Uploads input to S3)
                                │
                          [ResizeQueue]
                                │
                                v
                          [01-resize]
                                │
                          [FilterQueue]
                                │
                                v
                          [02-filter]
                                │
                         [WatermarkQueue]
                                │
                                v
                         [03-watermark]
                                │
                          [CompressQueue]
                                │
                                v
                          [04-compress] ──(Saves final image)──> [S3 Bucket]
```

### SQS Message Payload (Pipeline Data)

Each queue message passes the complete processing state (context) down the pipeline:

```json
{
  "jobId": "uuid-string",
  "imageId": "uuid-string",
  "userId": "user-string",
  "s3Bucket": "bucket-name",
  "s3Key": "processed/jobId/stage-output.jpg",
  "options": {
    "resize": { "width": 800, "height": 600, "fit": "cover" },
    "filter": { "type": "sepia", "value": 1.2 },
    "watermark": {
      "type": "text",
      "text": "Copyright 2026",
      "position": "bottom-right",
      "opacity": 0.5
    },
    "compression": { "format": "png", "quality": 85 }
  },
  "metadata": {
    "width": 1920,
    "height": 1080,
    "format": "jpeg",
    "size": 204857
  },
  "logs": [
    {
      "stage": "InputStage",
      "status": "completed",
      "message": "Uploaded successfully",
      "timestamp": "2026-05-26T14:40:00Z"
    }
  ]
}
```

### SQS Notification Payload

At the end of each stage, functions push a status update to the `NotificationQueue`. The message payload adheres to the `IEvent` interface structure:

```json
{
  "eventId": "uuid-string",
  "eventType": "image.processing.started | image.resized | image.filtered | image.watermarked | image.completed | image.failed",
  "timestamp": "2026-05-26T21:30:00.000Z",
  "source": "image-pipeline-app",
  "data": {
    "jobId": "job-uuid",
    "imageId": "image-uuid",
    "userId": "user-uuid",
    "metadata": {
      "width": 800,
      "height": 600,
      "format": "png",
      "size": 123456
    }
  }
}
```

---

## Local Development & Setup

### 1. Prerequisites

- Node.js 20+
- AWS CLI configured with credentials
- Serverless Framework CLI (`npm install -g serverless`)

### 2. Install Dependencies

Run npm install in each function subdirectory:

```bash
cd functions/00-start && npm install && cd -
cd functions/01-resize && npm install && cd -
cd functions/02-filter && npm install && cd -
cd functions/03-watermark && npm install && cd -
cd functions/04-compress && npm install && cd -
```

> [!WARNING]
> **AWS Lambda & Sharp Platform Match:**
> AWS Lambda runs on Linux x64 or ARM64. If you run npm install on macOS or Windows, the installed native binary for `sharp` will not work on Lambda, causing `ELF Header invalid` errors.
> To package `sharp` correctly for Linux x64 Lambda, install it with the target flags:
>
> ```bash
> npm install --os=linux --cpu=x64 sharp
> ```

---

## Deployment

Deploy the stack to AWS using Serverless CLI:

```bash
serverless deploy --stage dev
```

Upon successful deployment, Serverless will output the HTTP endpoint for the `startPipeline` function (e.g., `POST https://xxxx.execute-api.us-east-1.amazonaws.com/dev/process`).

---

## Integrating Notification Service with SQS

Currently, the `notification-service` is listening to `image-processing-events` via Kafka (`KafkaConsumer.ts`). Since the pipeline now sends status events to AWS SQS, you can update the notification service to consume messages from the AWS SQS `NotificationQueue`.

### Step 1: Install SQS Client in Notification Service

```bash
npm install @aws-sdk/client-sqs
```

### Step 2: Implement SQS Consumer

Create `SQSConsumer.ts` in `notification-service/src/infrastructure/messaging/`:

```typescript
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
} from "@aws-sdk/client-sqs";
import { ProcessEvent } from "../../application/use-cases/ProcessEvent";
import { config } from "../../config/env";

export class SQSConsumer {
  private sqs: SQSClient;
  private queueName: string;
  private queueUrl?: string;
  private processEvent = new ProcessEvent();
  private isRunning = false;

  constructor() {
    this.sqs = new SQSClient({ region: config.aws.region });
    this.queueName = config.aws.notificationQueueName;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`SQS Consumer starting, resolving queue: ${this.queueName}...`);

    try {
      const response = await this.sqs.send(
        new GetQueueUrlCommand({
          QueueName: this.queueName,
        }),
      );
      this.queueUrl = response.QueueUrl;
      console.log(`Successfully resolved SQS Queue URL: ${this.queueUrl}`);
    } catch (err: any) {
      console.error(`Failed to resolve SQS Queue URL:`, err.message);
      this.isRunning = false;
      return;
    }

    while (this.isRunning && this.queueUrl) {
      try {
        const response = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl!,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20, // Long polling
          }),
        );

        if (!response.Messages) continue;

        for (const message of response.Messages) {
          if (message.Body) {
            const eventData = JSON.parse(message.Body);
            await this.processEvent.execute(eventData);
          }

          // Delete message from queue after processing successfully
          await this.sqs.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl!,
              ReceiptHandle: message.ReceiptHandle!,
            }),
          );
        }
      } catch (err: any) {
        console.error("Error polling SQS messages", err.message);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Backoff on error
      }
    }
  }

  stop(): void {
    this.isRunning = false;
  }
}
```

This enables the notification service to seamlessly pick up events from SQS and trigger webhooks or emails based on user subscriptions!
