import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";

const runInRegionScope = vi.fn();

vi.mock("@/lib/db", () => ({
  runInRegionScope
}));

describe("kpi dashboard services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("maps snapshot metrics into KPI cards and trend empty percentages", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          weekIso: "2026-W17",
          loadCount: 10,
          lineHaulRevenue: 10000,
          fuelSurchargeAmount: "900",
          totalLoadedMiles: 2500,
          emptyMilePct: 0.058,
          negFloorRpm: "4.25"
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          weekIso: "2026-W16",
          loadCount: 8,
          lineHaulRevenue: 9000,
          emptyMilePct: 0.067
        },
        {
          weekIso: "2026-W17",
          loadCount: 10,
          lineHaulRevenue: 10000,
          emptyMilePct: 0.058
        }
      ]);
    const tx = {
      $queryRaw: queryRaw
    };
    runInRegionScope.mockImplementation(async (_regionId: string, callback: (trx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );

    const { getKpiDashboard } = await import("@/server/kpi-dashboard");
    const payload = await getKpiDashboard({ regionId: "region-1", weekIso: "2026-W17" });

    const loadedMilesCard = payload.cards.find((card) => card.key === "loadedMiles");
    const emptyPctCard = payload.cards.find((card) => card.key === "emptyPct");
    const floorRpmCard = payload.cards.find((card) => card.key === "floorRpm");
    expect(loadedMilesCard?.value).toBe("2500");
    expect(emptyPctCard?.value).toBe("5.8");
    expect(floorRpmCard?.value).toBe("4.25");
    expect(payload.trend.find((point) => point.week === "W17")?.empty ?? 0).toBeCloseTo(5.8, 6);
  });

  test("normalizes lane keys and excludes canceled/failed loads", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          status: "BOOKED",
          pickupCity: " Pittsburgh ",
          pickupState: "pa",
          deliveryCity: "Leesport",
          deliveryState: "PA",
          lineHaulRate: new Prisma.Decimal("1000"),
          loadedMiles: new Prisma.Decimal("200"),
          puDeadheadMiles: new Prisma.Decimal("10"),
          delDeadheadMiles: new Prisma.Decimal("5"),
          fscAmount: new Prisma.Decimal("100")
        },
        {
          status: "CANCELED",
          pickupCity: "PITTSBURGH",
          pickupState: "PA",
          deliveryCity: "LEESPORT",
          deliveryState: "PA",
          lineHaulRate: new Prisma.Decimal("5000"),
          loadedMiles: new Prisma.Decimal("1000"),
          puDeadheadMiles: new Prisma.Decimal("0"),
          delDeadheadMiles: new Prisma.Decimal("0"),
          fscAmount: new Prisma.Decimal("0")
        }
      ])
      .mockResolvedValueOnce([
        {
          originCity: "PITTSBURGH",
          originState: "PA",
          destinationCity: "LEESPORT",
          destinationState: "PA",
          targetRate: new Prisma.Decimal("950")
        }
      ]);
    const tx = {
      $queryRaw: queryRaw
    };
    runInRegionScope.mockImplementation(async (_regionId: string, callback: (trx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );

    const { getLaneScorecard } = await import("@/server/kpi-dashboard");
    const lanes = await getLaneScorecard({ regionId: "region-1", weekIso: "2026-W17" });
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.loads).toBe(1);
    expect(lanes[0]?.status).toBe("ON_TARGET");
  });
});
