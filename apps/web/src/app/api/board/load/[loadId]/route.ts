import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireRegionAccess } from "@/lib/access";
import { resolvePhase1RegionId } from "@/lib/scope";
import { isAuthBypassed } from "@/lib/auth-mode";
import { POLICY_FORBIDDEN_MESSAGE, PolicyViolationError } from "@/lib/policy-error";
import { getLoadDetail } from "@/server/board-detail";

interface Params {
  params: { loadId: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { userId } = await auth();
    const bypassAuth = isAuthBypassed();
    if (!bypassAuth && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const actorUserId = userId ?? "dev-bypass-user";

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

    const payload = await getLoadDetail({
      regionId,
      loadId: params.loadId
    });
    if (!payload) {
      return NextResponse.json({ error: "Load not found" }, { status: 404 });
    }
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof PolicyViolationError) {
      return NextResponse.json({ error: POLICY_FORBIDDEN_MESSAGE }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
