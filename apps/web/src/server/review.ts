import { ParseState, Prisma, PrismaClient } from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { weekIsoFromPickup } from "@/lib/week";
import { runInRegionScope } from "@/lib/db";
import { ReviewConflictError, ReviewNotFoundError, ReviewValidationError } from "@/lib/review-errors";
import { computeLoadMetrics } from "./kpi";
import { assertWeekHasTuesdayFsc, getEffectiveFscRate } from "./fsc";
import { workerOrchestratorAdapter } from "@/domain/workers/orchestrator-adapter";
import { reviewContractVersion } from "@/contracts/review";

type ReviewDecisionState = "PENDING" | "APPROVED" | "REJECTED";

export interface CreateLoadInput {
  actorId: string;
  regionId: string;
  rateConfirmationId?: string | null;
  brokerId?: string;
  pickupDate: Date;
  bookingDate?: Date;
  dropLotId?: string;
  shipperName?: string;
  receiverName?: string;
  lineHaulRate: Prisma.Decimal;
  loadedMiles: Prisma.Decimal;
  puDeadheadMiles: Prisma.Decimal;
  delDeadheadMiles: Prisma.Decimal;
  fscApplies: boolean;
  driverType?: "SHUTTLE" | "PTP" | "LTL";
}

export interface ReviewRateConfirmation {
  contractVersion: string;
  id: string;
  parseState: string;
  reviewDecision: ReviewDecisionState;
  sourceFileUrl: string;
  extractedPayload: Record<string, unknown> | null;
  loadId: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewReason: string | null;
  intakeDriverType?: "SHUTTLE" | "PTP" | "LTL" | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualLoadInput {
  actorId: string;
  regionId: string;
  pickupDate: Date;
  shipperName?: string;
  receiverName?: string;
  lineHaulRate: Prisma.Decimal;
  loadedMiles: Prisma.Decimal;
  puDeadheadMiles: Prisma.Decimal;
  delDeadheadMiles: Prisma.Decimal;
  fscApplies: boolean;
  driverType?: "SHUTTLE" | "PTP" | "LTL";
}

export async function getRateConfirmationForReview(input: {
  regionId: string;
  rateConfirmationId: string;
  db?: PrismaClient | Prisma.TransactionClient;
}): Promise<ReviewRateConfirmation | null> {
  const db = input.db ?? prisma;
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      parseState: ParseState;
      reviewDecision: ReviewDecisionState;
      sourceFileUrl: string;
      extractedPayload: Prisma.JsonValue | null;
      reviewedAt: Date | null;
      reviewedById: string | null;
      reviewReason: string | null;
      intakeDriverType: "SHUTTLE" | "PTP" | "LTL" | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  >`SELECT "id", "parseState", "reviewDecision", "sourceFileUrl", "extractedPayload", "reviewedAt", "reviewedById", "reviewReason", "intakeDriverType", "createdAt", "updatedAt"
    FROM "RateConfirmation"
    WHERE "id" = ${input.rateConfirmationId}
      AND "regionId" = ${input.regionId}
      AND "deletedAt" IS NULL
    LIMIT 1`;
  const rc = rows[0] ?? null;
  if (!rc) {
    return null;
  }
  const load = await db.load.findFirst({
    where: { rateConfirmationId: rc.id },
    select: { id: true }
  });
  return {
    contractVersion: reviewContractVersion,
    id: rc.id,
    parseState: rc.parseState,
    reviewDecision: rc.reviewDecision,
    sourceFileUrl: rc.sourceFileUrl,
    extractedPayload: (rc.extractedPayload ?? null) as Record<string, unknown> | null,
    loadId: load?.id ?? null,
    reviewedAt: rc.reviewedAt?.toISOString() ?? null,
    reviewedById: rc.reviewedById,
    reviewReason: rc.reviewReason,
    intakeDriverType: rc.intakeDriverType,
    createdAt: rc.createdAt.toISOString(),
    updatedAt: rc.updatedAt.toISOString()
  };
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function readPickupDate(record: Record<string, unknown>): Date {
  const candidates = ["pickupDate", "puDate"];
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  throw new ReviewValidationError("Missing or invalid pickupDate in extracted payload.");
}

function readRequiredDecimal(record: Record<string, unknown>, key: string): Prisma.Decimal {
  const value = record[key];
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ReviewValidationError(`Missing ${key} in extracted payload.`);
  }
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new ReviewValidationError(`Invalid ${key} in extracted payload.`);
  }
}

