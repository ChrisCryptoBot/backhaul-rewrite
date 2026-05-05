import { Prisma } from "@prisma/client";
import { runInRegionScope } from "@/lib/db";
import type { BoardLoadRow, BoardResponse, BoardSection } from "@/lib/board-types";
import { safeDivideDecimal } from "@/lib/decimal-utils";
import { boardDayRange, PHASE1_BOARD_TIMEZONE } from "@/lib/board-date";
import { withNonDeletedRegionScope, withRegionScope } from "@/lib/scoped-query";
import { createAuditLog } from "@/lib/audit";

interface DropLotBoardRow {
  id: string;
  name: string;
  code: string | null;
  note: string | null;
  city: string;
  state: string;
  sortOrder: number;
  dailyCapacity: number | null;
  slipSeat: boolean;
  dropHookRequired: boolean;
}

interface BoardLoadDbRow {
  id: string;
  rateConfirmationId: string | null;
  status: string;
  dropLotId: string | null;
  dropLot: { id: string; name: string } | null;
  threePlRefNumber: string | null;
  attentionNote: string | null;
  attentionSeverity: "INFO" | "WARN" | "URGENT";
  scaleBeforeTask: "NOT_DONE" | "DONE";
  scaleAfterTask: "NOT_DONE" | "DONE";
  routeId: string | null;
  loadNumber: string | null;
  pickupNumber: string | null;
  pickupNumbers: string[];
  broker: { name: string } | null;
  mgStatusTask: "NOT_DONE" | "DONE";
  tmwStatusTask: "NOT_DONE" | "DONE";
  pickupDriverAssigned: string | null;
  tractorTrailer1: string | null;
  tractorTrailer2: string | null;
  shipperName: string | null;
  commodity: string | null;
  equipmentNeeds: string | null;
  equipmentType: string | null;
  equipmentAccessory: string | null;
  equipmentOtherText: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupWindow: string | null;
  puStatusPreset: string;
  puStatusCustom: string | null;
  receiverName: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryDate: Date | null;
  deliveryWindow: string | null;
  delStatusPreset: string;
  delStatusCustom: string | null;
  podStatus: string | null;
  lineHaulRate: Prisma.Decimal;
  fscAmount: Prisma.Decimal;
  tonuAmount: Prisma.Decimal;
  allInRevenue: Prisma.Decimal;
  loadedMiles: Prisma.Decimal;
  puDeadheadMiles: Prisma.Decimal;
  delDeadheadMiles: Prisma.Decimal;
  totalTripMiles: Prisma.Decimal | null;
  negotiableMiles: Prisma.Decimal | null;
  loadedRpm: Prisma.Decimal | null;
  negotiationFloorRpm: Prisma.Decimal | null;
  coordinatorNotes: string | null;
  driverType: string | null;
  legs: Array<{
    id: string;
    legIndex: number;
    legType: string;
    driverName: string | null;
    startCity: string | null;
    startState: string | null;
    endCity: string | null;
    endState: string | null;
    legMiles: Prisma.Decimal | null;
    notes: string | null;
  }>;
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

function decimalOrZero(value: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return value ?? new Prisma.Decimal(0);
}

function loadToBoardRow(load: {
  id: string;
  rateConfirmationId: string | null;
  status: string;
  dropLot: { name: string } | null;
  threePlRefNumber: string | null;
  attentionNote: string | null;
  attentionSeverity: "INFO" | "WARN" | "URGENT";
  scaleBeforeTask: "NOT_DONE" | "DONE";
  scaleAfterTask: "NOT_DONE" | "DONE";
  routeId: string | null;
  loadNumber: string | null;
  pickupNumber: string | null;
  pickupNumbers: string[];
  broker: { name: string } | null;
  mgStatusTask: "NOT_DONE" | "DONE";
  tmwStatusTask: "NOT_DONE" | "DONE";
  pickupDriverAssigned: string | null;
  tractorTrailer1: string | null;
  tractorTrailer2: string | null;
  shipperName: string | null;
  commodity: string | null;
  equipmentNeeds: string | null;
  equipmentType: string | null;
  equipmentAccessory: string | null;
  equipmentOtherText: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupWindow: string | null;
  puStatusPreset: string;
  puStatusCustom: string | null;
  receiverName: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryDate: Date | null;
  deliveryWindow: string | null;
  delStatusPreset: string;
  delStatusCustom: string | null;
  podStatus: string | null;
  lineHaulRate: Prisma.Decimal;
  fscAmount: Prisma.Decimal;
  tonuAmount: Prisma.Decimal;
  allInRevenue: Prisma.Decimal;
  loadedMiles: Prisma.Decimal;
  puDeadheadMiles: Prisma.Decimal;
  delDeadheadMiles: Prisma.Decimal;
  totalTripMiles: Prisma.Decimal | null;
  negotiableMiles: Prisma.Decimal | null;
  loadedRpm: Prisma.Decimal | null;
  negotiationFloorRpm: Prisma.Decimal | null;
  coordinatorNotes: string | null;
  driverType: string | null;
  legs: Array<{
    id: string;
    legIndex: number;
    legType: string;
    driverName: string | null;
    startCity: string | null;
    startState: string | null;
    endCity: string | null;
    endState: string | null;
    legMiles: Prisma.Decimal | null;
    notes: string | null;
  }>;
}): BoardLoadRow {
  return {
    id: load.id,
    rateConfirmationId: load.rateConfirmationId,
    threePlRefNumber: load.threePlRefNumber,
    status: load.status,
    lateCancelFailedNote: load.attentionNote,
    attentionSeverity: load.attentionSeverity,
    scaleBeforeTask: load.scaleBeforeTask,
    scaleAfterTask: load.scaleAfterTask,
    routeId: load.routeId,
    loadNumber: load.loadNumber,
    pickupNumber: load.pickupNumber,
    pickupNumbers: load.pickupNumbers,
    brokerName: load.broker?.name ?? null,
    brokerRepName: null,
    mgStatusTask: load.mgStatusTask,
    tmwStatusTask: load.tmwStatusTask,
    pickupDriverAssigned: load.pickupDriverAssigned,
    tractorTrailer1: load.tractorTrailer1,
    tractorTrailer2: load.tractorTrailer2,
    shipperName: load.shipperName,
    commodity: load.commodity,
    equipmentNeeds: load.equipmentNeeds,
    equipmentType: load.equipmentType,
    equipmentAccessory: load.equipmentAccessory,
    equipmentOtherText: load.equipmentOtherText,
    pickupCityState: cityState(load.pickupCity, load.pickupState),
    pickupWindow: load.pickupWindow,
    puStatusPreset: load.puStatusPreset,
    puStatusCustom: load.puStatusCustom,
    receiverName: load.receiverName,
    deliveryCityState: cityState(load.deliveryCity, load.deliveryState),
    deliveryDate: load.deliveryDate?.toISOString() ?? null,
    deliveryWindow: load.deliveryWindow,
    delStatusPreset: load.delStatusPreset,
    delStatusCustom: load.delStatusCustom,
    podStatus: load.podStatus,
    lineHaulRate: decimalOrZero(load.lineHaulRate).toString(),
    fscAmount: decimalOrZero(load.fscAmount).toString(),
    tonuAmount: decimalOrZero(load.tonuAmount).toString(),
    allInRevenue: decimalOrZero(load.allInRevenue).toString(),
    loadedMiles: decimalOrZero(load.loadedMiles).toString(),
    puDeadheadMiles: decimalOrZero(load.puDeadheadMiles).toString(),
    delDeadheadMiles: decimalOrZero(load.delDeadheadMiles).toString(),
    totalTripMiles: load.totalTripMiles?.toString() ?? null,
    negotiableMiles: load.negotiableMiles?.toString() ?? null,
    loadedRpm: load.loadedRpm?.toString() ?? null,
    negotiationFloorRpm: load.negotiationFloorRpm?.toString() ?? null,
    coordinatorNotes: load.coordinatorNotes,
    driverType: load.driverType,
    dropLotName: load.dropLot?.name ?? null,
    legs: (load.legs ?? []).map((leg) => ({
      id: leg.id,
      legIndex: leg.legIndex,
      legType: leg.legType,
      driverName: leg.driverName,
      startCity: leg.startCity,
      startState: leg.startState,
      endCity: leg.endCity,
      endState: leg.endState,
      legMiles: leg.legMiles?.toString() ?? null,
      notes: leg.notes
    }))
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
        where: withRegionScope(input.regionId)
      }) as unknown as Promise<DropLotBoardRow[]>,
      tx.load.findMany({
        where: withNonDeletedRegionScope(input.regionId, {
          bookingDate: {
            gte: dayStart,
            lt: dayEnd
          }
        }),
        orderBy: [{ dropLotId: "asc" }, { bookingDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          rateConfirmationId: true,
          status: true,
          dropLotId: true,
          threePlRefNumber: true,
          attentionNote: true,
          attentionSeverity: true,
          scaleBeforeTask: true,
          scaleAfterTask: true,
          routeId: true,
          loadNumber: true,
          pickupNumber: true,
          pickupNumbers: true,
          broker: { select: { name: true } },
          mgStatusTask: true,
          tmwStatusTask: true,
          pickupDriverAssigned: true,
          tractorTrailer1: true,
          tractorTrailer2: true,
          shipperName: true,
          commodity: true,
          equipmentNeeds: true,
          equipmentType: true,
          equipmentAccessory: true,
          equipmentOtherText: true,
          pickupCity: true,
          pickupState: true,
          pickupWindow: true,
          puStatusPreset: true,
          puStatusCustom: true,
          receiverName: true,
          deliveryCity: true,
          deliveryState: true,
          deliveryDate: true,
          deliveryWindow: true,
          delStatusPreset: true,
          delStatusCustom: true,
          podStatus: true,
          lineHaulRate: true,
          fscAmount: true,
          tonuAmount: true,
          allInRevenue: true,
          loadedMiles: true,
          puDeadheadMiles: true,
          delDeadheadMiles: true,
          totalTripMiles: true,
          negotiableMiles: true,
          loadedRpm: true,
          negotiationFloorRpm: true,
          coordinatorNotes: true,
          driverType: true,
          legs: {
            orderBy: { legIndex: "asc" },
            select: {
              id: true,
              legIndex: true,
              legType: true,
              driverName: true,
              startCity: true,
              startState: true,
              endCity: true,
              endState: true,
              legMiles: true,
              notes: true
            }
          },
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
    const ltlDropLot = dropLots.find((dropLot) => (dropLot.code ?? "").toUpperCase() === "LTL" || dropLot.name.toUpperCase() === "LTL");
    const adHocLoads = activeLoads.filter((load) => !load.dropLotId);
    if (ltlDropLot && adHocLoads.length > 0) {
      const existing = loadsByDropLot.get(ltlDropLot.id) ?? [];
      loadsByDropLot.set(ltlDropLot.id, [...existing, ...adHocLoads]);
    }

    const dropLotSections: BoardSection[] = dropLots.map((dropLot) => {
      const sectionLoads = loadsByDropLot.get(dropLot.id) ?? [];
      return {
        type: "drop_lot",
        title: `${dropLot.name} (${dropLot.city}, ${dropLot.state})`,
        filledCount: sectionLoads.length,
        dropLot: {
          id: dropLot.id,
          name: dropLot.name,
          code: dropLot.code,
          note: dropLot.note,
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

    const adHocSection: BoardSection | null = ltlDropLot
      ? null
      : {
          type: "adhoc",
          title: "LTL",
          code: "LTL",
          note: "Retail trucks without a fixed drop lot; typically deadhead to AWLE unless backhaul is sourced.",
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

    const regionNextDaySection: BoardSection = {
      type: "region_next_day",
      title: "REGION (next-day prep)",
      filledCount: 0,
      dropLot: null,
      loads: []
    };

    const localAwleInboundSection: BoardSection = {
      type: "local_awle_inbound",
      title: "LOCAL AWLE INBOUND",
      filledCount: 0,
      dropLot: null,
      loads: []
    };

    const lineHaulTotal = activeLoads.reduce((acc, load) => acc.plus(load.lineHaulRate), new Prisma.Decimal(0));
    const fscTotal = activeLoads.reduce((acc, load) => acc.plus(decimalOrZero(load.fscAmount)), new Prisma.Decimal(0));
    const tonuTotal = loads.reduce((acc, load) => acc.plus(decimalOrZero(load.tonuAmount)), new Prisma.Decimal(0));
    const allInTotal = activeLoads.reduce((acc, load) => acc.plus(decimalOrZero(load.allInRevenue)), new Prisma.Decimal(0));
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
      sections: [...dropLotSections, ...(adHocSection ? [adHocSection] : []), canceledSection, regionNextDaySection, localAwleInboundSection],
      dayTotals: {
        loadCount: activeLoads.length,
        lineHaulTotal: lineHaulTotal.toString(),
        fscTotal: fscTotal.toString(),
        tonuTotal: tonuTotal.toString(),
        allInTotal: allInTotal.toString(),
        loadedMilesTotal: loadedMilesTotal.toString(),
        emptyMilePct: emptyMilePct?.toString() ?? null,
        negFloorRpm: negFloorRpm?.toString() ?? null
      }
    };
  });
}

export async function moveBoardLoad(input: {
  regionId: string;
  loadId: string;
  targetSectionId: string;
  actorId: string;
}): Promise<void> {
  await runInRegionScope(input.regionId, async (tx) => {
    const load = await tx.load.findFirst({
      where: withNonDeletedRegionScope(input.regionId, { id: input.loadId }),
      select: { id: true, status: true, dropLotId: true, isTONU: true, tonuAmount: true }
    });
    if (!load) {
      throw new Error("Load not found.");
    }

    let nextDropLotId: string | null = load.dropLotId;
    let nextStatus = load.status;
    let nextIsTonu = load.isTONU;
    let nextTonuAmount = load.tonuAmount;

    if (input.targetSectionId === "adhoc" || input.targetSectionId.startsWith("adhoc-")) {
      const ltlDropLot = await tx.dropLot.findFirst({
        where: withRegionScope(input.regionId, {
          OR: [{ code: "LTL" }, { name: "LTL" }]
        }),
        select: { id: true }
      });
      nextDropLotId = ltlDropLot?.id ?? null;
      nextStatus = "BOOKED";
      nextIsTonu = false;
      nextTonuAmount = new Prisma.Decimal(0);
    } else if (input.targetSectionId === "canceled" || input.targetSectionId.startsWith("canceled-")) {
      nextDropLotId = null;
      nextStatus = "CANCELED";
      nextIsTonu = false;
      nextTonuAmount = new Prisma.Decimal(0);
    } else {
      const targetLot = await tx.dropLot.findFirst({
        where: withRegionScope(input.regionId, { id: input.targetSectionId }),
        select: { id: true }
      });
      if (!targetLot) {
        throw new Error("Target drop lot not found.");
      }
      nextDropLotId = targetLot.id;
      nextStatus = "BOOKED";
      nextIsTonu = false;
      nextTonuAmount = new Prisma.Decimal(0);
    }

    await tx.load.update({
      where: { id: load.id },
      data: {
        dropLotId: nextDropLotId,
        status: nextStatus as never,
        isTONU: nextIsTonu,
        tonuAmount: nextTonuAmount
      }
    });
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "Load",
        entityId: load.id,
        action: "BOARD_MOVE",
        actorId: input.actorId,
        timestamp: new Date(),
        afterValue: {
          targetSectionId: input.targetSectionId,
          status: nextStatus,
          dropLotId: nextDropLotId,
          isTONU: nextIsTonu
        }
      })
    });
  });
}

export async function setLoadTonuLifecycle(input: {
  regionId: string;
  loadId: string;
  isTonu: boolean;
  tonuAmount?: string | null;
  actorId: string;
}): Promise<void> {
  await runInRegionScope(input.regionId, async (tx) => {
    const load = await tx.load.findFirst({
      where: withNonDeletedRegionScope(input.regionId, { id: input.loadId }),
      select: { id: true }
    });
    if (!load) {
      throw new Error("Load not found.");
    }
    if (input.isTonu && (!input.tonuAmount || input.tonuAmount.trim().length === 0)) {
      throw new Error("TONU amount is required when marking TONU.");
    }
    const resolvedAmount = input.isTonu ? new Prisma.Decimal(input.tonuAmount ?? "0") : new Prisma.Decimal(0);
    await tx.load.update({
      where: { id: load.id },
      data: {
        isTONU: input.isTonu,
        tonuAmount: resolvedAmount,
        status: (input.isTonu ? "CANCELED" : "BOOKED") as never,
        allInRevenue: input.isTonu ? resolvedAmount : undefined
      }
    });
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "Load",
        entityId: load.id,
        action: input.isTonu ? "TONU_MARKED" : "TONU_CLEARED",
        actorId: input.actorId,
        timestamp: new Date(),
        afterValue: {
          isTONU: input.isTonu,
          tonuAmount: resolvedAmount.toString()
        }
      })
    });
  });
}

