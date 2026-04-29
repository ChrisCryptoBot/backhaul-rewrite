import { Prisma } from "@prisma/client";
import { runInRegionScope } from "@/lib/db";
import { safeDivideDecimal } from "@/lib/decimal-utils";

type NumericLike = Prisma.Decimal | number | string | null;

function toNumber(value: NumericLike): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  try {
    const parsed = new Prisma.Decimal(value).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toStringNumber(value: NumericLike): string {
  if (value === null) {
    return "0";
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toString();
}

function buildCardDelta(current: number | null, prior: number | null): { delta: number | null; noPrior: boolean } {
  if (current === null || prior === null) {
    return { delta: null, noPrior: true };
  }
  return { delta: current - prior, noPrior: false };
}

function laneLabel(input: { pickupCity: string | null; pickupState: string | null; deliveryCity: string | null; deliveryState: string | null }): string {
  const from = `${input.pickupCity ?? "Unknown"}, ${input.pickupState ?? "??"}`;
  const to = `${input.deliveryCity ?? "Unknown"}, ${input.deliveryState ?? "??"}`;
  return `${from} → ${to}`;
}

function normalizePart(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function laneKey(input: {
  pickupCity: string | null;
  pickupState: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
}): string {
  return [
    normalizePart(input.pickupCity),
    normalizePart(input.pickupState),
    normalizePart(input.deliveryCity),
    normalizePart(input.deliveryState)
  ].join("|");
}

export async function getWeeklyTrend(input: {
  regionId: string;
  weekIso: string;
  weeks: number;
}) {
  return runInRegionScope(input.regionId, async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        weekIso: string;
        loadCount: number;
        lineHaulRevenue: number | string;
        emptyMilePct: number | string | null;
      }>
    >(Prisma.sql`
      SELECT "weekIso", "loadCount", "lineHaulRevenue", "emptyMilePct"
      FROM "WeekSnapshot"
      WHERE "regionId" = ${input.regionId}
        AND "weekIso" <= ${input.weekIso}
      ORDER BY "weekIso" DESC
      LIMIT ${input.weeks}
    `);
    return rows.reverse().map((row) => ({
      week: row.weekIso.split("-")[1] ?? row.weekIso,
      loads: row.loadCount,
      rev: toStringNumber(row.lineHaulRevenue),
      empty: (toNumber(row.emptyMilePct) ?? 0) * 100
    }));
  });
}

export async function getLaneScorecard(input: {
  regionId: string;
  weekIso: string;
}) {
  return runInRegionScope(input.regionId, async (tx) => {
    const [loads, lanes] = await Promise.all([
      tx.$queryRaw<
        Array<{
          status: string;
          pickupCity: string | null;
          pickupState: string | null;
          deliveryCity: string | null;
          deliveryState: string | null;
          lineHaulRate: number | string;
          loadedMiles: number | string;
          puDeadheadMiles: number | string;
          delDeadheadMiles: number | string;
          fscAmount: number | string;
        }>
      >(Prisma.sql`
        SELECT "status", "pickupCity", "pickupState", "deliveryCity", "deliveryState",
               "lineHaulRate", "loadedMiles", "puDeadheadMiles", "delDeadheadMiles", "fscAmount"
        FROM "Load"
        WHERE "regionId" = ${input.regionId}
          AND "weekIso" = ${input.weekIso}
          AND "deletedAt" IS NULL
      `),
      tx.$queryRaw<
        Array<{
          originCity: string;
          originState: string;
          destinationCity: string;
          destinationState: string;
          targetRate: number | string;
        }>
      >(Prisma.sql`
        SELECT "originCity", "originState", "destinationCity", "destinationState", "targetRate"
        FROM "Lane"
        WHERE "regionId" = ${input.regionId}
          AND "deletedAt" IS NULL
      `)
    ]);

    const targetByKey = new Map<string, Prisma.Decimal>();
    for (const lane of lanes) {
      const key = laneKey({
        pickupCity: lane.originCity,
        pickupState: lane.originState,
        deliveryCity: lane.destinationCity,
        deliveryState: lane.destinationState
      });
      targetByKey.set(key, new Prisma.Decimal(lane.targetRate));
    }

    const grouped = new Map<
      string,
      {
        lane: string;
        key: string;
        loads: number;
        revenue: Prisma.Decimal;
        loadedMiles: Prisma.Decimal;
        puDh: Prisma.Decimal;
        delDh: Prisma.Decimal;
        fsc: Prisma.Decimal;
      }
    >();

    const activeLoads = loads.filter((load) => load.status !== "CANCELED" && load.status !== "FAILED");
    for (const load of activeLoads) {
      const key = laneKey(load);
      const existing = grouped.get(key) ?? {
        lane: laneLabel(load),
        key,
        loads: 0,
        revenue: new Prisma.Decimal(0),
        loadedMiles: new Prisma.Decimal(0),
        puDh: new Prisma.Decimal(0),
        delDh: new Prisma.Decimal(0),
        fsc: new Prisma.Decimal(0)
      };
      existing.loads += 1;
      existing.revenue = existing.revenue.plus(new Prisma.Decimal(load.lineHaulRate));
      existing.loadedMiles = existing.loadedMiles.plus(new Prisma.Decimal(load.loadedMiles));
      existing.puDh = existing.puDh.plus(new Prisma.Decimal(load.puDeadheadMiles));
      existing.delDh = existing.delDh.plus(new Prisma.Decimal(load.delDeadheadMiles));
      existing.fsc = existing.fsc.plus(new Prisma.Decimal(load.fscAmount));
      grouped.set(key, existing);
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.loads - a.loads)
      .map((row) => {
        const target = targetByKey.get(row.key) ?? null;
        const floorRpm = safeDivideDecimal(row.revenue, row.loadedMiles.plus(row.puDh));
        const emptyPct = safeDivideDecimal(row.puDh.plus(row.delDh), row.loadedMiles.plus(row.puDh).plus(row.delDh));
        const revLoad = safeDivideDecimal(row.revenue, new Prisma.Decimal(row.loads));
        const vsTarget = target && revLoad ? revLoad.minus(target) : null;
        const status: "ON_TARGET" | "BELOW_NEAR" | "BELOW" | "NO_LOADS" = !target
          ? "NO_LOADS"
          : !vsTarget
            ? "NO_LOADS"
            : vsTarget.greaterThanOrEqualTo(0)
              ? "ON_TARGET"
              : vsTarget.greaterThanOrEqualTo(-100)
                ? "BELOW_NEAR"
                : "BELOW";
        return {
          lane: row.lane,
          target: target?.toString() ?? null,
          loads: row.loads,
          revenue: row.revenue.toString(),
          floorRpm: floorRpm?.toString() ?? null,
          vsTarget: vsTarget?.toString() ?? null,
          emptyPct: emptyPct ? emptyPct.toNumber() * 100 : null,
          fsc: row.fsc.toString(),
          revLoad: revLoad?.toString() ?? null,
          status
        };
      });
  });
}

export async function getKpiDashboard(input: {
  regionId: string;
  weekIso: string;
}) {
  return runInRegionScope(input.regionId, async (tx) => {
    const [snapshots, rules, lanes, trend] = await Promise.all([
      tx.$queryRaw<
        Array<{
          weekIso: string;
          loadCount: number;
          lineHaulRevenue: number | string;
          fuelSurchargeAmount: number | string;
          totalLoadedMiles: number | string;
          emptyMilePct: number | string | null;
          negFloorRpm: number | string | null;
        }>
      >(Prisma.sql`
        SELECT "weekIso", "loadCount", "lineHaulRevenue", "fuelSurchargeAmount", "totalLoadedMiles", "emptyMilePct", "negFloorRpm"
        FROM "WeekSnapshot"
        WHERE "regionId" = ${input.regionId}
          AND "weekIso" <= ${input.weekIso}
        ORDER BY "weekIso" DESC
        LIMIT 2
      `),
      tx.$queryRaw<
        Array<{
          code: string;
          severity: "INFO" | "WARN" | "BLOCK";
          statement: string;
          metadata: unknown;
        }>
      >(Prisma.sql`
        SELECT "code", "severity", "statement", "metadata"
        FROM "OperationalRule"
        WHERE "regionId" = ${input.regionId}
          AND "deletedAt" IS NULL
        ORDER BY "code" ASC
      `),
      getLaneScorecard(input),
      getWeeklyTrend({ ...input, weeks: 6 })
    ]);

    const current = snapshots.find((snapshot) => snapshot.weekIso === input.weekIso) ?? snapshots[0] ?? null;
    const prior = snapshots.find((snapshot) => snapshot.weekIso !== input.weekIso) ?? null;
    const currentEmptyPct = toNumber(current?.emptyMilePct ?? null);
    const priorEmptyPct = toNumber(prior?.emptyMilePct ?? null);
    const currentValues: {
      loadCount: number;
      lineHaulRevenue: number | null;
      loadedMiles: number | null;
      emptyPct: number | null;
      mileMaxRpm: number | null;
      floorRpm: number | null;
      fsc: number | null;
    } = current
      ? {
          loadCount: current.loadCount,
          lineHaulRevenue: toNumber(current.lineHaulRevenue),
          loadedMiles: toNumber(current.totalLoadedMiles),
          emptyPct: currentEmptyPct === null ? null : currentEmptyPct * 100,
          mileMaxRpm: null,
          floorRpm: toNumber(current.negFloorRpm),
          fsc: toNumber(current.fuelSurchargeAmount)
        }
      : {
          loadCount: 0,
          lineHaulRevenue: 0,
          loadedMiles: 0,
          emptyPct: null,
          mileMaxRpm: null,
          floorRpm: null,
          fsc: null
        };
    const priorValues: {
      loadCount: number;
      lineHaulRevenue: number | null;
      loadedMiles: number | null;
      emptyPct: number | null;
      mileMaxRpm: number | null;
      floorRpm: number | null;
      fsc: number | null;
    } | null = prior
      ? {
          loadCount: prior.loadCount,
          lineHaulRevenue: toNumber(prior.lineHaulRevenue),
          loadedMiles: toNumber(prior.totalLoadedMiles),
          emptyPct: priorEmptyPct === null ? null : priorEmptyPct * 100,
          mileMaxRpm: null,
          floorRpm: toNumber(prior.negFloorRpm),
          fsc: toNumber(prior.fuelSurchargeAmount)
        }
      : null;

    const cards = [
      {
        key: "loads",
        label: "Total Loads",
        value: currentValues.loadCount.toString(),
        delta: priorValues ? currentValues.loadCount - priorValues.loadCount : null,
        deltaLabel: "WoW",
        noPrior: !priorValues
      },
      {
        key: "revenue",
        label: "Total 3P Revenue",
        value: currentValues.lineHaulRevenue?.toFixed(0) ?? "0",
        ...buildCardDelta(currentValues.lineHaulRevenue, priorValues?.lineHaulRevenue ?? null),
        deltaLabel: "WoW"
      },
      {
        key: "loadedMiles",
        label: "Loaded Miles",
        value: currentValues.loadedMiles?.toFixed(0) ?? "0",
        ...buildCardDelta(currentValues.loadedMiles, priorValues?.loadedMiles ?? null),
        deltaLabel: "WoW"
      },
      {
        key: "emptyPct",
        label: "Empty Mile %",
        value: currentValues.emptyPct?.toFixed(1) ?? "—",
        ...buildCardDelta(currentValues.emptyPct, priorValues?.emptyPct ?? null),
        deltaLabel: "WoW",
        inverted: true
      },
      {
        key: "mileMaxRpm",
        label: "MileMax RPM",
        value: currentValues.mileMaxRpm?.toFixed(2) ?? "—",
        ...buildCardDelta(currentValues.mileMaxRpm, priorValues?.mileMaxRpm ?? null),
        deltaLabel: "WoW"
      },
      {
        key: "floorRpm",
        label: "Negotiation Floor RPM",
        value: currentValues.floorRpm?.toFixed(2) ?? "—",
        ...buildCardDelta(currentValues.floorRpm, priorValues?.floorRpm ?? null),
        deltaLabel: "WoW"
      },
      {
        key: "fsc",
        label: "Total FSC",
        value: currentValues.fsc?.toFixed(0) ?? "—",
        ...buildCardDelta(currentValues.fsc, priorValues?.fsc ?? null),
        deltaLabel: "WoW",
        inverted: true
      },
      {
        key: "tender",
        label: "Tender Accept %",
        value: "—",
        delta: null,
        deltaLabel: "no prior",
        noPrior: true
      }
    ];

    const rulesView = rules.map((rule) => {
      const metadata = (rule.metadata ?? {}) as Record<string, unknown>;
      const title = typeof metadata.title === "string" ? metadata.title : rule.code;
      const appliesTo = typeof metadata.appliesTo === "string" ? metadata.appliesTo : "Region";
      return {
        code: rule.code,
        title,
        severity: rule.severity,
        statement: rule.statement,
        appliesTo
      };
    });

    return {
      weekIso: input.weekIso,
      comparisonWeekIso: prior?.weekIso ?? null,
      cards,
      lanes,
      trend,
      managementNotes: [
        "Weekly management summary generated from current lane and snapshot metrics.",
        "Detailed narrative can be replaced by coordinator-authored notes."
      ],
      rules: rulesView
    };
  });
}
