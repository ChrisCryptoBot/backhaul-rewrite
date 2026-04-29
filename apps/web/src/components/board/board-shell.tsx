"use client";

import React from "react";
import { CalendarIcon, ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { int, money, pct, rpm } from "@/lib/ui/formatters";
import type { ViewBoardResponse } from "@/lib/ui/board-mappers";
import { MAX_UPLOAD_FILES, splitUploadBatch, uploadDropzoneLabel } from "@/lib/ui/upload-utils";
import { StatusPill } from "./status-pill";
import { LoadDetailDrawer } from "./load-detail-drawer";

interface BoardShellProps {
  board: ViewBoardResponse;
  boardError?: string | null;
}

interface ActivityResponse {
  pending: Array<{ id: string; parseState: string }>;
  ready: Array<{ id: string; parseState: string }>;
  recent: Array<{ id: string; parseState: string; updatedAt: string }>;
}

type LocalUploadStatus = "uploading" | "parsing" | "ready" | "failed";

interface LocalUploadItem {
  localId: string;
  fileName: string;
  status: LocalUploadStatus;
  message: string;
  createdAtMs: number;
  file?: File;
  rateConfirmationId?: string;
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read file."));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Unable to encode file."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function statusLabel(status: LocalUploadStatus): string {
  if (status === "uploading") {
    return "Uploading";
  }
  if (status === "parsing") {
    return "Parsing";
  }
  if (status === "ready") {
    return "Ready for review";
  }
  return "Failed";
}

export function BoardShell({ board, boardError = null }: BoardShellProps) {
  const [selectedLoadId, setSelectedLoadId] = React.useState<string | null>(null);
  const [activity, setActivity] = React.useState<ActivityResponse | null>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [localUploads, setLocalUploads] = React.useState<LocalUploadItem[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [clockMs, setClockMs] = React.useState(() => Date.now());
  const [dismissedFailedRecentIds, setDismissedFailedRecentIds] = React.useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const run = () => {
      fetch(`/api/rate-confirmations/activity?date=${board.date}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload) => {
          if (!cancelled && payload) {
            setActivity(payload);
          }
        })
        .catch(() => {
          // Keep footer resilient while backend data catches up.
        });
    };
    run();
    const id = window.setInterval(run, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [board.date]);

  React.useEffect(() => {
    const id = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const uploadFiles = React.useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      const fileArray = Array.from(files).filter((file) => file.size > 0);
      if (fileArray.length === 0) {
        return;
      }
      if (fileArray.length > MAX_UPLOAD_FILES) {
        setUploadError(`Maximum ${MAX_UPLOAD_FILES} files at a time.`);
        return;
      }

      const { rejectedFiles, oversizedFiles, validFiles } = splitUploadBatch(fileArray);
      const errors: string[] = [];
      if (rejectedFiles.length > 0) {
        const draggedEmail = rejectedFiles.some((file) => file.name.toLowerCase().endsWith(".msg"));
        errors.push(draggedEmail ? "Drag the attachment, not the email." : "Only PDF files are accepted.");
      }
      if (oversizedFiles.length > 0) {
        errors.push(
          `${oversizedFiles.length} file(s) too large (max 10MB). Uploading ${validFiles.length} valid file(s).`
        );
      }
      if (errors.length > 0) {
        setUploadError(errors.join(" "));
      }
      if (validFiles.length === 0) {
        return;
      }

      for (const file of validFiles) {
        const localId = `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
        const nextItem: LocalUploadItem = {
          localId,
          fileName: file.name,
          status: "uploading",
          message: "Uploading",
          createdAtMs: Date.now(),
          file
        };
        setLocalUploads((previous) => [
          nextItem,
          ...previous
        ].slice(0, 20));

        try {
          const fileContentBase64 = await readFileAsBase64(file);
          const response = await fetch("/api/rate-confirmations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `${Date.now()}-${localId}`
            },
            body: JSON.stringify({
              regionId: board.regionId,
              pickupDate: `${board.date}T12:00:00.000Z`,
              sourceFileName: file.name,
              fileContentBase64
            })
          });
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; rateConfirmationId?: string }
            | null;
          if (!response.ok) {
            throw new Error(payload?.error ?? "Upload failed.");
          }
          setLocalUploads((previous) =>
            previous.map((item) =>
              item.localId === localId
                ? {
                    ...item,
                    status: "parsing",
                    message: "Parsing",
                    rateConfirmationId: payload?.rateConfirmationId
                  }
                : item
            )
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed.";
          setLocalUploads((previous) =>
            previous.map((item) =>
              item.localId === localId
                ? {
                    ...item,
                    status: "failed",
                    message
                  }
                : item
            )
          );
          setUploadError(message);
        }
      }
    },
    [board.date, board.regionId]
  );

  React.useEffect(() => {
    if (!activity?.ready?.length) {
      return;
    }
    setLocalUploads((previous) => {
      if (!previous.some((item) => item.status === "parsing" && item.rateConfirmationId)) {
        return previous;
      }
      const readyIds = new Set(activity.ready.map((item) => item.id));
      return previous.map((item) =>
        item.status === "parsing" && item.rateConfirmationId && readyIds.has(item.rateConfirmationId)
          ? { ...item, status: "ready", message: "Ready for review" }
          : item
      );
    });
  }, [activity?.ready]);

  const pendingItems = React.useMemo(
    () => localUploads.filter((item) => item.status === "uploading" || item.status === "parsing"),
    [localUploads]
  );
  const readyLocalItems = React.useMemo(() => localUploads.filter((item) => item.status === "ready"), [localUploads]);
  const failedLocalItems = React.useMemo(() => localUploads.filter((item) => item.status === "failed"), [localUploads]);

  const failedRecent = React.useMemo(
    () =>
      (activity?.recent ?? []).filter(
        (item) => item.parseState.startsWith("FAILED") && !dismissedFailedRecentIds.includes(item.id)
      ),
    [activity, dismissedFailedRecentIds]
  );

  const dismissLocalUpload = React.useCallback((localId: string) => {
    setLocalUploads((previous) => previous.filter((item) => item.localId !== localId));
  }, []);

  const retryLocalUpload = React.useCallback(
    (item: LocalUploadItem) => {
      if (!item.file) {
        setUploadError("Cannot retry this file from memory. Please upload the PDF again.");
        return;
      }
      dismissLocalUpload(item.localId);
      void uploadFiles([item.file]);
    },
    [dismissLocalUpload, uploadFiles]
  );

  const handleReview = React.useCallback((id: string) => {
    window.location.assign(`/review?rateConfirmationId=${encodeURIComponent(id)}`);
  }, []);

  const openManualEntry = React.useCallback(() => {
    window.location.assign("/review/manual-entry");
  }, []);

  const visibleRecent = (activity?.recent ?? []).filter((item) => !dismissedFailedRecentIds.includes(item.id));

  return (
    <div className="db-root db-app">
      <header className="db-topbar">
        <div className="db-brand">DROP BUCKET</div>
        <nav className="db-topnav">
          <a className="active">Daily Board</a>
          <a href="/dashboard">KPI Dashboard</a>
          <span className="disabled">Lanes</span>
          <span className="disabled">Brokers</span>
          <span className="disabled">Audit</span>
        </nav>
        <div className="db-topbar-right">
          <button className="db-date-btn">
            <CalendarIcon size={14} />
            {board.date}
            <ChevronDownIcon size={12} />
          </button>
        </div>
      </header>

      <div className="db-layout">
        <aside className="db-rail">
          <div className="db-rail-label">Drop Lots</div>
          {board.sections.map((section) => (
            <button key={section.id} className="db-rail-item">
              <span>{section.title}</span>
              <span className="db-rail-count">{section.filledCount}</span>
            </button>
          ))}
        </aside>

        <main className="db-main">
          <div className="db-main-head">
            <div className="db-breadcrumb">
              <span>Daily Load Board</span>
              <ChevronRightIcon size={12} />
              <span>{board.date}</span>
            </div>
            <div className="db-stats">
              <span>Loads: {int(board.totals.loads)}</span>
              <span>Line Haul: {money(board.totals.lineHaul, { decimals: 0 })}</span>
              <span>Loaded Mi: {int(board.totals.loadedMiles)}</span>
              <span>Empty %: {pct(board.totals.emptyPctRatio, { fromRatio: true })}</span>
              <span>Floor RPM: {rpm(board.totals.floorRpm)}</span>
            </div>
          </div>

          {boardError ? <p className="db-msg">{boardError}</p> : null}

          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Status</th>
                  <th>Shipper</th>
                  <th>Receiver</th>
                  <th className="right">Line Haul</th>
                  <th className="right">Loaded Mi</th>
                  <th className="right">PU DH</th>
                  <th className="right">DEL DH</th>
                  <th className="right">Total Mi</th>
                  <th className="right">Floor RPM</th>
                </tr>
              </thead>
              <tbody>
                {board.sections.map((section) => (
                  <React.Fragment key={section.id}>
                    <tr className="db-section-row">
                      <td colSpan={10}>
                        {section.title} ({section.filledCount}
                        {section.capacity !== null ? `/${section.capacity}` : ""})
                      </td>
                    </tr>
                    {section.loads.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="db-empty-row">
                          No loads in this section.
                        </td>
                      </tr>
                    ) : (
                      section.loads.map((load) => (
                        <tr
                          key={load.id}
                          className={selectedLoadId === load.id ? "selected" : ""}
                          onClick={() => setSelectedLoadId(load.id)}
                        >
                          <td>{load.ref}</td>
                          <td>
                            <StatusPill status={load.status} />
                          </td>
                          <td>{load.shipper}</td>
                          <td>{load.receiver}</td>
                          <td className="right">{money(load.lineHaul)}</td>
                          <td className="right">{int(load.loadedMi)}</td>
                          <td className="right">{int(load.puDh)}</td>
                          <td className="right">{int(load.delDh)}</td>
                          <td className="right">{int(load.totalMi)}</td>
                          <td className="right">{rpm(load.floorRpm)}</td>
                        </tr>
                      ))
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="db-footer">
            <div
              className={`db-footer-card db-upload-zone ${isDragActive ? "drag-active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                  return;
                }
                setIsDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragActive(false);
                void uploadFiles(event.dataTransfer.files);
              }}
            >
              <strong>{uploadDropzoneLabel(isDragActive)}</strong>
              <span>Drag PDFs from Outlook or choose files to upload.</span>
              <div className="db-upload-actions">
                <button className="db-btn" onClick={() => fileInputRef.current?.click()}>
                  Choose files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  className="db-hidden-input"
                  onChange={(event) => {
                    if (!event.target.files) {
                      return;
                    }
                    void uploadFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
              {uploadError ? <span className="db-upload-error">{uploadError}</span> : null}
              {localUploads.length > 0 ? (
                <div className="db-upload-list">
                  {localUploads.slice(0, 3).map((item) => (
                    <div key={item.localId} className={`db-upload-item ${item.status}`}>
                      <span>{item.fileName}</span>
                      <span>
                        <span className={`db-upload-badge ${item.status}`}>{statusLabel(item.status)}</span> {item.message}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="db-footer-card">
              <strong>Pending</strong>
              <span>{(activity?.pending.length ?? 0) + pendingItems.length} parsing</span>
              {pendingItems.slice(0, 2).map((item) => (
                <span key={item.localId} className="db-footer-sub">
                  {item.fileName.slice(0, 16)}...{" "}
                  <span className={`db-upload-badge ${item.status}`}>{statusLabel(item.status)}</span> ·{" "}
                  {formatElapsed(clockMs - item.createdAtMs)}
                </span>
              ))}
              {(activity?.pending ?? []).slice(0, 2).map((item) => (
                <span key={item.id} className="db-footer-sub">
                  {item.id.slice(0, 8)}... <span className="db-upload-badge parsing">Parsing</span>
                </span>
              ))}
            </div>
            <div className="db-footer-card">
              <strong>Ready</strong>
              <span>{(activity?.ready.length ?? 0) + readyLocalItems.length} ready</span>
              {readyLocalItems.slice(0, 1).map((item) =>
                item.rateConfirmationId ? (
                  <span key={item.localId} className="db-footer-sub db-row-with-actions">
                    {item.fileName.slice(0, 16)}... <span className="db-upload-badge ready">Ready for review</span>
                    <button className="db-btn db-btn-mini" onClick={() => handleReview(item.rateConfirmationId!)}>
                      Review
                    </button>
                  </span>
                ) : null
              )}
              {(activity?.ready ?? []).slice(0, 2).map((item) => (
                <span key={item.id} className="db-footer-sub db-row-with-actions">
                  {item.id.slice(0, 8)}... <span className="db-upload-badge ready">Ready for review</span>
                  <button className="db-btn db-btn-mini" onClick={() => handleReview(item.id)}>
                    Review
                  </button>
                </span>
              ))}
            </div>
            <div className="db-footer-card">
              <strong>Recent (24h)</strong>
              <span>{visibleRecent.length} docs</span>
              {failedLocalItems.slice(0, 1).map((item) => (
                <span key={item.localId} className="db-footer-sub failed db-row-with-actions">
                  {item.fileName.slice(0, 14)}... <span className="db-upload-badge failed">Failed</span>
                  <button className="db-btn db-btn-mini" onClick={() => retryLocalUpload(item)}>
                    Retry
                  </button>
                  <button className="db-btn db-btn-mini db-btn-ghost" onClick={openManualEntry}>
                    Manual entry
                  </button>
                  <button className="db-btn db-btn-mini db-btn-ghost" onClick={() => dismissLocalUpload(item.localId)}>
                    Delete
                  </button>
                </span>
              ))}
              {failedRecent.length > 0 ? (
                <div className="db-failed-list">
                  {failedRecent.slice(0, 2).map((item) => (
                    <span key={item.id} className="db-footer-sub failed db-row-with-actions">
                      {item.id.slice(0, 8)}... <span className="db-upload-badge failed">Failed</span>
                      <button
                        className="db-btn db-btn-mini"
                        onClick={() => setUploadError("Retry from history is not wired yet. Re-upload the PDF.")}
                      >
                        Retry
                      </button>
                      <button className="db-btn db-btn-mini db-btn-ghost" onClick={openManualEntry}>
                        Manual entry
                      </button>
                      <button
                        className="db-btn db-btn-mini db-btn-ghost"
                        onClick={() => setDismissedFailedRecentIds((prev) => [...prev, item.id])}
                      >
                        Delete
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </footer>
        </main>
      </div>

      <LoadDetailDrawer loadId={selectedLoadId} onClose={() => setSelectedLoadId(null)} />
    </div>
  );
}
