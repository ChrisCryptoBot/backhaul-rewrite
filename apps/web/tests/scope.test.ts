import { describe, expect, test, vi } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    region: {
      findUnique
    }
  }
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    PHASE1_REGION_CODE: "NE"
  })
}));

describe("region scope", () => {
  test("enforces region id resolved from NE code", async () => {
    findUnique.mockResolvedValue({ id: "region-ne-id" });
    const { assertRegionAccess } = await import("@/lib/scope");

    await expect(
      assertRegionAccess(
        {
          userId: "u1",
          role: "COORDINATOR",
          regionId: "region-ne-id"
        },
        "region-ne-id"
      )
    ).resolves.toBeUndefined();
  });
});