export async function setBoardLoadStatus(input: {
  regionId: string;
  loadId: string;
  status: "BOOKED" | "CANCELED" | "FAILED";
  actorId: string;
}): Promise<void> {
  await runInRegionScope(input.regionId, async (tx) => {
    const load = await tx.load.findFirst({
      where: withNonDeletedRegionScope(input.regionId, { id: input.loadId }),
      select: { id: true, status: true, isTONU: true, tonuAmount: true }
    });
    if (!load) throw new Error("Load not found.");

    await tx.load.update({
      where: { id: load.id },
      data: {
        status: input.status as never,
        isTONU: input.status === "CANCELED" ? load.isTONU : false,
        tonuAmount: input.status === "CANCELED" ? load.tonuAmount : new Prisma.Decimal(0),
        allInRevenue:
          input.status === "CANCELED" || !load.isTONU
            ? undefined
            : new Prisma.Decimal(0)
      }
    });
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "Load",
        entityId: load.id,
        action: "BOARD_STATUS_UPDATE",
        actorId: input.actorId,
        timestamp: new Date(),
        afterValue: { status: input.status }
      })
    });
  });
}

export async function updateBoardLoadFields(input: {
  regionId: string;
  loadId: string;
  actorId: string;
  fields: Partial<{
    mgStatusTask: "NOT_DONE" | "DONE";
    tmwStatusTask: "NOT_DONE" | "DONE";
    scaleBeforeTask: "NOT_DONE" | "DONE";
    scaleAfterTask: "NOT_DONE" | "DONE";
    puStatusPreset: "ETA_TO_PU_DEL" | "LOADED_SET_TO_DEL" | "LATE" | "DONE" | "OTHER";
    puStatusCustom: string | null;
    delStatusPreset: "ETA_TO_PU_DEL" | "LOADED_SET_TO_DEL" | "LATE" | "DONE" | "OTHER";
    delStatusCustom: string | null;
    pickupDriverAssigned: string | null;
    commodity: string | null;
    equipmentNeeds: string | null;
    driverType: "SHUTTLE" | "PTP" | "LTL" | null;
    coordinatorNotes: string | null;
    attentionNote: string | null;
    attentionSeverity: "INFO" | "WARN" | "URGENT";
    podStatus: string | null;
  }>;
}): Promise<void> {
  await runInRegionScope(input.regionId, async (tx) => {
    const load = await tx.load.findFirst({
      where: withNonDeletedRegionScope(input.regionId, { id: input.loadId }),
      select: { id: true }
    });
    if (!load) throw new Error("Load not found.");

    await tx.load.update({
      where: { id: load.id },
      data: input.fields as never
    });
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "Load",
        entityId: load.id,
        action: "BOARD_FIELD_UPDATE",
        actorId: input.actorId,
        timestamp: new Date(),
        afterValue: input.fields
      })
    });
  });
}

