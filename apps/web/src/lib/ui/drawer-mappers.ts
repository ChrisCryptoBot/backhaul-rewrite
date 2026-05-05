import { toNumber } from "@/lib/ui/parse";

export const TIMELINE_STAGES = [
  "BOOKED",
  "DISPATCHED",
  "PICKED_UP",
  "DELIVERED",
  "POD_RECEIVED",
  "COMPLETED"
] as const;

export interface LoadDetailResponse {
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

export interface ViewLoadDetail {
  id: string;
  ref: string;
  status: string;
  timeline: { key: string; state: "done" | "current" | "future" }[];
  ids: {
    routeId: string;
    loadNumber: string;
    pickupNumber: string;
    pickupNumbers: string[];
  };
  geography: {
    shipper: string;
    pickupCityState: string;
    pickupWindow: string;
    receiver: string;
    deliveryCityState: string;
    deliveryWindow: string;
  };
  financials: {
    lineHaul: number | null;
    loadedMi: number | null;
    puDh: number | null;
    delDh: number | null;
    totalMi: number | null;
    negMi: number | null;
    loadedRpm: number | null;
    floorRpm: number | null;
    emptyPct: number | null;
  };
  operations: {
    brokerName: string;
    pickupDriverAssigned: string;
    tractorTrailer: string;
    commodity: string;
    equipmentNeeds: string;
    mgStatus: string;
    tmwStatus: string;
    mgStatusTask: string;
    tmwStatusTask: string;
    scaleBeforeTask: string;
    scaleAfterTask: string;
    coordinatorNotes: string;
    attentionNote: string;
    attentionSeverity: string;
    driverType: string;
    podStatus: string;
  };
  rateConfirmation: {
    id: string;
    sourceFileUrl: string;
    parseState: string;
    parseConfidence: number | null;
  } | null;
  legs: Array<{
    id: string;
    legIndex: number;
    legType: string;
    driverName: string;
    start: string;
    end: string;
    legMiles: number | null;
    notes: string;
  }>;
  audit: {
    createdAt: string;
    updatedAt: string;
  };
}

function deriveTimeline(status: string): { key: string; state: "done" | "current" | "future" }[] {
  const currentIndex = TIMELINE_STAGES.indexOf(status as (typeof TIMELINE_STAGES)[number]);
  return TIMELINE_STAGES.map((stage, index) => {
    if (currentIndex === -1) {
      return { key: stage, state: "future" };
    }
    if (index < currentIndex) {
      return { key: stage, state: "done" };
    }
    if (index === currentIndex) {
      return { key: stage, state: "current" };
    }
    return { key: stage, state: "future" };
  });
}

function dash(value: string | null | undefined): string {
  return value && value.length > 0 ? value : "—";
}

export function mapLoadDetailToView(input: LoadDetailResponse): ViewLoadDetail {
  return {
    id: input.id,
    ref: input.threePlRefNumber ?? "—",
    status: input.status,
    timeline: deriveTimeline(input.status),
    ids: {
      routeId: dash(input.routeId),
      loadNumber: dash(input.loadNumber),
      pickupNumber: dash(input.pickupNumber),
      pickupNumbers: input.pickupNumbers ?? []
    },
    geography: {
      shipper: dash(input.shipperName),
      pickupCityState: dash(input.pickupCityState),
      pickupWindow: dash(input.pickupWindow),
      receiver: dash(input.receiverName),
      deliveryCityState: dash(input.deliveryCityState),
      deliveryWindow: dash(input.deliveryWindow)
    },
    financials: {
      lineHaul: toNumber(input.lineHaulRate),
      loadedMi: toNumber(input.loadedMiles),
      puDh: toNumber(input.puDeadheadMiles),
      delDh: toNumber(input.delDeadheadMiles),
      totalMi: toNumber(input.totalTripMiles),
      negMi: toNumber(input.negotiableMiles),
      loadedRpm: toNumber(input.loadedRpm),
      floorRpm: toNumber(input.negotiationFloorRpm),
      emptyPct: toNumber(input.emptyMilePct)
    },
    operations: {
      brokerName: dash(input.brokerName),
      pickupDriverAssigned: dash(input.pickupDriverAssigned),
      tractorTrailer: [input.tractorTrailer1, input.tractorTrailer2].filter(Boolean).join(" / ") || "—",
      commodity: dash(input.commodity),
      equipmentNeeds: dash(input.equipmentNeeds),
      mgStatus: dash(input.mgStatus),
      tmwStatus: dash(input.tmwStatus),
      mgStatusTask: dash(input.mgStatusTask),
      tmwStatusTask: dash(input.tmwStatusTask),
      scaleBeforeTask: dash(input.scaleBeforeTask),
      scaleAfterTask: dash(input.scaleAfterTask),
      coordinatorNotes: dash(input.coordinatorNotes),
      attentionNote: dash(input.attentionNote),
      attentionSeverity: dash(input.attentionSeverity),
      driverType: dash(input.driverType),
      podStatus: dash(input.podStatus)
    },
    rateConfirmation: input.rateConfirmation
      ? {
          id: input.rateConfirmation.id,
          sourceFileUrl: input.rateConfirmation.sourceFileUrl,
          parseState: input.rateConfirmation.parseState,
          parseConfidence: toNumber(input.rateConfirmation.parseConfidence)
        }
      : null,
    legs: (input.legs ?? []).map((leg) => ({
      id: leg.id,
      legIndex: leg.legIndex,
      legType: leg.legType,
      driverName: dash(leg.driverName),
      start: [leg.startCity, leg.startState].filter(Boolean).join(", ") || "—",
      end: [leg.endCity, leg.endState].filter(Boolean).join(", ") || "—",
      legMiles: toNumber(leg.legMiles),
      notes: dash(leg.notes)
    })),
    audit: {
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    }
  };
}
