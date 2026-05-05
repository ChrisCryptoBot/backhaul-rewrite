"use client";

import React from "react";
import { CloseIcon } from "@/components/icons";
import type { ViewLoadDetail } from "@/lib/ui/drawer-mappers";
import { mapLoadDetailToView } from "@/lib/ui/drawer-mappers";
import { money, miles, pct, rpm } from "@/lib/ui/formatters";
import { StatusPill } from "./status-pill";

interface LoadDetailDrawerProps {
  loadId: string | null;
  regionId: string;
  onClose: () => void;
  onSetStatus?: (loadId: string, status: "BOOKED" | "CANCELED" | "FAILED") => Promise<void>;
  onUpdateFields?: (loadId: string, fields: any) => Promise<void>;
  onUpsertLeg?: (
    loadId: string,
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
    }
  ) => Promise<void>;
  onDeleteLeg?: (loadId: string, legId: string) => Promise<void>;
}

interface ApiErrorPayload {
  error?: string;
}

function Timeline({ timeline }: Pick<ViewLoadDetail, "timeline">) {
  return (
    <div className="db-timeline">
      {timeline.map((step) => (
        <div key={step.key} className={`db-tl-step db-tl-${step.state}`}>
          <div className="db-tl-dot" />
          <div className="db-tl-label">{step.key.replaceAll("_", " ")}</div>
        </div>
      ))}
    </div>
  );
}

