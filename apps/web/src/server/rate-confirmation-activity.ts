import { ParseState } from "@prisma/client";
import { boardDayRange, PHASE1_BOARD_TIMEZONE } from "@/lib/board-date";
import { runInRegionScope } from "@/lib/db";

export async function getRateConfirmationActivity(input: {
  regionId: string;
  date: string;
}) {
  const { dayStart, dayEnd } = boardDayRange(input.date, PHASE1_BOARD_TIMEZONE);
  const recentWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return runInRegionScope(input.regionId, async (tx) => {
    const [rows, recentRows] = await Promise.all([
      tx.rateConfirmation.findMany({
        where: {
          regionId: input.regionId,
          deletedAt: null,
          createdAt: {
            gte: dayStart,
            lt: dayEnd
          }
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          parseState: true,
          updatedAt: true
        }
      }),
      tx.rateConfirmation.findMany({
        where: {
          regionId: input.regionId,
          deletedAt: null,
          updatedAt: {
            gte: recentWindowStart
          }
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          parseState: true,
          updatedAt: true
        }
      })
    ]);

    const pendingStates = new Set<ParseState>([ParseState.UPLOADED, ParseState.QUEUED]);
    const readyStates = new Set<ParseState>([ParseState.EXTRACTED]);

    return {
      pending: rows.filter((row) => pendingStates.has(row.parseState)).map((row) => ({
        id: row.id,
        parseState: row.parseState
      })),
      ready: rows.filter((row) => readyStates.has(row.parseState)).map((row) => ({
        id: row.id,
        parseState: row.parseState
      })),
      recent: recentRows.map((row) => ({
        id: row.id,
        parseState: row.parseState,
        updatedAt: row.updatedAt.toISOString()
      }))
    };
  });
}
