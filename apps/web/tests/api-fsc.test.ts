import { beforeEach, describe, expect, test, vi } from "vitest";
import { PolicyViolationError } from "@/lib/policy-error";

const auth = vi.fn();
const requireRegionAccess = vi.fn();
const runInRegionScope = vi.fn();
const upsertFscIndex = vi.fn();
const isWriteBypassed = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth
}));

vi.mock("@/lib/access", () => ({
  requireRegionAccess
}));

vi.mock("@/lib/db", () => ({
  runInRegionScope
}));

vi.mock("@/server/fsc", () => ({
  upsertFscIndex
}));

vi.mock("@/lib/auth-mode", () => ({
  isWriteBypassed
}));

describe("POST /api/fsc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isWriteBypassed.mockReturnValue(false);
    upsertFscIndex.mockResolvedValue(undefined);
    runInRegionScope.mockImplementation(async (_regionId: string, fn: () => Promise<unknown>) => fn());
  });

  test("rejects non-canonical FSC source strings", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "manual_override"
        })
      })
    );
    expect(response.status).toBe(400);
  }, 10000);

  test("returns 401 for unauthenticated requests", async () => {
    auth.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "manual-override"
        })
      })
    );
    expect(response.status).toBe(401);
  });

  test("rejects invalid source values", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "invalid"
        })
      })
    );
    expect(response.status).toBe(400);
  });

  test("rejects users without region role mapping", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockRejectedValue(new PolicyViolationError("Forbidden"));
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "manual-override"
        })
      })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  test("returns 500 when region access lookup fails unexpectedly", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockRejectedValue(new Error("database timeout"));
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "manual-override"
        })
      })
    );
    expect(response.status).toBe(500);
  });

  test("accepts canonical source and maps to db enum", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "REGIONAL_MANAGER" });
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "manual-override"
        })
      })
    );
    expect(response.status).toBe(201);
    expect(upsertFscIndex).toHaveBeenCalledTimes(1);
    expect(upsertFscIndex.mock.calls[0][0].source).toBe("manual_override");
  });

  test("returns 403 for FSC governance policy violations", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    upsertFscIndex.mockRejectedValue(new PolicyViolationError("Only REGIONAL_MANAGER or ADMIN can create FSC overrides"));
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "manual-override"
        })
      })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  test("returns 500 for unexpected server errors", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "REGIONAL_MANAGER" });
    upsertFscIndex.mockRejectedValue(new Error("database unavailable"));
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "manual-override"
        })
      })
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "Internal server error" });
  });

  test.each([
    ["0", 400],
    ["0.0000", 400],
    ["0.0001", 201],
    ["5", 201],
    ["5.0001", 400],
    ["4.9999", 201]
  ])("validates FSC bounds for value=%s", async (value, expectedStatus) => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "REGIONAL_MANAGER" });
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value,
          reason: "weekly fsc update",
          source: "manual-override"
        })
      })
    );

    expect(response.status).toBe(expectedStatus);
  });

  test("allows unauthenticated write only when explicit write bypass is enabled", async () => {
    isWriteBypassed.mockReturnValue(true);
    auth.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/fsc/route");
    const response = await POST(
      new Request("http://localhost/api/fsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          weekIso: "2026-W18",
          value: "0.42",
          reason: "weekly fsc update",
          source: "manual-override"
        })
      })
    );
    expect(response.status).toBe(201);
  });
});
