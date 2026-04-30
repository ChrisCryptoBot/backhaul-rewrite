import type { BoardResponse } from "@/lib/board-types";

export function buildFallbackBoard(input: { regionId: string; date: string }): BoardResponse {
  return {
    regionId: input.regionId,
    date: input.date,
    sections: [
      {
        type: "adhoc",
        title: "Ad-hoc lanes",
        filledCount: 0,
        dropLot: null,
        loads: []
      },
      {
        type: "canceled",
        title: "CANCELED / TONU",
        filledCount: 0,
        dropLot: null,
        loads: []
      }
    ],
    dayTotals: {
      loadCount: 0,
      lineHaulTotal: "0",
      loadedMilesTotal: "0",
      emptyMilePct: null,
      negFloorRpm: null
    }
  };
}