function readOptionalDecimal(record: Record<string, unknown>, key: string, fallback = "0"): Prisma.Decimal {
  const value = record[key];
  if (typeof value === "number" || typeof value === "string") {
    try {
      return new Prisma.Decimal(value);
    } catch {
      return new Prisma.Decimal(fallback);
    }
  }
  return new Prisma.Decimal(fallback);
}

function readDriverType(record: Record<string, unknown>, key: string): "SHUTTLE" | "PTP" | "LTL" | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "SHUTTLE" || normalized === "PTP" || normalized === "LTL") {
    return normalized;
  }
  return undefined;
}

function mapExtractedPayloadToCreateLoadInput(input: {
  actorId: string;
  regionId: string;
  rateConfirmationId: string;
  intakeDriverType?: "SHUTTLE" | "PTP" | "LTL" | null;
  brokerId?: string;
  extractedPayload: Record<string, unknown>;
}): CreateLoadInput {
  return {
    actorId: input.actorId,
    regionId: input.regionId,
    rateConfirmationId: input.rateConfirmationId,
    brokerId: input.brokerId,
    pickupDate: readPickupDate(input.extractedPayload),
    bookingDate: new Date(),
    shipperName: readString(input.extractedPayload, "shipperName") ?? undefined,
    receiverName: readString(input.extractedPayload, "receiverName") ?? undefined,
    lineHaulRate: readRequiredDecimal(input.extractedPayload, "lineHaulRate"),
    loadedMiles: readRequiredDecimal(input.extractedPayload, "loadedMiles"),
    puDeadheadMiles: readOptionalDecimal(input.extractedPayload, "puDeadheadMiles"),
    delDeadheadMiles: readOptionalDecimal(input.extractedPayload, "delDeadheadMiles"),
    fscApplies: readBoolean(input.extractedPayload, "fscApplies", false),
    driverType: readDriverType(input.extractedPayload, "driverType") ?? input.intakeDriverType ?? undefined
  };
}

export async function approveRateConfirmationReview(input: {
  actorId: string;
  regionId: string;
  rateConfirmationId: string;
}): Promise<{ loadId: string; alreadyExisted: boolean }> {
  return runInRegionScope(input.regionId, async (tx) => {
    const rc = await getRateConfirmationForReview({
      db: tx,
      regionId: input.regionId,
      rateConfirmationId: input.rateConfirmationId
    });
    if (!rc) {
      throw new ReviewNotFoundError("Rate confirmation not found.");
    }
    if (rc.reviewDecision === "REJECTED") {
      throw new ReviewConflictError("Rate confirmation is marked as rejected.");
    }
    if (rc.loadId) {
      return { loadId: rc.loadId, alreadyExisted: true };
    }
    if (rc.parseState !== ParseState.EXTRACTED) {
      throw new ReviewConflictError("Rate confirmation is not ready for approval.");
    }

    const extracted = rc.extractedPayload ?? {};
    const brokerName = readString(extracted, "brokerName");
    const broker =
      brokerName === null
        ? null
        : await tx.broker.findFirst({
            where: {
              regionId: input.regionId,
              deletedAt: null,
              name: { equals: brokerName, mode: "insensitive" }
            },
            select: { id: true }
          });

    const loadInput = mapExtractedPayloadToCreateLoadInput({
      actorId: input.actorId,
      regionId: input.regionId,
      rateConfirmationId: rc.id,
      intakeDriverType: rc.intakeDriverType,
      brokerId: broker?.id,
      extractedPayload: extracted
    });
    const result = await createLoadFromReview(loadInput, tx);
    // Design note: reviewedAt/reviewedById represent latest decision metadata.
    // Upload-time acceptance may have set these fields earlier; AuditLog stores full event history.
    await tx.$executeRaw`UPDATE "RateConfirmation"
      SET "reviewDecision" = 'APPROVED'::"ReviewDecision",
          "reviewedAt" = ${new Date()},
          "reviewedById" = ${input.actorId},
          "reviewReason" = NULL
      WHERE "id" = ${rc.id}`;
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "RateConfirmation",
        entityId: rc.id,
        action: "CONFIRM_REVIEW",
        actorId: input.actorId,
        timestamp: new Date(),
        afterValue: {
          loadId: result.loadId
        }
      })
    });
    return { loadId: result.loadId, alreadyExisted: false };
  });
}

