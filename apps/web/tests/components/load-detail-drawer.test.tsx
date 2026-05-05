import React from "react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadDetailDrawer } from "@/components/board/load-detail-drawer";

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

describe("load detail drawer interactions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(detailPayload), { status: 200, headers: { "Content-Type": "application/json" } }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders nothing when loadId is null", () => {
    render(<LoadDetailDrawer loadId={null} onClose={() => undefined} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("renders dialog with accessible title linkage", async () => {
    render(<LoadDetailDrawer loadId="load-1" onClose={() => undefined} />);
    const dialog = await screen.findByRole("dialog");
    const title = await screen.findByRole("heading", { name: "REF-1" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", title.id);
  });

  test("closes on Escape and backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<LoadDetailDrawer loadId="load-1" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    const dialog = screen.getByRole("dialog");
    const closeButton = within(dialog).getByRole("button", { name: "Close load details" });
    closeButton.focus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = document.querySelector(".db-drawer-backdrop");
    expect(backdrop).toBeInstanceOf(HTMLElement);
    await user.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("traps focus inside drawer", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button>Outside action</button>
        <LoadDetailDrawer loadId="load-1" onClose={() => undefined} />
      </div>
    );

    await screen.findByRole("dialog");
    const dialog = screen.getByRole("dialog");
    const outsideButton = screen.getByRole("button", { name: "Outside action" });
    const closeButton = within(dialog).getByRole("button", { name: "Close load details" });
    const firstAction = within(dialog).getByRole("button", { name: "Mark Booked" });

    closeButton.focus();
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(firstAction).toHaveFocus();

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();
    expect(outsideButton).not.toHaveFocus();
  });

  test("restores focus to trigger when closed", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open drawer</button>
          <LoadDetailDrawer loadId={open ? "load-1" : null} onClose={() => setOpen(false)} />
        </div>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open drawer" });
    trigger.focus();
    await user.click(trigger);

    await screen.findByRole("dialog");
    const dialog = screen.getByRole("dialog");
    const closeButton = within(dialog).getByRole("button", { name: "Close load details" });
    closeButton.focus();

    const backdrop = document.querySelector(".db-drawer-backdrop");
    expect(backdrop).toBeInstanceOf(HTMLElement);
    await user.click(backdrop as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger).toHaveFocus();
    });
  });

  test("renders fetch error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "No detail available" }), { status: 404 }))
    );
    render(<LoadDetailDrawer loadId="missing" onClose={() => undefined} />);
    expect(await screen.findByText("No detail available")).toBeInTheDocument();
  });
});
