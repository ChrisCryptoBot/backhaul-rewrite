import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRegionAccess } from "@/lib/access";
import { resolvePhase1RegionId } from "@/lib/scope";
import { isAuthBypassed } from "@/lib/auth-mode";
import { POLICY_FORBIDDEN_MESSAGE, PolicyViolationError } from "@/lib/policy-error";
import { getKpiDashboard } from "@/server/kpi-dashboard";

const schema = z.object({
  weekIso: z.string().regex(/^\d{4}-W\d{2}$/)
});

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    const bypassAuth = isAuthBypassed();
    if (!bypassAuth && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const actorUserId = userId ?? "dev-bypass-user";

    const params = new URL(request.url).searchParams;
    const weekIso = schema.parse({ weekIso: params.get("weekIso") }).weekIso;

    let regionId = "dev-region";
    try {
      regionId = await resolvePhase1RegionId();
      if (!bypassAuth) {
        await requireRegionAccess(actorUserId, regionId);
      }
    } catch (error) {
      if (!bypassAuth) {
        throw error;
      }
    }

    const payload = await getKpiDashboard({ regionId, weekIso });
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid query params", details: error.issues }, { status: 400 });
    }
    if (error instanceof PolicyViolationError) {
      return NextResponse.json({ error: POLICY_FORBIDDEN_MESSAGE }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