export function LoadDetailDrawer({
  loadId,
  regionId,
  onClose,
  onSetStatus,
  onUpdateFields,
  onUpsertLeg,
  onDeleteLeg
}: LoadDetailDrawerProps) {
  const [detail, setDetail] = React.useState<ViewLoadDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);
  const [formState, setFormState] = React.useState({
    mgStatusTask: "NOT_DONE",
    tmwStatusTask: "NOT_DONE",
    scaleBeforeTask: "NOT_DONE",
    scaleAfterTask: "NOT_DONE",
    pickupDriverAssigned: "",
    commodity: "",
    equipmentNeeds: "",
    podStatus: "",
    driverType: "",
    attentionSeverity: "INFO",
    attentionNote: "",
    coordinatorNotes: ""
  });
  const [legForm, setLegForm] = React.useState({
    id: "",
    legIndex: "1",
    legType: "PTP",
    driverName: "",
    startCity: "",
    startState: "",
    endCity: "",
    endState: "",
    legMiles: "",
    notes: ""
  });
  const drawerRef = React.useRef<HTMLElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const previousLoadIdRef = React.useRef<string | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!loadId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      setSaving(false);
      setSaveError(null);
      setSaveMessage(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/board/load/${loadId}?regionId=${encodeURIComponent(regionId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
          throw new Error(payload?.error ?? "Unable to load details.");
        }
        return response.json();
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setDetail(mapLoadDetailToView(payload));
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load details.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadId, regionId, reloadNonce]);

  React.useEffect(() => {
    if (!detail) {
      return;
    }
    const dashToEmpty = (value: string) => (value === "—" ? "" : value);
    setFormState({
      mgStatusTask: detail.operations.mgStatusTask === "DONE" ? "DONE" : "NOT_DONE",
      tmwStatusTask: detail.operations.tmwStatusTask === "DONE" ? "DONE" : "NOT_DONE",
      scaleBeforeTask: detail.operations.scaleBeforeTask === "DONE" ? "DONE" : "NOT_DONE",
      scaleAfterTask: detail.operations.scaleAfterTask === "DONE" ? "DONE" : "NOT_DONE",
      pickupDriverAssigned: dashToEmpty(detail.operations.pickupDriverAssigned),
      commodity: dashToEmpty(detail.operations.commodity),
      equipmentNeeds: dashToEmpty(detail.operations.equipmentNeeds),
      podStatus: dashToEmpty(detail.operations.podStatus),
      driverType: dashToEmpty(detail.operations.driverType),
      attentionSeverity: ["INFO", "WARN", "URGENT"].includes(detail.operations.attentionSeverity)
        ? detail.operations.attentionSeverity
        : "INFO",
      attentionNote: dashToEmpty(detail.operations.attentionNote),
      coordinatorNotes: dashToEmpty(detail.operations.coordinatorNotes)
    });
    setSaveError(null);
    setSaveMessage(null);
  }, [detail]);

  React.useEffect(() => {
    const wasOpen = previousLoadIdRef.current !== null;
    const isOpen = loadId !== null;

    if (isOpen && !wasOpen) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusFrame = window.requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
      previousLoadIdRef.current = loadId;
      return () => {
        window.cancelAnimationFrame(focusFrame);
      };
    }

    if (!isOpen && wasOpen) {
      const target = restoreFocusRef.current;
      restoreFocusRef.current = null;
      const restoreFrame = window.requestAnimationFrame(() => {
        target?.focus();
      });
      previousLoadIdRef.current = null;
      return () => {
        window.cancelAnimationFrame(restoreFrame);
      };
    }

    previousLoadIdRef.current = loadId;
  }, [loadId]);

  const handleDialogKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }

      const focusableElements = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    },
    [onClose]
  );

  const applyStatus = React.useCallback(
    async (status: "BOOKED" | "CANCELED" | "FAILED") => {
      if (!loadId || !onSetStatus) {
        return;
      }
      setSaving(true);
      setSaveError(null);
      setSaveMessage(null);
      try {
        await onSetStatus(loadId, status);
        setSaveMessage(`Status updated to ${status}.`);
        setReloadNonce((value) => value + 1);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Status update failed.");
      } finally {
        setSaving(false);
      }
    },
    [loadId, onSetStatus]
  );

  const saveOperationalFields = React.useCallback(async () => {
    if (!loadId || !onUpdateFields) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await onUpdateFields(loadId, {
        mgStatusTask: formState.mgStatusTask,
        tmwStatusTask: formState.tmwStatusTask,
        scaleBeforeTask: formState.scaleBeforeTask,
        scaleAfterTask: formState.scaleAfterTask,
        pickupDriverAssigned: formState.pickupDriverAssigned.trim() || null,
        commodity: formState.commodity.trim() || null,
        equipmentNeeds: formState.equipmentNeeds.trim() || null,
        podStatus: formState.podStatus.trim() || null,
        driverType: formState.driverType.trim() || null,
        attentionSeverity: formState.attentionSeverity,
        attentionNote: formState.attentionNote.trim() || null,
        coordinatorNotes: formState.coordinatorNotes.trim() || null
      });
      setSaveMessage("Operational fields saved.");
      setReloadNonce((value) => value + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Field update failed.");
    } finally {
      setSaving(false);
    }
  }, [formState, loadId, onUpdateFields]);

  const resetLegForm = React.useCallback(() => {
    setLegForm({
      id: "",
      legIndex: "1",
      legType: "PTP",
      driverName: "",
      startCity: "",
      startState: "",
      endCity: "",
      endState: "",
      legMiles: "",
      notes: ""
    });
  }, []);

  const editLeg = React.useCallback((leg: ViewLoadDetail["legs"][number]) => {
    setLegForm({
      id: leg.id,
      legIndex: String(leg.legIndex),
      legType: (leg.legType === "SHUTTLE" || leg.legType === "PTP" || leg.legType === "DELIVERY" ? leg.legType : "PTP") as
        | "SHUTTLE"
        | "PTP"
        | "DELIVERY",
      driverName: leg.driverName === "—" ? "" : leg.driverName,
      startCity: leg.start === "—" ? "" : leg.start.split(",")[0]?.trim() ?? "",
      startState: leg.start === "—" ? "" : leg.start.split(",")[1]?.trim() ?? "",
      endCity: leg.end === "—" ? "" : leg.end.split(",")[0]?.trim() ?? "",
      endState: leg.end === "—" ? "" : leg.end.split(",")[1]?.trim() ?? "",
      legMiles: leg.legMiles === null ? "" : String(leg.legMiles),
      notes: leg.notes === "—" ? "" : leg.notes
    });
  }, []);

  const saveLeg = React.useCallback(async () => {
    if (!loadId || !onUpsertLeg) {
      return;
    }
    const parsedIndex = Number.parseInt(legForm.legIndex, 10);
    if (!Number.isFinite(parsedIndex) || parsedIndex <= 0) {
      setSaveError("Leg index must be a positive number.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await onUpsertLeg(loadId, {
        id: legForm.id || undefined,
        legIndex: parsedIndex,
        legType: legForm.legType as "SHUTTLE" | "PTP" | "DELIVERY",
        driverName: legForm.driverName.trim() || null,
        startCity: legForm.startCity.trim() || null,
        startState: legForm.startState.trim() || null,
        endCity: legForm.endCity.trim() || null,
        endState: legForm.endState.trim() || null,
        legMiles: legForm.legMiles.trim() || null,
        notes: legForm.notes.trim() || null
      });
      setSaveMessage(legForm.id ? "Leg updated." : "Leg added.");
      resetLegForm();
      setReloadNonce((value) => value + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Leg save failed.");
    } finally {
      setSaving(false);
    }
  }, [legForm, loadId, onUpsertLeg, resetLegForm]);

  const removeLeg = React.useCallback(
    async (legId: string) => {
      if (!loadId || !onDeleteLeg) {
        return;
      }
      setSaving(true);
      setSaveError(null);
      setSaveMessage(null);
      try {
        await onDeleteLeg(loadId, legId);
        if (legForm.id === legId) {
          resetLegForm();
        }
        setSaveMessage("Leg deleted.");
        setReloadNonce((value) => value + 1);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Leg delete failed.");
      } finally {
        setSaving(false);
      }
    },
    [legForm.id, loadId, onDeleteLeg, resetLegForm]
  );

  if (!loadId) {
    return null;
  }

  return (
    <>
      <div className="db-drawer-backdrop" role="presentation" onClick={onClose} />
      <aside
        ref={drawerRef}
        className="db-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="db-drawer-head">
          <div>
            <div className="db-drawer-eyebrow">Load Detail</div>
            <h2 id={titleId} className="db-drawer-title">
              {detail?.ref ?? "Loading..."}
            </h2>
          </div>
          <button ref={closeButtonRef} className="db-btn db-btn-ghost" onClick={onClose} aria-label="Close load details">
            <CloseIcon size={14} />
          </button>
        </header>
        {detail ? (
          <div className="db-drawer-meta">
            <StatusPill status={detail.status} />
            <span className="db-drawer-meta-sep" />
            <span className="mono">Route {detail.ids.routeId}</span>
          </div>
        ) : null}
        {loading ? (
          <div className="db-drawer-block">
            <div className="db-drawer-skeleton-title db-skel">Loading details</div>
            <div className="db-drawer-skeleton-row db-skel">Timeline placeholder</div>
            <div className="db-drawer-skeleton-row db-skel">Financials placeholder</div>
            <div className="db-drawer-skeleton-row db-skel">Operations placeholder</div>
          </div>
        ) : null}
        {error ? <p className="db-drawer-block">{error}</p> : null}
        {!loading && !error && detail ? (
          <div className="db-drawer-body">
            <section className="db-drawer-block">
              <h3>DH & Leg Accounting</h3>
              <div className="db-drawer-kv-grid">
                <p>PU DH: {miles(detail.financials.puDh)}</p>
                <p>DEL DH: {miles(detail.financials.delDh)}</p>
                <p>Empty Miles: {miles((detail.financials.puDh ?? 0) + (detail.financials.delDh ?? 0))}</p>
                <p>Total Trip: {miles(detail.financials.totalMi)}</p>
                <p>Leg Miles (sum): {miles(detail.legs.reduce((sum, leg) => sum + (leg.legMiles ?? 0), 0))}</p>
                <p>Empty %: {pct(detail.financials.emptyPct, { fromRatio: true })}</p>
              </div>
              {(detail.financials.puDh ?? 0) + (detail.financials.delDh ?? 0) > 80 ? (
                <p className="db-upload-error">DH alert: empty miles exceed 80. Confirm deadhead decision and exception note.</p>
              ) : null}
            </section>
            <section className="db-drawer-block">
              <h3>Quick Actions</h3>
              <div className="db-row-with-actions db-drawer-actions-row">
                <button className="db-btn db-btn-mini" type="button" disabled={saving} onClick={() => void applyStatus("BOOKED")}>
                  Mark Booked
                </button>
                <button className="db-btn db-btn-mini" type="button" disabled={saving} onClick={() => void applyStatus("CANCELED")}>
                  Mark Canceled
                </button>
                <button className="db-btn db-btn-mini" type="button" disabled={saving} onClick={() => void applyStatus("FAILED")}>
                  Mark Failed
                </button>
              </div>
              <div className="db-drawer-form-grid">
                <label className="db-field-label">
                  MG Task
                  <select className="db-input" value={formState.mgStatusTask} onChange={(e) => setFormState((s) => ({ ...s, mgStatusTask: e.target.value }))}>
                    <option value="NOT_DONE">NOT_DONE</option>
                    <option value="DONE">DONE</option>
                  </select>
                </label>
                <label className="db-field-label">
                  TMW Task
                  <select className="db-input" value={formState.tmwStatusTask} onChange={(e) => setFormState((s) => ({ ...s, tmwStatusTask: e.target.value }))}>
                    <option value="NOT_DONE">NOT_DONE</option>
                    <option value="DONE">DONE</option>
                  </select>
                </label>
                <label className="db-field-label">
                  Scale Before
                  <select className="db-input" value={formState.scaleBeforeTask} onChange={(e) => setFormState((s) => ({ ...s, scaleBeforeTask: e.target.value }))}>
                    <option value="NOT_DONE">NOT_DONE</option>
                    <option value="DONE">DONE</option>
                  </select>
                </label>
                <label className="db-field-label">
                  Scale After
                  <select className="db-input" value={formState.scaleAfterTask} onChange={(e) => setFormState((s) => ({ ...s, scaleAfterTask: e.target.value }))}>
                    <option value="NOT_DONE">NOT_DONE</option>
                    <option value="DONE">DONE</option>
                  </select>
                </label>
                <label className="db-field-label">
                  Driver Assigned
                  <input className="db-input" value={formState.pickupDriverAssigned} onChange={(e) => setFormState((s) => ({ ...s, pickupDriverAssigned: e.target.value }))} />
                </label>
                <label className="db-field-label">
                  Driver Type
                  <select className="db-input" value={formState.driverType} onChange={(e) => setFormState((s) => ({ ...s, driverType: e.target.value }))}>
                    <option value="">—</option>
                    <option value="SHUTTLE">SHUTTLE</option>
                    <option value="PTP">PTP</option>
                    <option value="LTL">LTL</option>
                  </select>
                </label>
                <label className="db-field-label">
                  POD Status
                  <select className="db-input" value={formState.podStatus} onChange={(e) => setFormState((s) => ({ ...s, podStatus: e.target.value }))}>
                    <option value="">—</option>
                    <option value="NOT_REQUESTED">NOT_REQUESTED</option>
                    <option value="REQUESTED">REQUESTED</option>
                    <option value="UPLOADED">UPLOADED</option>
                    <option value="SENT_TO_BROKER">SENT_TO_BROKER</option>
                    <option value="NEEDS_ATTENTION">NEEDS_ATTENTION</option>
                  </select>
                </label>
                <label className="db-field-label">
                  Attention Severity
                  <select className="db-input" value={formState.attentionSeverity} onChange={(e) => setFormState((s) => ({ ...s, attentionSeverity: e.target.value }))}>
                    <option value="INFO">INFO</option>
                    <option value="WARN">WARN</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </label>
                <label className="db-field-label">
                  Commodity
                  <input className="db-input" value={formState.commodity} onChange={(e) => setFormState((s) => ({ ...s, commodity: e.target.value }))} />
                </label>
                <label className="db-field-label">
                  Equipment Needs
                  <input className="db-input" value={formState.equipmentNeeds} onChange={(e) => setFormState((s) => ({ ...s, equipmentNeeds: e.target.value }))} />
                </label>
                <label className="db-field-label db-drawer-form-full">
                  Attention Note
                  <textarea className="db-input" rows={2} value={formState.attentionNote} onChange={(e) => setFormState((s) => ({ ...s, attentionNote: e.target.value }))} />
                </label>
                <label className="db-field-label db-drawer-form-full">
                  Coordinator Notes
                  <textarea className="db-input" rows={3} value={formState.coordinatorNotes} onChange={(e) => setFormState((s) => ({ ...s, coordinatorNotes: e.target.value }))} />
                </label>
              </div>
              <div className="db-row-with-actions db-drawer-actions-row">
                <button className="db-btn" type="button" disabled={saving} aria-busy={saving} onClick={() => void saveOperationalFields()}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
                {saveMessage ? <span className="dim">{saveMessage}</span> : null}
                {saveError ? <span className="db-upload-error">{saveError}</span> : null}
              </div>
            </section>
            <section className="db-drawer-block">
              <h3>Timeline</h3>
              <Timeline timeline={detail.timeline} />
            </section>
            <section className="db-drawer-block">
              <h3>Identifiers</h3>
              <p>Load #: {detail.ids.loadNumber}</p>
              <p>Pickup #: {detail.ids.pickupNumber}</p>
              <p>PU list: {detail.ids.pickupNumbers.length > 0 ? detail.ids.pickupNumbers.join(", ") : "—"}</p>
            </section>
            <section className="db-drawer-block">
              <h3>Geography</h3>
              <p>{detail.geography.shipper}</p>
              <p>
                {detail.geography.pickupCityState} ({detail.geography.pickupWindow})
              </p>
              <p>{detail.geography.receiver}</p>
              <p>
                {detail.geography.deliveryCityState} ({detail.geography.deliveryWindow})
              </p>
            </section>
            <section className="db-drawer-block">
              <h3>Financials</h3>
              <p>Line Haul: {money(detail.financials.lineHaul)}</p>
              <p>Loaded Mi: {miles(detail.financials.loadedMi)}</p>
              <p>PU DH: {miles(detail.financials.puDh)}</p>
              <p>DEL DH: {miles(detail.financials.delDh)}</p>
              <p>Total Mi: {miles(detail.financials.totalMi)}</p>
              <p>Neg Mi: {miles(detail.financials.negMi)}</p>
              <p>Loaded RPM: {rpm(detail.financials.loadedRpm)}</p>
              <p>Floor RPM: {rpm(detail.financials.floorRpm)}</p>
              <p>Empty %: {pct(detail.financials.emptyPct, { fromRatio: true })}</p>
            </section>
            <section className="db-drawer-block">
              <h3>Operations</h3>
              <p>Broker: {detail.operations.brokerName}</p>
              <p>Driver: {detail.operations.pickupDriverAssigned}</p>
              <p>Commodity: {detail.operations.commodity}</p>
              <p>Equipment: {detail.operations.equipmentNeeds}</p>
              <p>Tractor/Trailer: {detail.operations.tractorTrailer}</p>
              <p>MG: {detail.operations.mgStatus}</p>
              <p>TMW: {detail.operations.tmwStatus}</p>
              <p>MG Task: {detail.operations.mgStatusTask}</p>
              <p>TMW Task: {detail.operations.tmwStatusTask}</p>
              <p>Scale Before: {detail.operations.scaleBeforeTask}</p>
              <p>Scale After: {detail.operations.scaleAfterTask}</p>
              <p>Driver Type: {detail.operations.driverType}</p>
              <p>Attention: {detail.operations.attentionSeverity} - {detail.operations.attentionNote}</p>
              <p>Coordinator Notes: {detail.operations.coordinatorNotes}</p>
              <p>POD: {detail.operations.podStatus}</p>
            </section>
            <section className="db-drawer-block">
              <h3>Legs</h3>
              <div className="db-drawer-form-grid">
                <label className="db-field-label">
                  Leg Index
                  <input
                    className="db-input"
                    inputMode="numeric"
                    value={legForm.legIndex}
                    onChange={(e) => setLegForm((s) => ({ ...s, legIndex: e.target.value }))}
                  />
                </label>
                <label className="db-field-label">
                  Leg Type
                  <select className="db-input" value={legForm.legType} onChange={(e) => setLegForm((s) => ({ ...s, legType: e.target.value }))}>
                    <option value="SHUTTLE">SHUTTLE</option>
                    <option value="PTP">PTP</option>
                    <option value="DELIVERY">DELIVERY</option>
                  </select>
                </label>
                <label className="db-field-label">
                  Driver
                  <input className="db-input" value={legForm.driverName} onChange={(e) => setLegForm((s) => ({ ...s, driverName: e.target.value }))} />
                </label>
                <label className="db-field-label">
                  Leg Miles
                  <input className="db-input" value={legForm.legMiles} onChange={(e) => setLegForm((s) => ({ ...s, legMiles: e.target.value }))} />
                </label>
                <label className="db-field-label">
                  Start City
                  <input className="db-input" value={legForm.startCity} onChange={(e) => setLegForm((s) => ({ ...s, startCity: e.target.value }))} />
                </label>
                <label className="db-field-label">
                  Start ST
                  <input className="db-input" value={legForm.startState} onChange={(e) => setLegForm((s) => ({ ...s, startState: e.target.value }))} />
                </label>
                <label className="db-field-label">
                  End City
                  <input className="db-input" value={legForm.endCity} onChange={(e) => setLegForm((s) => ({ ...s, endCity: e.target.value }))} />
                </label>
                <label className="db-field-label">
                  End ST
                  <input className="db-input" value={legForm.endState} onChange={(e) => setLegForm((s) => ({ ...s, endState: e.target.value }))} />
                </label>
                <label className="db-field-label db-drawer-form-full">
                  Leg Notes / Handoff Note
                  <textarea className="db-input" rows={2} value={legForm.notes} onChange={(e) => setLegForm((s) => ({ ...s, notes: e.target.value }))} />
                </label>
              </div>
              <div className="db-row-with-actions db-drawer-actions-row">
                <button className="db-btn db-btn-mini" type="button" disabled={saving} onClick={() => void saveLeg()}>
                  {legForm.id ? "Update leg" : "Add leg"}
                </button>
                {legForm.id ? (
                  <button className="db-btn db-btn-mini db-btn-ghost" type="button" disabled={saving} onClick={resetLegForm}>
                    Cancel edit
                  </button>
                ) : null}
              </div>
              {detail.legs.length === 0 ? <p>No legs recorded.</p> : null}
              {detail.legs.map((leg) => (
                <div key={leg.id} className="db-drawer-leg-row">
                  <p>
                    #{leg.legIndex} {leg.legType} - {leg.start} {"->"} {leg.end} ({miles(leg.legMiles)}) [{leg.driverName}]
                  </p>
                  <div className="db-row-with-actions">
                    <button className="db-btn db-btn-mini db-btn-ghost" type="button" disabled={saving} onClick={() => editLeg(leg)}>
                      Edit
                    </button>
                    <button className="db-btn db-btn-mini db-btn-ghost" type="button" disabled={saving} onClick={() => void removeLeg(leg.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </section>
            <section className="db-drawer-block">
              <h3>Rate Confirmation</h3>
              {detail.rateConfirmation ? (
                <>
                  <p>
                    <a href={detail.rateConfirmation.sourceFileUrl} target="_blank" rel="noreferrer">
                      Open source file
                    </a>
                  </p>
                  <p>Parse state: {detail.rateConfirmation.parseState}</p>
                  <p>
                    Parse confidence:{" "}
                    {detail.rateConfirmation.parseConfidence === null
                      ? "—"
                      : pct(detail.rateConfirmation.parseConfidence, { fromRatio: true })}
                  </p>
                  <iframe
                    src={detail.rateConfirmation.sourceFileUrl}
                    title={`Rate confirmation ${detail.rateConfirmation.id}`}
                    style={{ width: "100%", height: 360, border: "1px solid var(--db-border-soft)" }}
                  />
                </>
              ) : (
                <p>No rate confirmation attached.</p>
              )}
            </section>
          </div>
        ) : null}
      </aside>
    </>
  );
}
