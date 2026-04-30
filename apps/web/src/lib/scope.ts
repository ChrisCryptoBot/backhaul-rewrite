import type { AccessContext } from "./rbac";
import { prisma } from "./db";
import { getPhase1RegionCode } from "./env";
import { PolicyViolationError } from "./policy-error";

let cachedPhase1RegionId: string | null = null;

export async function resolvePhase1RegionId(): Promise<string> {
  if (cachedPhase1RegionId) {
    return cachedPhase1RegionId;
  }

  const PHASE1_REGION_CODE = getPhase1RegionCode();
  const region = await prisma.region.findUnique({
    where: { code: PHASE1_REGION_CODE },
    select: { id: true }
  });

  if (!region) {
    throw new Error(`Phase 1 region code ${PHASE1_REGION_CODE} is not seeded`);
  }

  cachedPhase1RegionId = region.id;
  return region.id;
}

export async function assertRegionAccess(ctx: AccessContext, regionId: string): Promise<void> {
  const phase1RegionId = await resolvePhase1RegionId();
  if (ctx.regionId !== phase1RegionId) {
    throw new PolicyViolationError(`Phase 1 is configured for region ${phase1RegionId}. Received ${ctx.regionId}`);
  }

  if (regionId !== ctx.regionId) {
    throw new PolicyViolationError(`User region ${ctx.regionId} cannot access ${regionId}`);
  }
}
