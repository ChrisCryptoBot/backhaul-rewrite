import React from "react";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardShell } from "@/components/board/board-shell";
import type { ViewBoardResponse } from "@/lib/ui/board-mappers";

const boardFixture: ViewBoardResponse = {
  regionId: "region-1",
  regionCode: "AWLE",
  regionLabel: "NORTHEAST",
  date: "2026-04-29",
  totals: {
    loads: 1,
    lineHaul: 1000,
    fsc: 0,
    tonu: 0,
    allIn: 1000,
    loadedMiles: 200,
    emptyPctRatio: 0.1,
    floorRpm: 4.7
  },
  availableRegions: [{ id: "region-1", code: "AWLE", name: "NORTHEAST" }],
  activeRegionId: "region-1",
  sections: [
    {
      id: "lot-a",
      type: "drop_lot",
      title: "LOT A",
      code: "AWLE",
      note: "24/7 dock",
      filledCount: 1,
      capacity: 5,
      city: "Warrendale",
      state: "PA",
      slipSeat: false,
      dropHookRequired: true,
      loads: [
        {
          id: "load-1",
          rateConfirmationId: "rc-1",
          ref: "REF-1",
          status: "BOOKED",
          shipper: "Shipper",
          receiver: "Receiver",
          lineHaul: 1000,
          loadedMi: 200,
          puDh: 10,
          delDh: 20,
          totalMi: 230,
          negMi: 210,
          loadedRpm: 5,
          floorRpm: 4.7,
          routeId: "route-1",
          loadNumber: "L1",
          pickupNumber: "P1",
          pickupNumbers: ["P1"],
          lateCancelFailedNote: null,
          attentionSeverity: "INFO",
          scaleBeforeTask: "NOT_DONE",
          scaleAfterTask: "NOT_DONE",
          brokerName: "Broker",
          brokerRepName: null,
          mgStatusTask: "NOT_DONE",
          tmwStatusTask: "NOT_DONE",
          pickupDriverAssigned: "Driver",
          tractorTrailer1: "TT1",
          tractorTrailer2: "TT2",
          commodity: "General",
          equipmentNeeds: "Van",
          equipmentType: "VAN_53",
          equipmentAccessory: "NONE",
          equipmentOtherText: null,
          puStatusPreset: "OTHER",
          puStatusCustom: null,
          deliveryDate: null,
          delStatusPreset: "OTHER",
          delStatusCustom: null,
          podStatus: "Pending",
          fscAmount: 0,
          tonuAmount: 0,
          allInRevenue: 1000,
          coordinatorNotes: null,
          driverType: "PTP",
          pickupCityState: "A, PA",
          pickupWindow: "AM",
          deliveryCityState: "B, PA",
          deliveryWindow: "PM",
          dropLotName: "LOT A",
          legs: []
        }
      ]
    }
  ]
};

const detailPayload = {
  id: "load-1",
  status: "BOOKED",
  sectionCode: "LOT-A",
  threePlRefNumber: "REF-1",
  routeId: "route-1",
  loadNumber: "L1",
  pickupNumber: "P1",
  shipperName: "Shipper",
  pickupCityState: "A, PA",
  pickupWindow: "AM",
  receiverName: "Receiver",
  deliveryCityState: "B, PA",
  deliveryWindow: "PM",
  lineHaulRate: "1000",
  loadedMiles: "200",
  puDeadheadMiles: "10",
  delDeadheadMiles: "20",
  totalTripMiles: "230",
  negotiableMiles: "210",
  loadedRpm: "5",
  negotiationFloorRpm: "4.7",
  emptyMilePct: "0.1",
  brokerName: "Broker",
  pickupDriverAssigned: "Driver",
  tractorTrailer1: "TT1",
  tractorTrailer2: "TT2",
  commodity: "General",
  equipmentNeeds: "Van",
  mgStatus: "OK",
  tmwStatus: "OK",
  podStatus: "Pending",
  rateConfirmation: null,
  createdAt: "2026-04-29T00:00:00.000Z",
  updatedAt: "2026-04-29T00:00:00.000Z"
};

