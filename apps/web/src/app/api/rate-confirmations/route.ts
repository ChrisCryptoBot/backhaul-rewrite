import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { computeContentHash, finalizeUpload } from "@/server/ingestion";
import { enqueueJob } from "@/server/queue";
import { getEnv } from "@/lib/env";
import { weekIsoFromPickup } from "@/lib/week";
import { requireRegionAccess } from "@/lib/access";
import { runInRegionScope } from "@/lib/db";
import { POLICY_FORBIDDEN_MESSAGE, PolicyViolationError } from "@/lib/policy-error";
import { IdempotencyConflictError } from "@/lib/idempotency-error";
import { isWriteBypassed } from "@/lib/auth-mode";

const uploadPayloadSchema = z
  .object({
    regionId: z.string().min(1),
    pickupDate: z.coerce.date(),
    sourceFileUrl: z.string().url().optional(),
    sourceFileName: z.string().min(1).optional(),
    fileContentBase64: z.string().min(1)
  })
  .refine((value) => Boolean(value.sourceFileUrl || value.sourceFileName), {
    message: "Provide sourceFileUrl or sourceFileName"
  });

function sourceUrlFromName(fileName: string, bucketName: string, awsRegion: string): string {
  const sanitized = fileName.trim().replace(/\s+/g, "_");
  const objectKey = `uploads/${Date.now()}-${sanitized}`;
  return `https://${bucketName}.s3.${awsRegion}.amazonaws.com/${encodeURIComponent(objectKey)}`;
}

function looksLikePdf(buffer: Buffer): boolean {
  if (buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function isPdfFileName(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  return value.trim().toLowerCase().endsWith(".pdf");
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const bypassWrites = isWriteBypassed();
    if (!bypassWrites && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const actorUserId = userId ?? "dev-bypass-user";

    const { S3_BUCKET_NAME, AWS_REGION } = getEnv();
    const payload = uploadPayloadSchema.parse(await request.json());
    const sourceFileUrl =
      payload.sourceFileUrl ?? sourceUrlFromName(payload.sourceFileName!, S3_BUCKET_NAME, AWS_REGION);
    const sourceUrl = new URL(sourceFileUrl);
    const validHosts = new Set([
      `${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`,
      `${S3_BUCKET_NAME}.s3.amazonaws.com`
    ]);
    if (!validHosts.has(sourceUrl.hostname)) {
      return NextResponse.json({ error: "sourceFileUrl must point to configured S3 bucket host" }, { status: 400 });
    }
    const pathName = decodeURIComponent(sourceUrl.pathname.split("/").pop() ?? "");
    if (!isPdfFileName(payload.sourceFileName) || !isPdfFileName(pathName)) {
      return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
    }
    const fileBuffer = Buffer.from(payload.fileContentBase64, "base64");
    if (!looksLikePdf(fileBuffer)) {
      return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
    }

    if (!bypassWrites) {
      await requireRegionAccess(actorUserId, payload.regionId);
    }

    const idempotencyKey = request.headers.get("Idempotency-Key") ?? undefined;
    const contentHash = computeContentHash(fileBuffer);
    const weekIso = weekIsoFromPickup(payload.pickupDate);

    const result = await runInRegionScope(payload.regionId, async (tx) =>
      finalizeUpload({
        regionId: payload.regionId,
        weekIso,
        sourceFileUrl,
        sourceFileHash: contentHash,
        idempotencyKey,
        db: tx,
        enqueueParseJob: false
      })
    );

    // TODO: Persist fileContentBase64 to S3 at sourceFileUrl before enqueueing parse jobs.
    // Current Phase 1 wiring stores hash + metadata and relies on mocked/placeholder parse reads.
    await enqueueJob(getEnv().SQS_PARSE_QUEUE_URL, {
      regionId: payload.regionId,
      weekIso,
      entityId: result.rateConfirmationId,
      eventType: "PARSE_RATE_CON"
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof PolicyViolationError) {
      return NextResponse.json({ error: POLICY_FORBIDDEN_MESSAGE }, { status: 403 });
    }
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