export async function softDeleteBoardLoad(input: {
  regionId: string;
  loadId: string;
  reason: string;
  actorId: string;
}): Promise<void> {
  await runInRegionScope(input.regionId, async (tx) => {
    const load = await tx.load.findFirst({
      where: withNonDeletedRegionScope(input.regionId, { id: input.loadId }),
      select: { id: true }
    });
    if (!load) throw new Error("Load not found.");

    await tx.load.update({
      where: { id: load.id },
      data: { deletedAt: new Date() }
    });
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "Load",
        entityId: load.id,
        action: "BOARD_SOFT_DELETE",
        actorId: input.actorId,
        timestamp: new Date(),
        reason: input.reason
      })
    });
  });
}

export async function upsertBoardLoadLeg(input: {
  regionId: string;
  loadId: string;
  actorId: string;
  leg: {
    id?: string;
    legIndex: number;
    legType: "SHUTTLE" | "PTP" | "DELIVERY";
    driverName?: string | null;
    startCity?: string | null;
    startState?: string | null;
    endCity?: string | null;
    endState?: string | null;
    legMiles?: string | null;
    notes?: string | null;
  };
}): Promise<void> {
  await runInRegionScope(input.regionId, async (tx) => {
    const load = await tx.load.findFirst({
      where: withNonDeletedRegionScope(input.regionId, { id: input.loadId }),
      select: { id: true }
    });
    if (!load) throw new Error("Load not found.");

    if (input.leg.id) {
      await tx.loadLeg.update({
        where: { id: input.leg.id },
        data: {
          legIndex: input.leg.legIndex,
          legType: input.leg.legType,
          driverName: input.leg.driverName ?? null,
          startCity: input.leg.startCity ?? null,
          startState: input.leg.startState ?? null,
          endCity: input.leg.endCity ?? null,
          endState: input.leg.endState ?? null,
          legMiles: input.leg.legMiles ? new Prisma.Decimal(input.leg.legMiles) : null,
          notes: input.leg.notes ?? null
        }
      });
    } else {
      await tx.loadLeg.create({
        data: {
          loadId: load.id,
          legIndex: input.leg.legIndex,
          legType: input.leg.legType as never,
          driverName: input.leg.driverName ?? null,
          startCity: input.leg.startCity ?? null,
          startState: input.leg.startState ?? null,
          endCity: input.leg.endCity ?? null,
          endState: input.leg.endState ?? null,
          legMiles: input.leg.legMiles ? new Prisma.Decimal(input.leg.legMiles) : null,
          notes: input.leg.notes ?? null
        }
      });
    }
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "Load",
        entityId: load.id,
        action: "BOARD_LEG_UPSERT",
        actorId: input.actorId,
        timestamp: new Date(),
        afterValue: input.leg
      })
    });
  });
}

export async function deleteBoardLoadLeg(input: {
  regionId: string;
  loadId: string;
  legId: string;
  actorId: string;
}): Promise<void> {
  await runInRegionScope(input.regionId, async (tx) => {
    const leg = await tx.loadLeg.findFirst({
      where: {
        id: input.legId,
        loadId: input.loadId,
        load: { regionId: input.regionId, deletedAt: null }
      },
      select: { id: true, loadId: true }
    });
    if (!leg) throw new Error("Load leg not found.");
    await tx.loadLeg.delete({ where: { id: leg.id } });
    await tx.auditLog.create({
      data: createAuditLog({
        entityType: "Load",
        entityId: leg.loadId,
        action: "BOARD_LEG_DELETE",
        actorId: input.actorId,
        timestamp: new Date(),
        afterValue: { legId: leg.id }
      })
    });
  });
}
