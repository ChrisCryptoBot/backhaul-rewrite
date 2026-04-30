import { beforeEach, describe, expect, test, vi } from "vitest";
import { PolicyViolationError } from "@/lib/policy-error";

const auth = vi.fn();
const requireRegionAccess = vi.fn();
const resolvePhase1RegionId = vi.fn();
const isAuthBypassed = vi.fn();
const getKpiDashboard = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/access", () => ({ requireRegionAccess }));
vi.mock("@/lib/scope", () => ({ resolvePhase1RegionId }));
vi.mock("@/lib/auth-mode", () => ({ isAuthBypassed }));
vi.mock("@/server/kpi-dashboard", () => ({ getKpiDashboard }));

describe("GET /api/kpi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthBypassed.mockReturnValue(false);
    resolvePhase1RegionId.mockResolvedValue("region-1");
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    getKpiDashboard.mockResolvedValue({ weekIso: "2026-W17", cards: [], lanes: [], trend: [], managementNotes: [], rules: [], comparisonWeekIso: null });
  });

  test("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValue({ userId: null });
    const { GET } = await import("@/app/api/kpi/route");
    const response = await GET(new Request("http://localhost/api/kpi?weekIso=2026-W17"));
    expect(response.status).toBe(401);
  });

  test("returns 400 for invalid weekIso", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    const { GET } = await import("@/app/api/kpi/route");
    const response = await GET(new Request("http://localhost/api/kpi?weekIso=bad"));
    expect(response.status).toBe(400);
  });

  test("returns 403 for policy denials", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockRejectedValue(new PolicyViolationError("Forbidden"));
    const { GET } = await import("@/app/api/kpi/route");
    const response = await GET(new Request("http://localhost/api/kpi?weekIso=2026-W17"));
    expect(response.status).toBe(403);
  });

  test("returns kpi payload for valid request", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    const { GET } = await import("@/app/api/kpi/route");
    const response = await GET(new Request("http://localhost/api/kpi?weekIso=2026-W17"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ weekIso: "2026-W17" });
  });
});
