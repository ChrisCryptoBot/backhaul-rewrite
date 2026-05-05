import { enqueueJob } from "@/server/queue";
import type { QueueJobPayload } from "@/contracts/queue";

export interface WorkerOrchestratorAdapter {
  enqueue(queueUrl: string, payload: QueueJobPayload): Promise<void>;
}

class DefaultWorkerOrchestratorAdapter implements WorkerOrchestratorAdapter {
  async enqueue(queueUrl: string, payload: QueueJobPayload): Promise<void> {
    await enqueueJob(queueUrl, payload);
  }
}

export const workerOrchestratorAdapter: WorkerOrchestratorAdapter = new DefaultWorkerOrchestratorAdapter();

