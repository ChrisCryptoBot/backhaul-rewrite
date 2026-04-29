import crypto from "node:crypto";
import { ParseState, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { enqueueJob } from "./queue";
import { IdempotencyConflictError } from "@/lib/idempotency-error";

export function computeContentHash(fileBuffer: Buffer): string {
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

export async function finalizeUpload(input: {
  regionId: string;
  weekIso: string;
  sourceFileUrl: string;
  sourceFileHash: string;
  idempotencyKey?: string;
  db?: PrismaClient | Prisma.TransactionClient;
  enqueueParseJob?: boolean;
}): Promise<{ rateConfirmationId: string }> {
  const { SQS_PARSE_QUEUE_URL } = getEnv();
  const db = input.db ?? prisma;
  const enqueueParseJob = input.enqueueParseJob ?? true;
  if (input.idempotencyKey) {
    const existingByIdempotency = await db.rateConfirmation.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (existingByIdempotency) {
      if (existingByIdempotency.sourceFileHash !== input.sourceFileHash) {
        throw new IdempotencyConflictError("Idempotency-Key conflict: payload hash differs from existing request");
      }
      return { rateConfirmationId: existingByIdempotency.id };
    }
  }

  const existing = await db.rateConfirmation.findUnique({
    where: { sourceFileHash: input.sourceFileHash }
  });
  if (existing) {
    return { rateConfirmationId: existing.id };
  }

  const rateConfirmation = await db.rateConfirmation.create({
    data: {
      regionId: input.regionId,
      weekIso: input.weekIso,
      sourceFileUrl: input.sourceFileUrl,
      sourceFileHash: input.sourceFileHash,
      idempotencyKey: input.idempotencyKey,
      parseState: ParseState.UPLOADED
    }
  });

  if (enqueueParseJob) {
    await enqueueJob(SQS_PARSE_QUEUE_URL, {
      regionId: input.regionId,
      weekIso: input.weekIso,
      entityId: rateConfirmation.id,
      eventType: "PARSE_RATE_CON"
    });
  }

  return { rateConfirmationId: rateConfirmation.id };
}

export function mapParseFailure(
  _confidence: number,
  code: "invalid" | "timeout" | "schema" | "low-confidence"
): ParseState {
  if (code === "invalid") {
    return ParseState.FAILED_INVALID;
  }
  if (code === "timeout") {
    return ParseState.FAILED_TIMEOUT;
  }
  if (code === "schema") {
    return ParseState.FAILED_SCHEMA;
  }
  return ParseState.FAILED_LOW_CONFIDENCE;
}
