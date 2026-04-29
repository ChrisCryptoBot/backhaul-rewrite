import React from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { boardMvpColumnKeys, boardColumnSpecs } from "@/lib/board-columns";
import { requireRegionAccess } from "@/lib/access";
import { resolvePhase1RegionId } from "@/lib/scope";
import { getBoardResponse } from "@/server/board";

interface HomePageProps {
  // Next.js 14 passes an object; newer versions may pass a Promise.
  searchParams?:
    | { [key: string]: string | string[] | undefined }
    | Promise<{ [key: string]: string | string[] | undefined }>;
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const regionId = await resolvePhase1RegionId();
  await requireRegionAccess(userId, regionId);
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const queryDate = resolvedSearchParams?.date;
  const dateCandidate = Array.isArray(queryDate) ? queryDate[0] : queryDate;
  const date = dateCandidate && /^\d{4}-\d{2}-\d{2}$/.test(dateCandidate) ? dateCandidate : todayIsoUtc();

  let board;
  let boardError: string | null = null;
  try {
    board = await getBoardResponse({ regionId, date });
  } catch {
    board = null;
    boardError = "Unable to load board data right now.";
  }

  if (!board) {
    return (
      <main>
        <h1>Daily Load Board</h1>
        <p>{boardError}</p>
      </main>
    );
  }

  const mvpColumns = boardColumnSpecs.filter((column) => boardMvpColumnKeys.includes(column.key as (typeof boardMvpColumnKeys)[number]));

  return (
    <main>
      <h1>Daily Load Board</h1>
      <p>{board.date}</p>
      <p>
        Totals: {board.dayTotals.loadCount} loads | ${board.dayTotals.lineHaulTotal} line haul |{" "}
        {board.dayTotals.loadedMilesTotal} loaded miles
      </p>
      <h2>MVP Column Order</h2>
      <ol>
        {mvpColumns.map((column) => (
          <li key={column.key}>{column.displayLabel}</li>
        ))}
      </ol>
      {board.sections.every((section) => section.loads.length === 0) ? (
        <p>No loads booked for this date.</p>
      ) : (
        board.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            {section.dropLot ? (
              <p>
                Filled {section.filledCount}
                {section.dropLot.dailyCapacity !== null ? ` / ${section.dropLot.dailyCapacity}` : ""}
                {" | "}Slip-seat: {section.dropLot.slipSeat ? "Yes" : "No"}
                {" | "}Drop-hook required: {section.dropLot.dropHookRequired ? "Yes" : "No"}
              </p>
            ) : (
              <p>Filled {section.filledCount}</p>
            )}
            {section.loads.length === 0 ? (
              <p>No loads in this section.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>REF #</th>
                    <th>Status</th>
                    <th>Shipper</th>
                    <th>Receiver</th>
                    <th>Line Haul</th>
                    <th>Loaded Mi</th>
                  </tr>
                </thead>
                <tbody>
                  {section.loads.map((load) => (
                    <tr key={load.id}>
                      <td>{load.threePlRefNumber ?? "—"}</td>
                      <td>{load.status}</td>
                      <td>{load.shipperName ?? "—"}</td>
                      <td>{load.receiverName ?? "—"}</td>
                      <td>{load.lineHaulRate}</td>
                      <td>{load.loadedMiles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))
      )}
    </main>
  );
}