describe("board shell keyboard accessibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/rate-confirmations/activity")) {
          return new Response(JSON.stringify({
            pending: [{ id: "rc-pending-1", parseState: "EXTRACTING", reviewDecision: "PENDING" }],
            ready: [{ id: "rc-ready-1", parseState: "EXTRACTED", reviewDecision: "APPROVED" }],
            recent: [{ id: "rc-ready-1", parseState: "EXTRACTED", reviewDecision: "APPROVED", updatedAt: "2026-04-29T10:42:00.000Z" }]
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (url.includes("/api/board/load/")) {
          return new Response(JSON.stringify(detailPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response("Not found", { status: 404 });
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  test("opens and closes drawer via keyboard from board row", async () => {
    const user = userEvent.setup();
    render(<BoardShell board={boardFixture} />);

    const rowButton = screen.getByRole("button", { name: "Open details for REF-1" });
    rowButton.focus();
    expect(rowButton).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    const dialog = await screen.findByRole("dialog");
    const closeButton = within(dialog).getByRole("button", { name: "Close load details" });
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(rowButton).toHaveFocus();
    });
  });

  test("renders canonical rail and bucket shell affordances", () => {
    const { container } = render(<BoardShell board={boardFixture} />);
    expect(screen.getByText("DROP LOTS")).toBeInTheDocument();
    expect(screen.getByText("VIEW")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All loads" })).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.getByText("RECENT (24h)")).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(container.querySelector(".db-tag.warn svg")).not.toBeNull();
  });

  test("keeps a single keyboard stop for load row activation button", () => {
    const { container } = render(<BoardShell board={boardFixture} />);
    const row = container.querySelector("tr.db-row");
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("button", { name: "Open details for REF-1" })).toBeInTheDocument();
  });

  test("renders pulse and ready card states from activity", async () => {
    const { container } = render(<BoardShell board={boardFixture} />);
    await waitFor(() => {
      expect(container.querySelector(".db-bucket-badge.pulse")).not.toBeNull();
      expect(container.querySelector(".db-bucket-card.ready")).not.toBeNull();
      expect(container.querySelector(".db-bucket-card-status.ready")).not.toBeNull();
    });
  });

  test("flags row when loaded RPM drops below floor", () => {
    const flaggedBoard: ViewBoardResponse = {
      ...boardFixture,
      sections: [
        {
          ...boardFixture.sections[0],
          loads: [
            {
              ...boardFixture.sections[0].loads[0],
              loadedRpm: 3.9,
              floorRpm: 4.7
            }
          ]
        }
      ]
    };
    const { container } = render(<BoardShell board={flaggedBoard} />);
    expect(container.querySelector("tr.db-row.flagged")).not.toBeNull();
  });

  test("late filter uses PU/DEL status, not lifecycle status", async () => {
    const user = userEvent.setup();
    const lateBoard: ViewBoardResponse = {
      ...boardFixture,
      sections: [
        {
          ...boardFixture.sections[0],
          loads: [
            {
              ...boardFixture.sections[0].loads[0],
              id: "load-late",
              ref: "REF-LATE",
              status: "BOOKED",
              puStatusPreset: "LATE"
            },
            {
              ...boardFixture.sections[0].loads[0],
              id: "load-not-late",
              ref: "REF-ONTIME",
              status: "CANCELED",
              puStatusPreset: "DONE",
              delStatusPreset: "DONE"
            }
          ]
        }
      ]
    };
    render(<BoardShell board={lateBoard} />);
    await user.click(screen.getByRole("button", { name: "Late only" }));
    expect(screen.getByText("REF-LATE")).toBeInTheDocument();
    expect(screen.queryByText("REF-ONTIME")).toBeNull();
  });

  test("applies initial highlight for review-to-board handoff", () => {
    const { container } = render(<BoardShell board={boardFixture} initialHighlightLoadId="load-1" />);
    expect(container.querySelector("tr.db-row.selected")).not.toBeNull();
  });

  test("surfaces mutation map-failure and attempts board refetch", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/rate-confirmations/activity")) {
        return new Response(JSON.stringify({ pending: [], ready: [], recent: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "/api/board" && init?.method === "POST") {
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("/api/board?date=")) {
        return new Response(JSON.stringify({ error: "forced-refresh-failure" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("/api/board/load/")) {
        return new Response(JSON.stringify(detailPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BoardShell board={boardFixture} />);
    const row = screen.getByRole("button", { name: "Open details for REF-1" }).closest("tr");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board?date=2026-04-29&regionId=region-1",
        expect.anything()
      );
      expect(screen.getByText("forced-refresh-failure")).toBeInTheDocument();
    });
  });

  test("confirms delete dialog on Enter key", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/rate-confirmations/activity")) {
        return new Response(JSON.stringify({ pending: [], ready: [], recent: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "/api/board" && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "forced-delete-error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("/api/board/load/")) {
        return new Response(JSON.stringify(detailPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<BoardShell board={boardFixture} />);

    const row = screen.getByRole("button", { name: "Open details for REF-1" }).closest("tr");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);
    await user.click(screen.getByRole("button", { name: "Edit / View" }));
    await user.click(screen.getByRole("button", { name: "X" }));

    const deleteDialog = screen.getByRole("dialog", { name: "Delete load" });
    const reasonInput = within(deleteDialog).getByRole("textbox");
    await user.type(reasonInput, "valid delete reason");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board",
        expect.objectContaining({ method: "POST" })
      );
      expect(screen.getByText("forced-delete-error")).toBeInTheDocument();
    });
  });

  test("shows busy state while TONU mutation is pending", async () => {
    const pendingResponses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/rate-confirmations/activity")) {
        return Promise.resolve(
          new Response(JSON.stringify({ pending: [], ready: [], recent: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }
      if (url === "/api/board" && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          pendingResponses.push(resolve);
        });
      }
      if (url.includes("/api/board/load/")) {
        return Promise.resolve(
          new Response(JSON.stringify(detailPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<BoardShell board={boardFixture} />);

    const row = screen.getByRole("button", { name: "Open details for REF-1" }).closest("tr");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);
    await user.click(screen.getByRole("button", { name: "Mark TONU" }));
    await user.click(screen.getByRole("button", { name: "Confirm TONU" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    pendingResponses.forEach((resolve) =>
      resolve(
        new Response(JSON.stringify({ error: "forced-timeout" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await waitFor(() => {
      expect(screen.getByText("forced-timeout")).toBeInTheDocument();
    });
  });

  test("collapses and expands sticky rail with accessible toggle", async () => {
    const user = userEvent.setup();
    const { container } = render(<BoardShell board={boardFixture} />);
    const railToggle = screen.getByRole("button", { name: "Collapse" });

    expect(railToggle).toHaveAttribute("aria-expanded", "true");
    await user.click(railToggle);
    expect(railToggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("#board-left-rail.db-rail.collapsed")).not.toBeNull();
  });

  test("defaults to light theme and persists dark mode toggle", async () => {
    const user = userEvent.setup();
    render(<BoardShell board={boardFixture} />);
    const themeToggle = screen.getByRole("button", { name: "Switch to dark mode" });

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
    await user.click(themeToggle);
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(window.localStorage.getItem("db-theme")).toBe("dark");
    });
  });
});
