import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { getEnv } from "@/lib/env";

function getSqsClient() {
  const { AWS_REGION } = getEnv();
  return new SQSClient({ region: AWS_REGION });
}

export interface QueueJobPayload {
  regionId: string;
  weekIso: string;
  entityId: string;
  eventType: "PARSE_RATE_CON" | "RECOMPUTE_WEEK_SNAPSHOT";
}

export async function enqueueJob(queueUrl: string, payload: QueueJobPayload): Promise<void> {
  const sqs = getSqsClient();
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload)
    })
  );
}
