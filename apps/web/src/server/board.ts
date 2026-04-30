import { Prisma } from "@prisma/client";
import { runInRegionScope } from "@/lib/db";
import type { BoardLoadRow, BoardResponse, BoardSection } from "@/lib/board-types";
import { safeDivideDecimal } from "@/lib/decimal-utils";
import { boardDayRange, PHASE1_BOARD_TIMEZONE } from "@/lib/board-date";

interface DropLotBoardRow {
  id: string;
  name: string;
  city: string;
  state: string;
  sortOrder: number;
  dailyCapacity: number | null;
  slipSeat: boolean;
  dropHookRequired: boolean;
}

interface BoardLoadDbRow {
  id: string;
  status: string;
  dropLotId: string | null;
  dropLot: { id: string; name: string } | null;
  threePlRefNumber: string | null;
  routeId: string | null;
  loadNumber: string | null;
  pickupNumber: string | null;
  shipperName: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupWindow: string | null;
  receiverName: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryWindow: string | null;
  lineHaulRate: Prisma.Decimal;
  loadedMiles: Prisma.Decimal;
  puDeadheadMiles: Prisma.Decimal;
  delDeadheadMiles: Prisma.Decimal;
  totalTripMiles: Prisma.Decimal | null;
  negotiableMiles: Prisma.Decimal | null;
  loadedRpm: Prisma.Decimal | null;
  negotiationFloorRpm: Prisma.Decimal | null;
}

function cityState(city: string | null, state: string | null): string | null {
  if (!city && !state) {
    return null;
  }
  if (!city) {
    return state;
  }
  if (!state) {
    return city;
  }
  return `${city}, ${state}`;
}

function loadToBoardRow(load: {
  id: string;
  status: string;
  dropLot: { name: string } | null;
  threePlRefNumber: string | null;
  routeId: string | null;
  loadNumber: string | null;
  pickupNumber: string | null;
  shipperName: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupWindow: string | null;
  receiverName: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryWindow: string | null;
  lineHaulRate: Prisma.Decimal;
  loadedMiles: Prisma.Decimal;
  puDeadheadMiles: Prisma.Decimal;
  delDeadheadMiles: Prisma.Decimal;
  totalTripMiles: Prisma.Decimal | null;
  negotiableMiles: Prisma.Decimal | null;
  loadedRpm: Prisma.Decimal | null;
  negotiationFloorRpm: Prisma.Decimal | null;
}): BoardLoadRow {
  return {
    id: load.id,
    threePlRefNumber: load.threePlRefNumber,
    status: load.status,
    routeId: load.routeId,
    loadNumber: load.loadNumber,
    pickupNumber: load.pickupNumber,
    shipperName: load.shipperName,
    pickupCityState: cityState(load.pickupCity, load.pickupState),
    pickupWindow: load.pickupWindow,
    receiverName: load.receiverName,
    deliveryCityState: cityState(load.deliveryCity, load.deliveryState),
    deliveryWindow: load.deliveryWindow,
    lineHaulRate: load.lineHaulRate.toString(),
    loadedMiles: load.loadedMiles.toString(),
    puDeadheadMiles: load.puDeadheadMiles.toString(),
    delDeadheadMiles: load.delDeadheadMiles.toString(),
    totalTripMiles: load.totalTripMiles?.toString() ?? null,
    negotiableMiles: load.negotiableMiles?.toString() ?? null,
    loadedRpm: load.loadedRpm?.toString() ?? null,
    negotiationFloorRpm: load.negotiationFloorRpm?.toString() ?? null,
    dropLotName: load.dropLot?.name ?? null
  };
}

