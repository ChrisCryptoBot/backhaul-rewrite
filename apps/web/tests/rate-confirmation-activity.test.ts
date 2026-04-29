import { beforeEach, describe, expect, test, vi } from "vitest";

const runInRegionScope = vi.fn();

vi.mock("@/lib/db", () => ({
  runInRegionScope
}));

describe("rate confirmation activity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("uses rolling 24h window for recent list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00.000Z"));
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: "rc-day", parseState: "QUEUED", updatedAt: new Date("2026-04-30T10:00:00.000Z") }])
      .mockResolvedValueOnce([
        { id: "rc-recent", parseState: "EXTRACTED", updatedAt: new Date("2026-04-30T11:00:00.000Z") }
      ]);

    const tx = {
      rateConfirmation: {
        findMany
      }
    };
    runInRegionScope.mockImplementation(async (_regionId: string, callback: (trx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );

    const { getRateConfirmationActivity } = await import("@/server/rate-confirmation-activity");
    const result = await getRateConfirmationActivity({ regionId: "region-1", date: "2026-04-30" });

    expect(findMany).toHaveBeenCalledTimes(2);
    const recentQuery = findMany.mock.calls[1]?.[0];
    expect(recentQuery?.where?.updatedAt?.gte).toEqual(new Date("2026-04-29T12:00:00.000Z"));
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0]?.id).toBe("rc-recent");
    vi.useRealTimers();
  });
});
