/**
 * Daily board response contract for the interactive load board.
 */
export interface BoardResponse {
  regionId: string;
  regionCode?: string | null;
  regionLabel?: string | null;
  availableRegions?: Array<{ id: string; code: string; name: string }>;
  activeRegionId?: string | null;
  date: string;
  sections: BoardSection[];
  dayTotals: BoardDayTotals;
}

export interface BoardDayTotals {
  loadCount: number;
  lineHaulTotal: string;
  fscTotal: string;
  tonuTotal: string;
  allInTotal: string;
  loadedMilesTotal: string;
  emptyMilePct: string | null;
  negFloorRpm: string | null;
}

export interface BoardSection {
  type: "drop_lot" | "adhoc" | "canceled" | "region_next_day" | "local_awle_inbound";
  title: string;
  code?: string | null;
  note?: string | null;
  filledCount: number;
  dropLot: BoardDropLotMeta | null;
  loads: BoardLoadRow[];
}

export interface BoardDropLotMeta {
  id: string;
  name: string;
  code?: string | null;
  note?: string | null;
  city: string;
  state: string;
  sortOrder: number;
  dailyCapacity: number | null;
  slipSeat: boolean;
  dropHookRequired: boolean;
}

export interface BoardLoadLegRow {
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
}

export interface BoardLoadRow {
  id: string;
  rateConfirmationId: string | null;
  threePlRefNumber: string | null;
  status: string;
  lateCancelFailedNote: string | null;
  attentionSeverity: "INFO" | "WARN" | "URGENT";
  scaleBeforeTask: "NOT_DONE" | "DONE";
  scaleAfterTask: "NOT_DONE" | "DONE";
  routeId: string | null;
  loadNumber: string | null;
  pickupNumber: string | null;
  pickupNumbers: string[];
  brokerName: string | null;
  brokerRepName: string | null;
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
  pickupCityState: string | null;
  pickupWindow: string | null;
  puStatusPreset: string;
  puStatusCustom: string | null;
  receiverName: string | null;
  deliveryCityState: string | null;
  deliveryDate: string | null;
  deliveryWindow: string | null;
  delStatusPreset: string;
  delStatusCustom: string | null;
  podStatus: string | null;
  lineHaulRate: string;
  fscAmount: string;
  tonuAmount: string;
  allInRevenue: string;
  loadedMiles: string;
  puDeadheadMiles: string;
  delDeadheadMiles: string;
  totalTripMiles: string | null;
  negotiableMiles: string | null;
  loadedRpm: string | null;
  negotiationFloorRpm: string | null;
  coordinatorNotes: string | null;
  driverType: string | null;
  dropLotName: string | null;
  legs: BoardLoadLegRow[];
}
