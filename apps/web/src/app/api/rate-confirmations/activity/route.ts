import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRegionAccess } from "@/lib/access";
import { resolvePhase1RegionId } from "@/lib/scope";
import { isAuthBypassed } from "@/lib/auth-mode";
import { POLICY_FORBIDDEN_MESSAGE, PolicyViolationError } from "@/lib/policy-error";
import { getRateConfirmationActivity } from "@/server/rate-confirmation-activity";
import { isIsoDay, todayIsoInTimeZone } from "@/lib/board-date";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    const bypassAuth = isAuthBypassed();
    if (!bypassAuth && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const actorUserId = userId ?? "dev-bypass-user";
    const dateParam = new URL(request.url).searchParams.get("date");
    const date = bypassAuth ? (isIsoDay(dateParam) ? dateParam : todayIsoInTimeZone()) : schema.parse({ date: dateParam }).date;

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

    const payload = await getRateConfirmationActivity({ regionId, date });
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
