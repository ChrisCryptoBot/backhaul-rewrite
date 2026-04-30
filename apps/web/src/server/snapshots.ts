import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { safeDivideDecimal } from "@/lib/decimal-utils";

async function recomputeWithClient(
  tx: Prisma.TransactionClient | PrismaClient,
  regionId: string,
  weekIso: string,
  actorId: string
): Promise<void> {
    const rawLoads = await tx.load.findMany({
      where: {
        regionId,
        weekIso,
        deletedAt: null
      }
    });
    const loads = rawLoads.filter(
      (load) =>
        (load as { status?: string }).status !== "CANCELED" &&
        (load as { status?: string }).status !== "FAILED"
    );

    const lineHaulRevenue = loads.reduce((acc, load) => acc.plus(load.lineHaulRate), new Prisma.Decimal(0));
    const fuelSurchargeAmount = loads.reduce((acc, load) => acc.plus(load.fscAmount), new Prisma.Decimal(0));
    const totalLoadedMiles = loads.reduce((acc, load) => acc.plus(load.loadedMiles), new Prisma.Decimal(0));
    const totalPickupDeadhead = loads.reduce((acc, load) => acc.plus(load.puDeadheadMiles), new Prisma.Decimal(0));
    const totalDeliveryDeadhead = loads.reduce((acc, load) => acc.plus(load.delDeadheadMiles), new Prisma.Decimal(0));
    const totalEmptyMiles = totalPickupDeadhead.plus(totalDeliveryDeadhead);
    const totalTripMiles = totalLoadedMiles.plus(totalEmptyMiles);
    const emptyMilePct = safeDivideDecimal(totalEmptyMiles, totalTripMiles);
    const negFloorDenominator = totalLoadedMiles.plus(totalPickupDeadhead);
    const negFloorRpm = safeDivideDecimal(lineHaulRevenue, negFloorDenominator);

    const existing = await tx.weekSnapshot.findUnique({
      where: {
        regionId_weekIso: {
          regionId,
          weekIso
        }
      }
    });

    if (!existing) {
      // See note in review.ts re: narrow cast at Prisma boundary.
      const createData = {
        regionId,
        weekIso,
        loadCount: loads.length,
        lineHaulRevenue,
        fuelSurchargeAmount,
        totalLoadedMiles,
        totalPickupDeadhead,
        totalDeliveryDeadhead,
        totalEmptyMiles,
        totalTripMiles,
        emptyMilePct,
        negFloorRpm
      } as Prisma.WeekSnapshotUncheckedCreateInput;

      await tx.weekSnapshot.create({
        data: createData
      });
      return;
    }

    if (existing.lockedAt) {
      await tx.auditLog.create({
        data: createAuditLog({
          entityType: "WeekSnapshot",
          entityId: existing.id,
          action: "UPDATE_BLOCKED",
          actorId,
          timestamp: new Date(),
          reason: "WeekSnapshot is immutable once lockedAt is set"
        })
      })
      throw new Error("WeekSnapshot is immutable");
    }

    const updateData = {
      loadCount: loads.length,
      lineHaulRevenue,
      fuelSurchargeAmount,
      totalLoadedMiles,
      totalPickupDeadhead,
      totalDeliveryDeadhead,
      totalEmptyMiles,
      totalTripMiles,
      emptyMilePct,
      negFloorRpm,
      computedAt: new Date()
    } as Prisma.WeekSnapshotUncheckedUpdateInput;

    await tx.weekSnapshot.update({
      where: { id: existing.id },
      data: updateData
    });
}

export async function recomputeWeekSnapshot(
  regionId: string,
  weekIso: string,
  actorId: string,
  db?: PrismaClient | Prisma.TransactionClient
): Promise<void> {
  if (db) {
    await recomputeWithClient(db, regionId, weekIso, actorId);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await recomputeWithClient(tx, regionId, weekIso, actorId);
  });
}