export async function getBoardResponse(input: {
  regionId: string;
  date: string;
}): Promise<BoardResponse> {
  const { dayStart, dayEnd } = boardDayRange(input.date, PHASE1_BOARD_TIMEZONE);

  return runInRegionScope(input.regionId, async (tx) => {
    const [dropLots, loads] = await Promise.all([
      tx.dropLot.findMany({
        where: { regionId: input.regionId }
      }) as unknown as Promise<DropLotBoardRow[]>,
      tx.load.findMany({
        where: {
          regionId: input.regionId,
          bookingDate: {
            gte: dayStart,
            lt: dayEnd
          },
          deletedAt: null
        },
        orderBy: [{ dropLotId: "asc" }, { bookingDate: "asc" }, { createdAt: "asc" }],
        include: {
          dropLot: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }) as unknown as Promise<BoardLoadDbRow[]>
    ]);
    dropLots.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));

    const canceledStatuses = new Set(["CANCELED", "FAILED"]);
    const canceledLoads = loads.filter((load) => canceledStatuses.has(load.status));
    const activeLoads = loads.filter((load) => !canceledStatuses.has(load.status));
    const loadsByDropLot = new Map<string, typeof activeLoads>();
    for (const load of activeLoads) {
      if (!load.dropLotId) {
        continue;
      }
      const existing = loadsByDropLot.get(load.dropLotId) ?? [];
      existing.push(load);
      loadsByDropLot.set(load.dropLotId, existing);
    }
    const adHocLoads = activeLoads.filter((load) => !load.dropLotId);

    const dropLotSections: BoardSection[] = dropLots.map((dropLot) => {
      const sectionLoads = loadsByDropLot.get(dropLot.id) ?? [];
      return {
        type: "drop_lot",
        title: `${dropLot.name} (${dropLot.city}, ${dropLot.state})`,
        filledCount: sectionLoads.length,
        dropLot: {
          id: dropLot.id,
          name: dropLot.name,
          city: dropLot.city,
          state: dropLot.state,
          sortOrder: dropLot.sortOrder,
          dailyCapacity: dropLot.dailyCapacity,
          slipSeat: dropLot.slipSeat,
          dropHookRequired: dropLot.dropHookRequired
        },
        loads: sectionLoads.map(loadToBoardRow)
      };
    });

    const adHocSection: BoardSection = {
      type: "adhoc",
      title: "Ad-hoc lanes",
      filledCount: adHocLoads.length,
      dropLot: null,
      loads: adHocLoads.map(loadToBoardRow)
    };

    const canceledSection: BoardSection = {
      type: "canceled",
      title: "CANCELED / TONU",
      filledCount: canceledLoads.length,
      dropLot: null,
      loads: canceledLoads.map(loadToBoardRow)
    };

    const lineHaulTotal = activeLoads.reduce((acc, load) => acc.plus(load.lineHaulRate), new Prisma.Decimal(0));
    const loadedMilesTotal = activeLoads.reduce((acc, load) => acc.plus(load.loadedMiles), new Prisma.Decimal(0));
    const puDeadheadTotal = activeLoads.reduce((acc, load) => acc.plus(load.puDeadheadMiles), new Prisma.Decimal(0));
    const delDeadheadTotal = activeLoads.reduce((acc, load) => acc.plus(load.delDeadheadMiles), new Prisma.Decimal(0));
    const emptyMilesTotal = puDeadheadTotal.plus(delDeadheadTotal);
    const totalTripMiles = loadedMilesTotal.plus(emptyMilesTotal);
    const emptyMilePct = safeDivideDecimal(emptyMilesTotal, totalTripMiles);
    const negFloorRpm = safeDivideDecimal(lineHaulTotal, loadedMilesTotal.plus(puDeadheadTotal));

    return {
      regionId: input.regionId,
      date: input.date,
      sections: [...dropLotSections, adHocSection, canceledSection],
      dayTotals: {
        loadCount: activeLoads.length,
        lineHaulTotal: lineHaulTotal.toString(),
        loadedMilesTotal: loadedMilesTotal.toString(),
        emptyMilePct: emptyMilePct?.toString() ?? null,
        negFloorRpm: negFloorRpm?.toString() ?? null
      }
    };
  });
}
