import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { isWriteBypassed } from "@/lib/auth-mode";
import { policyAdapter } from "@/domain/policy/policy-adapter";
import { POLICY_FORBIDDEN_MESSAGE, PolicyViolationError } from "@/lib/policy-error";
import { runInRegionScope } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { decodeLaneWeekMetadata, encodeLaneWeekMetadata } from "@/server/lane-week-metadata";

const laneNotePayloadSchema = z.object({
  regionId: z.string().min(1),
  weekIso: z.string().regex(/^\d{4}-W\d{2}$/),
  lane: z.string().min(1),
  note: z.string().max(500)
});

export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    const bypassWrites = isWriteBypassed();
    if (!bypassWrites && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const actorUserId = userId ?? "dev-bypass-user";

    const payload = laneNotePayloadSchema.parse(await request.json());

    const access = bypassWrites
      ? { userId: "dev-bypass-user", regionId: payload.regionId, role: "ADMIN" as const }
      : await policyAdapter.requireRegionAccess(actorUserId, payload.regionId);
    if (!bypassWrites) {
      policyAdapter.assertPermission(access, { resource: "KPI_DASHBOARD", action: "WRITE" });
    }

    await runInRegionScope(payload.regionId, async (tx) => {
      const existing = await tx.weekSnapshot.findUnique({
        where: { regionId_weekIso: { regionId: payload.regionId, weekIso: payload.weekIso } }
      });
      const currentMetadata = decodeLaneWeekMetadata(existing?.laneIssueNotes);
      const updatedNotes = { ...currentMetadata.notes };
      if (payload.note.trim()) {
        updatedNotes[payload.lane] = payload.note.trim();
      } else {
        delete updatedNotes[payload.lane];
      }
      await tx.weekSnapshot.upsert({
        where: { regionId_weekIso: { regionId: payload.regionId, weekIso: payload.weekIso } },
        update: {
          laneIssueNotes: encodeLaneWeekMetadata({
            notes: updatedNotes,
            marketRates: currentMetadata.marketRates
          })
        },
        create: {
          regionId: payload.regionId,
          weekIso: payload.weekIso,
          laneIssueNotes: encodeLaneWeekMetadata({
            notes: updatedNotes,
            marketRates: {}
          }),
          loadCount: 0,
          lineHaulRevenue: new Prisma.Decimal(0),
          fuelSurchargeAmount: new Prisma.Decimal(0),
          totalLoadedMiles: new Prisma.Decimal(0),
          totalPickupDeadhead: new Prisma.Decimal(0),
          totalDeliveryDeadhead: new Prisma.Decimal(0),
          totalEmptyMiles: new Prisma.Decimal(0),
          totalTripMiles: new Prisma.Decimal(0),
          totalAllInRevenue: new Prisma.Decimal(0),
          totalTonuAmount: new Prisma.Decimal(0),
          mileMaxMissingInbound: true
        }
      });
      await tx.auditLog.create({
        data: createAuditLog({
          entityType: "WeekSnapshot",
          entityId: `${payload.regionId}:${payload.weekIso}`,
          action: "UPDATE",
          actorId: actorUserId,
          timestamp: new Date(),
          reason: `Lane note updated for ${payload.lane}`,
          afterValue: { lane: payload.lane, note: payload.note }
        })
      });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof PolicyViolationError) {
      return NextResponse.json({ error: POLICY_FORBIDDEN_MESSAGE }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