export async function rejectRateConfirmationReview(input: {
  actorId: string;
  regionId: string;
  rateConfirmationId: string;
  reason?: string | null;
}): Promise<{ reviewDecision: ReviewDecisionState }> {
  return runInRegionScope(input.regionId, async (tx) => {
    const rc = await getRateConfirmationForReview({
      db: tx,
      regionId: input.regionId,
      rateConfirmationId: input.rateConfirmationId
    });
    if (!rc) {
      throw new ReviewNotFoundError("Rate confirmation not found.");
    }
    if (rc.loadId) {
      throw new ReviewConflictError("Rate confirmation already linked to a load.");
    }
    await tx.$executeRaw`UPDATE "RateConfirmation"
      SET "reviewDecision" = 'REJECTED'::"ReviewDecision",
          "reviewedAt" = ${new Date()},
          "reviewedById" = ${input.actorId},
          "reviewReason" = ${input.reason ?? null}
      WHERE "id" = ${rc.id}`;
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "RateConfirmation",
        entityId: rc.id,
        action: "REJECT_REVIEW",
        actorId: input.actorId,
        timestamp: new Date(),
        reason: input.reason ?? undefined
      })
    });
    return { reviewDecision: "REJECTED" };
  });
}

export async function createLoadFromReview(
  input: CreateLoadInput,
  db: Prisma.TransactionClient | PrismaClient = prisma
): Promise<{ loadId: string }> {
  const { SQS_RECOMPUTE_QUEUE_URL } = getEnv();
  const derivedWeekIso = weekIsoFromPickup(input.pickupDate);
  if (input.fscApplies) {
    await assertWeekHasTuesdayFsc(input.regionId, derivedWeekIso, db);
  }
  const resolvedFscRate = input.fscApplies ? await getEffectiveFscRate(input.regionId, derivedWeekIso, db) : null;
  const metrics = computeLoadMetrics({
    lineHaulRate: input.lineHaulRate,
    loadedMiles: input.loadedMiles,
    puDeadheadMiles: input.puDeadheadMiles,
    delDeadheadMiles: input.delDeadheadMiles,
    fscApplies: input.fscApplies,
    fscRateUsed: resolvedFscRate
  });

  // NOTE: Prisma types imported from @prisma/client can lag this repo's custom
  // generator output path during local typecheck. Keep this narrow cast at the
  // DB boundary instead of broad `as never` usage in callers/tests.
  const loadCreateData = {
    regionId: input.regionId,
    weekIso: derivedWeekIso,
    pickupDate: input.pickupDate,
    status: "BOOKED",
    createdById: input.actorId,
    bookingDate: input.bookingDate ?? input.pickupDate,
    dropLotId: input.dropLotId,
    shipperName: input.shipperName,
    receiverName: input.receiverName,
    brokerId: input.brokerId,
    rateConfirmationId: input.rateConfirmationId ?? null,
    pickupNumbers: [],
    lineHaulRate: input.lineHaulRate,
    loadedMiles: input.loadedMiles,
    puDeadheadMiles: input.puDeadheadMiles,
    delDeadheadMiles: input.delDeadheadMiles,
    fscApplies: input.fscApplies,
    fscRateUsed: resolvedFscRate,
    fscAmount: metrics.fscAmount,
    allInRevenue: metrics.allInRevenue,
    totalTripMiles: metrics.totalTripMiles,
    negotiableMiles: metrics.negotiableMiles,
    loadedRpm: metrics.loadedRpm,
    negotiationFloorRpm: metrics.negotiationFloorRpm,
    emptyMilePct: metrics.emptyMilePct,
    driverType: input.driverType
  } as Prisma.LoadUncheckedCreateInput;

  const load = await db.load.create({
    data: loadCreateData
  });

  await db.auditLog.create({
    data: createAuditLog({
      entityType: "Load",
      entityId: load.id,
      action: "CREATE",
      actorId: input.actorId,
      timestamp: new Date(),
      afterValue: {
        regionId: input.regionId,
        weekIso: derivedWeekIso
      }
    })
  });

  await workerOrchestratorAdapter.enqueue(SQS_RECOMPUTE_QUEUE_URL, {
    regionId: input.regionId,
    weekIso: derivedWeekIso,
    entityId: load.id,
    eventType: "RECOMPUTE_WEEK_SNAPSHOT"
  });

  return { loadId: load.id };
}

export async function createManualLoad(input: ManualLoadInput): Promise<{ loadId: string }> {
  return runInRegionScope(input.regionId, async (tx) =>
    createLoadFromReview(
      {
        actorId: input.actorId,
        regionId: input.regionId,
        rateConfirmationId: null,
        pickupDate: input.pickupDate,
        bookingDate: input.pickupDate,
        shipperName: input.shipperName,
        receiverName: input.receiverName,
        lineHaulRate: input.lineHaulRate,
        loadedMiles: input.loadedMiles,
        puDeadheadMiles: input.puDeadheadMiles,
        delDeadheadMiles: input.delDeadheadMiles,
        fscApplies: input.fscApplies,
        driverType: input.driverType
      },
      tx
    )
  );
}
