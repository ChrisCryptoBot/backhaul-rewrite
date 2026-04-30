import { beforeEach, describe, expect, test, vi } from "vitest";
import { PolicyViolationError } from "@/lib/policy-error";

const auth = vi.fn();
const requireRegionAccess = vi.fn();
const resolvePhase1RegionId = vi.fn();
const getBoardResponse = vi.fn();
const isAuthBypassed = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth
}));

vi.mock("@/lib/access", () => ({
  requireRegionAccess
}));

vi.mock("@/lib/scope", () => ({
  resolvePhase1RegionId
}));

vi.mock("@/server/board", () => ({
  getBoardResponse
}));

vi.mock("@/lib/auth-mode", () => ({
  isAuthBypassed
}));

describe("GET /api/board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthBypassed.mockReturnValue(false);
    resolvePhase1RegionId.mockResolvedValue("region-1");
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    getBoardResponse.mockResolvedValue({
      regionId: "region-1",
      date: "2026-04-29",
      sections: [],
      dayTotals: {
        loadCount: 0,
        lineHaulTotal: "0",
        loadedMilesTotal: "0",
        emptyMilePct: null,
        negFloorRpm: null
      }
    });
  });

  test("returns 401 for unauthenticated requests", async () => {
    auth.mockResolvedValue({ userId: null });
    const { GET } = await import("@/app/api/board/route");
    const response = await GET(new Request("http://localhost/api/board?date=2026-04-29"));
    expect(response.status).toBe(401);
  });

  test("returns 400 for invalid date query", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    const { GET } = await import("@/app/api/board/route");
    const response = await GET(new Request("http://localhost/api/board?date=bad-date"));
    expect(response.status).toBe(400);
  });

  test("returns 400 when date query is missing", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    const { GET } = await import("@/app/api/board/route");
    const response = await GET(new Request("http://localhost/api/board"));
    expect(response.status).toBe(400);
  });

  test("returns 403 for policy denials", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockRejectedValue(new PolicyViolationError("Forbidden for region"));
    const { GET } = await import("@/app/api/board/route");
    const response = await GET(new Request("http://localhost/api/board?date=2026-04-29"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  test("returns board payload for valid requests", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    const { GET } = await import("@/app/api/board/route");
    const response = await GET(new Request("http://localhost/api/board?date=2026-04-29"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.date).toBe("2026-04-29");
    expect(getBoardResponse).toHaveBeenCalledWith({
      regionId: "region-1",
      date: "2026-04-29"
    });
  });

  test("returns fallback payload in bypass mode when region lookup fails", async () => {
    isAuthBypassed.mockReturnValue(true);
    auth.mockResolvedValue({ userId: null });
    resolvePhase1RegionId.mockRejectedValue(new Error("not seeded"));
    getBoardResponse.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("@/app/api/board/route");
    const response = await GET(new Request("http://localhost/api/board?date=bad-date"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.regionId).toBe("dev-region");
    expect(body.sections).toHaveLength(2);
  });
});
