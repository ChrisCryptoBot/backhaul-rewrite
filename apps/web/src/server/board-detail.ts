import { runInRegionScope } from "@/lib/db";

export interface LoadDetailPayload {
  id: string;
  status: string;
  sectionCode: string | null;
  threePlRefNumber: string | null;
  routeId: string | null;
  loadNumber: string | null;
  pickupNumber: string | null;
  pickupNumbers: string[];
  shipperName: string | null;
  pickupCityState: string | null;
  pickupWindow: string | null;
  receiverName: string | null;
  deliveryCityState: string | null;
  deliveryWindow: string | null;
  lineHaulRate: string;
  loadedMiles: string;
  puDeadheadMiles: string;
  delDeadheadMiles: string;
  totalTripMiles: string | null;
  negotiableMiles: string | null;
  loadedRpm: string | null;
  negotiationFloorRpm: string | null;
  emptyMilePct: string | null;
  brokerName: string | null;
  pickupDriverAssigned: string | null;
  tractorTrailer1: string | null;
  tractorTrailer2: string | null;
  commodity: string | null;
  equipmentNeeds: string | null;
  mgStatus: string | null;
  tmwStatus: string | null;
  mgStatusTask: string;
  tmwStatusTask: string;
  scaleBeforeTask: string;
  scaleAfterTask: string;
  coordinatorNotes: string | null;
  attentionNote: string | null;
  attentionSeverity: string;
  driverType: string | null;
  podStatus: string | null;
  rateConfirmation: {
    id: string;
    sourceFileUrl: string;
    parseState: string;
    parseConfidence: string | null;
  } | null;
  legs: Array<{
    id: string;
    legIndex: number;
    legType: string;
    driverName: string | null;
    startCity: string | null;
    startState: string | null;
    endCity: string | null;
    endState: string | null;
    legMiles: string | null;
    notes: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface LoadDetailDbRow {
  id: string;
  status: string;
  threePlRefNumber: string | null;
  routeId: string | null;
  loadNumber: string | null;
  pickupNumber: string | null;
  pickupNumbers: string[];
  shipperName: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupWindow: string | null;
  receiverName: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryWindow: string | null;
  lineHaulRate: { toString(): string };
  loadedMiles: { toString(): string };
  puDeadheadMiles: { toString(): string };
  delDeadheadMiles: { toString(): string };
  totalTripMiles: { toString(): string } | null;
  negotiableMiles: { toString(): string } | null;
  loadedRpm: { toString(): string } | null;
  negotiationFloorRpm: { toString(): string } | null;
  emptyMilePct: { toString(): string } | null;
  pickupDriverAssigned: string | null;
  tractorTrailer1: string | null;
  tractorTrailer2: string | null;
  commodity: string | null;
  equipmentNeeds: string | null;
  mgStatus: string | null;
  tmwStatus: string | null;
  mgStatusTask: string;
  tmwStatusTask: string;
  scaleBeforeTask: string;
  scaleAfterTask: string;
  coordinatorNotes: string | null;
  attentionNote: string | null;
  attentionSeverity: string;
  driverType: string | null;
  podStatus: string | null;
  dropLot: { name: string } | null;
  broker: { name: string } | null;
  rateConfirmation: {
    id: string;
    sourceFileUrl: string;
    parseState: string;
    parseConfidence: { toString(): string } | null;
  } | null;
  legs: Array<{
    id: string;
    legIndex: number;
    legType: string;
    driverName: string | null;
    startCity: string | null;
    startState: string | null;
    endCity: string | null;
    endState: string | null;
    legMiles: { toString(): string } | null;
    notes: string | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
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

export async function getLoadDetail(input: {
  regionId: string;
  loadId: string;
}): Promise<LoadDetailPayload | null> {
  return runInRegionScope(input.regionId, async (tx) => {
    const load = (await tx.load.findFirst({
      where: {
        id: input.loadId,
        regionId: input.regionId,
        deletedAt: null
      },
      select: {
        id: true,
        status: true,
        threePlRefNumber: true,
        routeId: true,
        loadNumber: true,
        pickupNumber: true,
        pickupNumbers: true,
        shipperName: true,
        pickupCity: true,
        pickupState: true,
        pickupWindow: true,
        receiverName: true,
        deliveryCity: true,
        deliveryState: true,
        deliveryWindow: true,
        lineHaulRate: true,
        loadedMiles: true,
        puDeadheadMiles: true,
        delDeadheadMiles: true,
        totalTripMiles: true,
        negotiableMiles: true,
        loadedRpm: true,
        negotiationFloorRpm: true,
        emptyMilePct: true,
        pickupDriverAssigned: true,
        tractorTrailer1: true,
        tractorTrailer2: true,
        commodity: true,
        equipmentNeeds: true,
        mgStatus: true,
        tmwStatus: true,
        mgStatusTask: true,
        tmwStatusTask: true,
        scaleBeforeTask: true,
        scaleAfterTask: true,
        coordinatorNotes: true,
        attentionNote: true,
        attentionSeverity: true,
        driverType: true,
        podStatus: true,
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
        dropLot: { select: { name: true } },
        broker: { select: { name: true } },
        rateConfirmation: {
          select: {
            id: true,
            sourceFileUrl: true,
            parseState: true,
            parseConfidence: true
          }
        },
        createdAt: true,
        updatedAt: true
      }
    })) as unknown as LoadDetailDbRow | null;

    if (!load) {
      return null;
    }

    return {
      id: load.id,
      status: load.status,
      sectionCode: load.dropLot?.name ?? null,
      threePlRefNumber: load.threePlRefNumber,
      routeId: load.routeId,
      loadNumber: load.loadNumber,
      pickupNumber: load.pickupNumber,
      pickupNumbers: load.pickupNumbers,
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
      emptyMilePct: load.emptyMilePct?.toString() ?? null,
      brokerName: load.broker?.name ?? null,
      pickupDriverAssigned: load.pickupDriverAssigned,
      tractorTrailer1: load.tractorTrailer1,
      tractorTrailer2: load.tractorTrailer2,
      commodity: load.commodity,
      equipmentNeeds: load.equipmentNeeds,
      mgStatus: load.mgStatus,
      tmwStatus: load.tmwStatus,
      mgStatusTask: load.mgStatusTask,
      tmwStatusTask: load.tmwStatusTask,
      scaleBeforeTask: load.scaleBeforeTask,
      scaleAfterTask: load.scaleAfterTask,
      coordinatorNotes: load.coordinatorNotes,
      attentionNote: load.attentionNote,
      attentionSeverity: load.attentionSeverity,
      driverType: load.driverType,
      podStatus: load.podStatus,
      rateConfirmation: load.rateConfirmation
        ? {
            id: load.rateConfirmation.id,
            sourceFileUrl: load.rateConfirmation.sourceFileUrl,
            parseState: load.rateConfirmation.parseState,
            parseConfidence: load.rateConfirmation.parseConfidence?.toString() ?? null
          }
        : null,
      legs: load.legs.map((leg) => ({
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
      })),
      createdAt: load.createdAt.toISOString(),
      updatedAt: load.updatedAt.toISOString()
    };
  });
}
