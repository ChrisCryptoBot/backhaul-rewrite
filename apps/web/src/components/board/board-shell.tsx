"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  UploadIcon,
  WarningIcon
} from "@/components/icons";
import { int, money, pct, rpm } from "@/lib/ui/formatters";
import { mapBoardResponseToView, type ViewBoardResponse } from "@/lib/ui/board-mappers";
import { MAX_UPLOAD_FILES, splitUploadBatch, uploadDropzoneLabel } from "@/lib/ui/upload-utils";
import { TopbarSignOutButton } from "@/components/auth/sign-out-button";
import { StatusPill } from "./status-pill";
import { LoadDetailDrawer } from "./load-detail-drawer";

interface BoardShellProps {
  board: ViewBoardResponse;
  boardError?: string | null;
  initialHighlightLoadId?: string | null;
}

interface ActivityResponse {
  pending: Array<{ id: string; parseState: string; reviewDecision: string; duplicateSignal?: string | null }>;
  ready: Array<{ id: string; parseState: string; reviewDecision: string; duplicateSignal?: string | null }>;
  recent: Array<{ id: string; parseState: string; reviewDecision: string; duplicateSignal?: string | null; hasLoad?: boolean; loadId?: string | null; updatedAt: string }>;
}

type LocalUploadStatus = "uploading" | "parsing" | "ready" | "failed";
type ThemeMode = "light" | "dark";
type IntakeDriverType = "SHUTTLE" | "PTP" | "LTL";

interface LocalUploadItem {
  localId: string;
  fileName: string;
  status: LocalUploadStatus;
  message: string;
  createdAtMs: number;
  file?: File;
  rateConfirmationId?: string;
  duplicateKind?: "NONE" | "EXACT_DUPLICATE" | "SOFT_DUPLICATE_WARNING";
}

type UndoAction =
  | { kind: "local-upload"; item: LocalUploadItem }
  | { kind: "failed-recent"; recentId: string };

const BOARD_COLUMN_COUNT = 33;

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
    return "Accepted";
  }
  return "Failed";
}

function isFailedParseState(parseState: string): boolean {
  const normalized = parseState.trim().toUpperCase();
  return normalized.startsWith("FAILED") || normalized === "ERROR";
}

function splitCityState(value: string | null): { city: string; state: string } {
  if (!value) {
    return { city: "—", state: "" };
  }
  const [cityPart, statePart] = value.split(",").map((part) => part.trim());
  return { city: cityPart || "—", state: statePart || "" };
}

function formatBoardDate(dateIso: string): string {
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateIso;
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function formatRecentTime(dateIso: string): string {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

function parseIntakeDriverType(value: string | null): IntakeDriverType | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "SHUTTLE" || normalized === "PTP" || normalized === "LTL") {
    return normalized;
  }
  return undefined;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit" }).format(parsed);
}

function sectionCode(sectionId: string, title: string): string {
  const cleaned = sectionId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (cleaned.length >= 4) {
    return cleaned.slice(0, 6);
  }
  return title.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6) || "LOT";
}

export function BoardShell({ board, boardError = null, initialHighlightLoadId = null }: BoardShellProps) {
  const pathname = usePathname();
  const [boardState, setBoardState] = React.useState(board);
  const [selectedLoadId, setSelectedLoadId] = React.useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = React.useState<string>(boardState.sections[0]?.id ?? "");
  const [viewFilter, setViewFilter] = React.useState<"all" | "late" | "belowFloor">("all");
  const [isRailCollapsed, setIsRailCollapsed] = React.useState(false);
  const [activity, setActivity] = React.useState<ActivityResponse | null>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [localUploads, setLocalUploads] = React.useState<LocalUploadItem[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [clockMs, setClockMs] = React.useState(() => Date.now());
  const [dismissedFailedRecentIds, setDismissedFailedRecentIds] = React.useState<string[]>([]);
  const [undoAction, setUndoAction] = React.useState<UndoAction | null>(null);
  const [themeMode, setThemeMode] = React.useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = React.useState(false);
  const [dragOverSectionId, setDragOverSectionId] = React.useState<string | null>(null);
  const [highlightLoadId, setHighlightLoadId] = React.useState<string | null>(initialHighlightLoadId);
  const [expandedLoadIds, setExpandedLoadIds] = React.useState<string[]>([]);
  const [contextMenu, setContextMenu] = React.useState<{ loadId: string; x: number; y: number } | null>(null);
  type DialogState =
    | null
    | { kind: "tonu"; loadId: string; isTonu: boolean }
    | { kind: "delete"; loadId: string }
    | { kind: "driver-type"; files: File[] };
  const [dialogState, setDialogState] = React.useState<DialogState>(null);
  const [dialogSubmitting, setDialogSubmitting] = React.useState(false);
  const [tonuAmountInput, setTonuAmountInput] = React.useState("150.00");
  const [deleteReasonInput, setDeleteReasonInput] = React.useState("");
  const [driverTypeInput, setDriverTypeInput] = React.useState<IntakeDriverType | "">("");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const boardDateInputRef = React.useRef<HTMLInputElement | null>(null);
  const sectionRefs = React.useRef(new Map<string, HTMLTableRowElement>());
  const localPendingRef = React.useRef(false);
  const remotePendingRef = React.useRef(false);

  React.useEffect(() => {
    setBoardState(board);
  }, [board]);

  React.useEffect(() => {
    localPendingRef.current = localUploads.some((item) => item.status === "uploading" || item.status === "parsing");
    remotePendingRef.current = (activity?.pending.length ?? 0) > 0;
  }, [activity?.pending.length, localUploads]);

  React.useEffect(() => {
    let cancelled = false;
    let timerId: number | null = null;

    const run = async () => {
      try {
        const res = await fetch(
          `/api/rate-confirmations/activity?date=${encodeURIComponent(boardState.date)}&regionId=${encodeURIComponent(boardState.regionId)}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) {
          return;
        }
        const payload = (await res.json().catch(() => null)) as ActivityResponse | null;
        if (!cancelled && payload) {
          setActivity(payload);
        }
      } catch {
        // Keep footer resilient while backend data catches up.
      } finally {
        if (cancelled) {
          return;
        }
        const hasInFlightWork = localPendingRef.current || remotePendingRef.current;
        const isVisible = document.visibilityState === "visible";
        const nextDelay = !isVisible ? 30000 : hasInFlightWork ? 2000 : 15000;
        timerId = window.setTimeout(() => {
          timerId = null;
          void run();
        }, nextDelay);
      }
    };

    void run();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && timerId === null && !cancelled) {
        void run();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [boardState.date, boardState.regionId]);

  React.useEffect(() => {
    const hasLocalPending = localUploads.some((item) => item.status === "uploading" || item.status === "parsing");
    if (!hasLocalPending) {
      return;
    }
    const id = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [localUploads]);

  React.useEffect(() => {
    const savedTheme = window.localStorage.getItem("db-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setThemeMode(savedTheme);
    }
    setThemeReady(true);
  }, []);

  React.useEffect(() => {
    if (!themeReady) {
      return;
    }
    document.documentElement.setAttribute("data-theme", themeMode);
    window.localStorage.setItem("db-theme", themeMode);
  }, [themeMode, themeReady]);

  const toggleThemeMode = React.useCallback(() => {
    setThemeMode((previous) => {
      const nextTheme: ThemeMode = previous === "light" ? "dark" : "light";
      window.localStorage.setItem("db-theme", nextTheme);
      document.documentElement.setAttribute("data-theme", nextTheme);
      return nextTheme;
    });
  }, []);

  const proceedWithUpload = React.useCallback(
    async (validFiles: File[], intakeDriverType: IntakeDriverType | undefined) => {
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
          const prepareResponse = await fetch("/api/rate-confirmations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `${Date.now()}-${localId}`
            },
            body: JSON.stringify({
              contractVersion: "v1",
              operation: "prepare-upload",
              regionId: boardState.regionId,
              pickupDate: `${boardState.date}T12:00:00.000Z`,
              sourceFileName: file.name,
              intakeDriverType
            })
          });

          const preparePayload = (await prepareResponse.json().catch(() => null)) as
            | { error?: string; uploadId?: string; uploadUrl?: string }
            | null;
          if (!prepareResponse.ok || !preparePayload?.uploadId || !preparePayload?.uploadUrl) {
            throw new Error(preparePayload?.error ?? "Upload session failed.");
          }

          const uploadBinaryResponse = await fetch(preparePayload.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/pdf" },
            body: file
          });
          if (!uploadBinaryResponse.ok) {
            const uploadPayload = (await uploadBinaryResponse.json().catch(() => null)) as { error?: string } | null;
            throw new Error(uploadPayload?.error ?? "Upload transfer failed.");
          }

          const response = await fetch("/api/rate-confirmations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `${Date.now()}-${localId}-finalize`
            },
            body: JSON.stringify({
              contractVersion: "v1",
              operation: "finalize-upload",
              regionId: boardState.regionId,
              pickupDate: `${boardState.date}T12:00:00.000Z`,
              uploadId: preparePayload.uploadId,
              intakeDriverType
            })
          });
          const payload = (await response.json().catch(() => null)) as
            | {
                error?: string;
                rateConfirmationId?: string;
                duplicateKind?: "NONE" | "EXACT_DUPLICATE" | "SOFT_DUPLICATE_WARNING";
                alreadyExisted?: boolean;
              }
            | null;
          if (!response.ok) {
            throw new Error(payload?.error ?? "Finalize failed.");
          }
          setLocalUploads((previous) =>
            previous.map((item) =>
              item.localId === localId
                ? {
                    ...item,
                    status: payload?.alreadyExisted ? "ready" : "parsing",
                    message: payload?.alreadyExisted ? "Already uploaded" : "Parsing",
                    rateConfirmationId: payload?.rateConfirmationId,
                    duplicateKind: payload?.duplicateKind ?? "NONE"
                  }
                : item
            )
          );
        } catch (error) {
          try {
            const fileContentBase64 = await readFileAsBase64(file);
            const legacyResponse = await fetch("/api/rate-confirmations", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": `${Date.now()}-${localId}-legacy`
              },
              body: JSON.stringify({
                contractVersion: "v1",
                regionId: boardState.regionId,
                pickupDate: `${boardState.date}T12:00:00.000Z`,
                sourceFileName: file.name,
                fileContentBase64,
                intakeDriverType
              })
            });
            const payload = (await legacyResponse.json().catch(() => null)) as
              | {
                  error?: string;
                  rateConfirmationId?: string;
                  duplicateKind?: "NONE" | "EXACT_DUPLICATE" | "SOFT_DUPLICATE_WARNING";
                  alreadyExisted?: boolean;
                }
              | null;
            if (!legacyResponse.ok) {
              throw new Error(payload?.error ?? "Upload failed.");
            }
            setLocalUploads((previous) =>
              previous.map((item) =>
                item.localId === localId
                  ? {
                      ...item,
                      status: payload?.alreadyExisted ? "ready" : "parsing",
                      message: payload?.alreadyExisted ? "Already uploaded" : "Parsing",
                      rateConfirmationId: payload?.rateConfirmationId,
                      duplicateKind: payload?.duplicateKind ?? "NONE"
                    }
                  : item
              )
            );
          } catch (legacyError) {
            const message = legacyError instanceof Error ? legacyError.message : "Upload failed.";
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
      }
    },
    [boardState.date, boardState.regionId]
  );

  const uploadFiles = React.useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      const fileArray = Array.from(files).filter((file) => file.size > 0);
      if (fileArray.length === 0) return;
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
        errors.push(`${oversizedFiles.length} file(s) too large (max 25MB). Uploading ${validFiles.length} valid file(s).`);
      }
      if (errors.length > 0) setUploadError(errors.join(" "));
      if (validFiles.length === 0) return;
      setDriverTypeInput("");
      setDialogSubmitting(false);
      setDialogState({ kind: "driver-type", files: validFiles });
    },
    []
  );

  React.useEffect(() => {
    if (!activity?.ready?.length) {
      return;
    }
    setLocalUploads((previous) => {
      if (!previous.some((item) => item.status === "parsing" && item.rateConfirmationId)) {
        return previous;
      }
      const acceptedIds = new Set(
        (activity.recent ?? [])
          .filter((item) => item.parseState === "EXTRACTED" && item.reviewDecision === "APPROVED")
          .map((item) => item.id)
      );
      return previous.map((item) =>
        item.status === "parsing" && item.rateConfirmationId && acceptedIds.has(item.rateConfirmationId)
          ? { ...item, status: "ready", message: "Accepted" }
          : item
      );
    });
  }, [activity?.ready?.length, activity?.recent]);

  const pendingItems = React.useMemo(
    () => localUploads.filter((item) => item.status === "uploading" || item.status === "parsing"),
    [localUploads]
  );
  const readyLocalItems = React.useMemo(() => localUploads.filter((item) => item.status === "ready"), [localUploads]);
  const failedLocalItems = React.useMemo(() => localUploads.filter((item) => item.status === "failed"), [localUploads]);
  const allSectionsEmpty = React.useMemo(
    () => boardState.sections.every((section) => section.loads.length === 0),
    [boardState.sections]
  );

  const failedRecent = React.useMemo(
    () =>
      (activity?.recent ?? []).filter(
        (item) =>
          isFailedParseState(item.parseState) &&
          item.reviewDecision !== "REJECTED" &&
          !dismissedFailedRecentIds.includes(item.id)
      ),
    [activity, dismissedFailedRecentIds]
  );

  const dismissLocalUpload = React.useCallback((localId: string) => {
    setLocalUploads((previous) => previous.filter((item) => item.localId !== localId));
  }, []);

  const dismissLocalUploadWithUndo = React.useCallback((localId: string) => {
    setLocalUploads((previous) => {
      const removedItem = previous.find((item) => item.localId === localId);
      if (!removedItem) {
        return previous;
      }
      setUndoAction({ kind: "local-upload", item: removedItem });
      return previous.filter((item) => item.localId !== localId);
    });
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
    window.location.assign(
      `/review?rateConfirmationId=${encodeURIComponent(id)}&regionId=${encodeURIComponent(boardState.regionId)}`
    );
  }, [boardState.regionId]);

  const mutateBoard = React.useCallback(
    async (payload: Record<string, unknown>) => {
      const response = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          date: boardState.date,
          regionId: boardState.regionId
        })
      });
      const apiPayload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(apiPayload?.error ?? "Board update failed.");
      }
      try {
        setBoardState(mapBoardResponseToView(apiPayload as never));
      } catch {
        const reloadResponse = await fetch(
          `/api/board?date=${encodeURIComponent(boardState.date)}&regionId=${encodeURIComponent(boardState.regionId)}`,
          {
          cache: "no-store"
          }
        );
        const reloadPayload = (await reloadResponse.json().catch(() => null)) as { error?: string } | null;
        if (!reloadResponse.ok) {
          throw new Error(reloadPayload?.error ?? "Board refresh failed after mutation.");
        }
        setBoardState(mapBoardResponseToView(reloadPayload as never));
      }
    },
    [boardState.date, boardState.regionId]
  );

  const moveLoadToSection = React.useCallback(
    async (loadId: string, targetSectionId: string) => {
      try {
        await mutateBoard({
          action: "move",
          loadId,
          targetSectionId
        });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Board update failed.");
      }
    },
    [mutateBoard]
  );

  const toggleTonuLifecycle = React.useCallback(
    (loadId: string, isTonu: boolean) => {
      if (!isTonu) {
        void mutateBoard({ action: "tonu", loadId, isTonu }).catch((error) => {
          setUploadError(error instanceof Error ? error.message : "TONU update failed.");
        });
        return;
      }
      setTonuAmountInput("150.00");
      setDialogSubmitting(false);
      setDialogState({ kind: "tonu", loadId, isTonu: true });
    },
    [mutateBoard]
  );

  const confirmTonu = React.useCallback(async () => {
    if (dialogState?.kind !== "tonu") return;
    const { loadId, isTonu } = dialogState;
    const amount = tonuAmountInput.trim();
    if (!amount) {
      setUploadError("TONU amount is required.");
      return;
    }
    if (dialogSubmitting) {
      return;
    }
    setDialogSubmitting(true);
    setUploadError(null);
    try {
      await mutateBoard({ action: "tonu", loadId, isTonu, tonuAmount: amount });
      setDialogState(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "TONU update failed.");
    } finally {
      setDialogSubmitting(false);
    }
  }, [dialogState, dialogSubmitting, mutateBoard, tonuAmountInput]);

  const setLoadStatus = React.useCallback(
    async (loadId: string, status: "BOOKED" | "CANCELED" | "FAILED") => {
      try {
        await mutateBoard({ action: "status", loadId, status });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Status update failed.");
      }
    },
    [mutateBoard]
  );

  const updateLoadFields = React.useCallback(
    async (loadId: string, fields: Record<string, unknown>) => {
      try {
        await mutateBoard({ action: "update-fields", loadId, fields });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Field update failed.");
      }
    },
    [mutateBoard]
  );

  const setLoadStatusFromDrawer = React.useCallback(
    async (loadId: string, status: "BOOKED" | "CANCELED" | "FAILED") => {
      try {
        await mutateBoard({ action: "status", loadId, status });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Status update failed.";
        setUploadError(message);
        throw new Error(message);
      }
    },
    [mutateBoard]
  );

  const updateLoadFieldsFromDrawer = React.useCallback(
    async (loadId: string, fields: Record<string, unknown>) => {
      try {
        await mutateBoard({ action: "update-fields", loadId, fields });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Field update failed.";
        setUploadError(message);
        throw new Error(message);
      }
    },
    [mutateBoard]
  );

  const softDeleteLoad = React.useCallback(
    (loadId: string) => {
      setDeleteReasonInput("");
      setDialogSubmitting(false);
      setDialogState({ kind: "delete", loadId });
    },
    []
  );

  const confirmDelete = React.useCallback(async () => {
    if (dialogState?.kind !== "delete") return;
    const { loadId } = dialogState;
    const reason = deleteReasonInput.trim();
    if (reason.length < 10) {
      setUploadError("Delete reason must be at least 10 characters.");
      return;
    }
    if (dialogSubmitting) {
      return;
    }
    setDialogSubmitting(true);
    setUploadError(null);
    try {
      await mutateBoard({ action: "delete", loadId, reason });
      setDialogState(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setDialogSubmitting(false);
    }
  }, [deleteReasonInput, dialogState, dialogSubmitting, mutateBoard]);

  const confirmDriverType = React.useCallback(
    async (mode: "skip" | "upload") => {
      if (dialogState?.kind !== "driver-type") return;
      if (dialogSubmitting) return;
      setDialogSubmitting(true);
      setUploadError(null);
      try {
        const files = dialogState.files;
        const intakeDriverType = mode === "upload" ? (driverTypeInput || undefined) : undefined;
        await proceedWithUpload(files, intakeDriverType);
        setDialogState(null);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Upload failed.");
      } finally {
        setDialogSubmitting(false);
      }
    },
    [dialogState, dialogSubmitting, driverTypeInput, proceedWithUpload]
  );

  const upsertLeg = React.useCallback(
    async (loadId: string, leg: Record<string, unknown>) => {
      try {
        await mutateBoard({ action: "leg-upsert", loadId, leg });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Leg update failed.");
      }
    },
    [mutateBoard]
  );

  const deleteLeg = React.useCallback(
    async (loadId: string, legId: string) => {
      try {
        await mutateBoard({ action: "leg-delete", loadId, legId });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Leg delete failed.");
      }
    },
    [mutateBoard]
  );

  const upsertLegFromDrawer = React.useCallback(
    async (loadId: string, leg: Record<string, unknown>) => {
      try {
        await mutateBoard({ action: "leg-upsert", loadId, leg });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Leg update failed.";
        setUploadError(message);
        throw new Error(message);
      }
    },
    [mutateBoard]
  );

  const deleteLegFromDrawer = React.useCallback(
    async (loadId: string, legId: string) => {
      try {
        await mutateBoard({ action: "leg-delete", loadId, legId });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Leg delete failed.";
        setUploadError(message);
        throw new Error(message);
      }
    },
    [mutateBoard]
  );

  const resolveDuplicate = React.useCallback(async (id: string, action: "approve" | "reject") => {
    try {
      const scopedResponse = await fetch(
        `/api/review/${encodeURIComponent(id)}?regionId=${encodeURIComponent(boardState.regionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Keep duplicate resolutions in the same region context as the board.
          // Review APIs are region-scoped and must not fall back to a different region.
          body: JSON.stringify(
            action === "approve"
              ? { action: "approve" }
              : { action: "reject", reason: "Rejected duplicate from board activity rail." }
          )
        }
      );
      if (!scopedResponse.ok) {
        const payload = (await scopedResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not resolve duplicate.");
      }
      setActivity((previous) => {
        if (!previous) {
          return previous;
        }
        return {
          ...previous,
          ready: previous.ready.filter((item) => item.id !== id),
          recent: previous.recent.map((item) =>
            item.id === id
              ? {
                  ...item,
                  reviewDecision: action === "approve" ? "APPROVED" : "REJECTED"
                }
              : item
          )
        };
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not resolve duplicate.");
    }
  }, [boardState.regionId]);

  const openManualEntry = React.useCallback(() => {
    window.location.assign(`/review/manual-entry?regionId=${encodeURIComponent(boardState.regionId)}`);
  }, [boardState.regionId]);

  const selectedLoad = React.useMemo(
    () => boardState.sections.flatMap((section) => section.loads).find((load) => load.id === selectedLoadId) ?? null,
    [boardState.sections, selectedLoadId]
  );

  const dismissFailedRecentItemWithUndo = React.useCallback((id: string) => {
    setDismissedFailedRecentIds((prev) => [...prev, id]);
    setUndoAction({ kind: "failed-recent", recentId: id });
  }, []);

  const undoDismiss = React.useCallback(() => {
    if (!undoAction) {
      return;
    }
    if (undoAction.kind === "local-upload") {
      setLocalUploads((previous) => [undoAction.item, ...previous].slice(0, 20));
      setUndoAction(null);
      return;
    }
    setDismissedFailedRecentIds((prev) => prev.filter((id) => id !== undoAction.recentId));
    setUndoAction(null);
  }, [undoAction]);

  React.useEffect(() => {
    if (!undoAction) {
      return;
    }
    const timerId = window.setTimeout(() => {
      setUndoAction(null);
    }, 5000);
    return () => window.clearTimeout(timerId);
  }, [undoAction]);

  const handleDateChange = React.useCallback((nextDate: string) => {
    if (!nextDate || nextDate === boardState.date) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("date", nextDate);
    params.set("regionId", boardState.regionId);
    window.location.assign(`/?${params.toString()}`);
  }, [boardState.date, boardState.regionId]);

  const openBoardDatePicker = React.useCallback(() => {
    const input = boardDateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input) {
      return;
    }
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }, []);

  const handleRegionChange = React.useCallback((nextRegionId: string) => {
    if (!nextRegionId) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("regionId", nextRegionId);
    params.set("date", boardState.date);
    window.location.assign(`/?${params.toString()}`);
  }, [boardState.date]);

  const visibleRecent = (activity?.recent ?? []).filter((item) => !dismissedFailedRecentIds.includes(item.id));
  const pendingTotal = (activity?.pending.length ?? 0) + pendingItems.length;
  const boardDateLabel = formatBoardDate(boardState.date);
  const regionLabel = boardState.regionLabel ?? "NORTHEAST";
  const regionCode = boardState.regionCode ?? sectionCode(boardState.regionId, boardState.regionId);

  const isBelowFloorLoad = React.useCallback((load: ViewBoardResponse["sections"][number]["loads"][number]) => {
    if (load.loadedRpm === null || load.floorRpm === null) {
      return false;
    }
    return load.loadedRpm < load.floorRpm;
  }, []);

  const isOperationallyLateLoad = React.useCallback((load: ViewBoardResponse["sections"][number]["loads"][number]) => {
    return load.puStatusPreset === "LATE" || load.delStatusPreset === "LATE";
  }, []);

  const filteredSections = React.useMemo(() => {
    return boardState.sections.map((section) => {
      let loads = section.loads;
      if (viewFilter === "belowFloor") {
        loads = loads.filter((load) => isBelowFloorLoad(load));
      } else if (viewFilter === "late") {
        loads = loads.filter((load) => isOperationallyLateLoad(load));
      }
      return { ...section, loads };
    });
  }, [boardState.sections, isBelowFloorLoad, isOperationallyLateLoad, viewFilter]);

  React.useEffect(() => {
    if (!highlightLoadId) return;
    setSelectedLoadId(highlightLoadId);
    const timer = window.setTimeout(() => setHighlightLoadId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [highlightLoadId]);

  const railTotalCounts = React.useMemo(
    () =>
      boardState.sections.reduce<Record<string, number>>((acc, section) => {
        acc[section.id] = section.loads.length;
        return acc;
      }, {}),
    [boardState.sections]
  );

  const railFilteredCounts = React.useMemo(
    () =>
      filteredSections.reduce<Record<string, number>>((acc, section) => {
        acc[section.id] = section.loads.length;
        return acc;
      }, {}),
    [filteredSections]
  );

  const scrollToSection = React.useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    const target = sectionRefs.current.get(sectionId);
    if (!target) {
      return;
    }
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  return (
    <div className="db-root db-app db-board" data-theme={themeMode}>
      <header className="db-topbar">
        <div className="db-brand">
          <div className="db-brand-text">
            <span className="db-brand-name"><span className="db-brand-name-accent">BACKHAUL</span> BUCKET</span>
            <span className="db-region-badge mono">{regionLabel} · {regionCode}</span>
          </div>
        </div>
        <nav className="db-topnav">
          <Link href="/" className={`db-topnav-item${pathname === "/" ? " active" : ""}`}>
            Daily Board
          </Link>
          <Link href="/dashboard" className={`db-topnav-item${pathname === "/dashboard" ? " active" : ""}`}>
            KPI Dashboard
          </Link>
          <span className="db-topnav-item disabled" title="Coming soon">
            Lanes
          </span>
          <span className="db-topnav-item disabled" title="Coming soon">
            Brokers
          </span>
          <span className="db-topnav-item disabled" title="Coming soon">
            Audit
          </span>
        </nav>
        <div className="db-topbar-right">
          {boardState.availableRegions.length > 1 ? (
            <select
              className="db-datepicker"
              value={boardState.activeRegionId ?? boardState.regionId}
              onChange={(event) => handleRegionChange(event.target.value)}
              aria-label="Board region"
            >
              {boardState.availableRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.code}
                </option>
              ))}
            </select>
          ) : null}
          <label
            className="db-datepicker"
            onClick={(event) => {
              event.preventDefault();
              openBoardDatePicker();
            }}
          >
            <CalendarIcon size={14} />
            <span className="mono">{boardDateLabel}</span>
            <ChevronDownIcon size={12} />
            <input
              ref={boardDateInputRef}
              aria-label="Board date"
              type="date"
              className="db-date-input"
              value={boardState.date}
              onChange={(event) => handleDateChange(event.target.value)}
            />
          </label>
          <button className="db-btn db-btn-ghost db-btn-icon" title="Search" type="button" aria-label="Search">
            <SearchIcon size={14} />
          </button>
          <button
            type="button"
            className="db-btn db-theme-toggle"
            onClick={toggleThemeMode}
            aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
          >
            {themeMode === "light" ? "Dark mode" : "Light mode"}
          </button>
          <TopbarSignOutButton />
        </div>
      </header>

      <div className={`db-layout db-body ${isRailCollapsed ? "rail-collapsed" : ""}`}>
        <aside id="board-left-rail" className={`db-rail ${isRailCollapsed ? "collapsed" : ""}`}>
          <button
            type="button"
            className="db-rail-toggle"
            aria-controls="board-left-rail"
            aria-expanded={!isRailCollapsed}
            onClick={() => setIsRailCollapsed((prev) => !prev)}
          >
            <span className="db-rail-toggle-icon" aria-hidden="true">{isRailCollapsed ? "»" : "«"}</span>
            <span className="db-rail-toggle-label">{isRailCollapsed ? "Expand" : "Collapse"}</span>
          </button>
          <div className="db-rail-label">DROP LOTS</div>
          {boardState.sections.map((section) => (
            <a
              key={section.id}
              href={`#sec-${section.id}`}
              className={`db-rail-item ${activeSectionId === section.id ? "active" : ""}`}
              title={section.city ?? section.title}
              onClick={(event) => {
                event.preventDefault();
                scrollToSection(section.id);
              }}
            >
              <span className="db-rail-code mono">{section.code ?? sectionCode(section.id, section.title)}</span>
              <span className="db-rail-name">{section.city ?? section.title}</span>
              <span
                className={`db-rail-count mono ${railTotalCounts[section.id] === 0 ? "zero" : ""}`}
                aria-label={`${railFilteredCounts[section.id] ?? 0} shown out of ${railTotalCounts[section.id] ?? 0} total`}
                title={`${railFilteredCounts[section.id] ?? 0} shown / ${railTotalCounts[section.id] ?? 0} total`}
              >
                {railFilteredCounts[section.id] ?? 0}/{railTotalCounts[section.id] ?? 0}
              </span>
            </a>
          ))}
          <div className="db-rail-spacer" />
          <div className="db-rail-label">VIEW</div>
          <button type="button" className={`db-rail-item sub ${viewFilter === "all" ? "active" : ""}`} title="All loads" onClick={() => setViewFilter("all")}>All loads</button>
          <button type="button" className={`db-rail-item sub ${viewFilter === "late" ? "active" : ""}`} title="Late only" onClick={() => setViewFilter("late")}>Late only</button>
          <button type="button" className={`db-rail-item sub ${viewFilter === "belowFloor" ? "active" : ""}`} title="Below floor" onClick={() => setViewFilter("belowFloor")}>Below floor</button>
        </aside>

        <main className="db-main">
          <div className="db-main-head">
            <div className="db-breadcrumb">
              <span className="dim">Daily Load Board</span>
              <ChevronRightIcon size={12} />
              <span>{boardDateLabel}</span>
            </div>
            <div className="db-day-totals">
              <div className="db-stat">
                <span className="db-stat-label">Loads</span>
                <span className="db-stat-value mono">{int(boardState.totals.loads)}</span>
              </div>
              <div className="db-stat-sep" />
              <div className="db-stat">
                <span className="db-stat-label">Line Haul</span>
                <span className="db-stat-value mono">{money(boardState.totals.lineHaul, { decimals: 0 })}</span>
              </div>
              <div className="db-stat-sep" />
              <div className="db-stat">
                <span className="db-stat-label">Loaded Mi</span>
                <span className="db-stat-value mono">{int(boardState.totals.loadedMiles)}</span>
              </div>
              <div className="db-stat-sep" />
              <div className="db-stat">
                <span className="db-stat-label">Empty %</span>
                <span className="db-stat-value mono">{pct(boardState.totals.emptyPctRatio, { fromRatio: true })}</span>
              </div>
              <div className="db-stat-sep" />
              <div className="db-stat">
                <span className="db-stat-label">Floor RPM</span>
                <span className="db-stat-value mono accent">{rpm(boardState.totals.floorRpm)}</span>
              </div>
              <div className="db-stat-sep" />
              <div className="db-stat">
                <span className="db-stat-label">FSC</span>
                <span className="db-stat-value mono">{money(boardState.totals.fsc, { decimals: 0 })}</span>
              </div>
              <div className="db-stat-sep" />
              <div className="db-stat">
                <span className="db-stat-label">TONU</span>
                <span className="db-stat-value mono">{money(boardState.totals.tonu, { decimals: 0 })}</span>
              </div>
            </div>
          </div>

          {boardError ? <p className="db-msg">{boardError}</p> : null}
          {allSectionsEmpty ? (
            <div className="db-uistate db-uistate-inline" role="status">
              <h2 className="db-uistate-title">No loads booked for {boardState.date}</h2>
              <p className="db-uistate-copy">Drop a PDF rate confirmation to populate today&apos;s board.</p>
              <button type="button" className="db-btn" onClick={() => fileInputRef.current?.click()}>
                Upload first rate confirmation
              </button>
            </div>
          ) : null}

          <div className="db-table-wrap">
            <table className="db-table">
              <caption className="db-sr-only">Daily load board sections and loads</caption>
              <thead>
                <tr>
                  <th>REF#</th>
                  <th>STATUS</th>
                  <th>NOTE</th>
                  <th>SCALE B</th>
                  <th>SCALE A</th>
                  <th>PU#(s)</th>
                  <th>Broker (rep)</th>
                  <th>MG</th>
                  <th>TMW</th>
                  <th>PU Driver</th>
                  <th>Trk/Trlr</th>
                  <th>Commodity</th>
                  <th>Equip</th>
                  <th>Shipper</th>
                  <th>PU City, ST</th>
                  <th>PU Window</th>
                  <th>Receiver</th>
                  <th>DEL City, ST</th>
                  <th>DEL Date/Win</th>
                  <th>POD</th>
                  <th className="right">Line Haul</th>
                  <th className="right">FSC</th>
                  <th className="right">TONU Amt</th>
                  <th className="right">All-In Rev</th>
                  <th className="right">Ldd Mi</th>
                  <th className="right">PU DH</th>
                  <th className="right">DEL DH</th>
                  <th className="right">Total Mi</th>
                  <th className="right">Neg Mi</th>
                  <th className="right">Ldd RPM</th>
                  <th className="right">Floor RPM</th>
                  <th className="right">Del</th>
                </tr>
              </thead>
              <tbody>
                {filteredSections.map((section) => (
                  <React.Fragment key={section.id}>
                    <tr
                      className={`db-section-row ${dragOverSectionId === section.id ? "selected" : ""}`}
                      id={`sec-${section.id}`}
                      ref={(element) => { if (element) sectionRefs.current.set(section.id, element); }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverSectionId(section.id);
                      }}
                      onDragLeave={() => {
                        setDragOverSectionId((current) => (current === section.id ? null : current));
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const loadId = event.dataTransfer.getData("text/plain");
                        setDragOverSectionId(null);
                        if (loadId) {
                          void moveLoadToSection(loadId, section.id);
                        }
                      }}
                    >
                      <td colSpan={BOARD_COLUMN_COUNT} className="db-section-cell">
                        <div className="db-section-inner">
                          <span className="db-section-code mono">{section.code ?? sectionCode(section.id, section.title)}</span>
                          <span className="db-section-name">{section.title}</span>
                          {section.city && section.state ? <span className="db-section-city">{section.city}, {section.state}</span> : null}
                          <span className={`db-cap mono ${section.capacity !== null && section.filledCount > section.capacity ? "over" : section.capacity !== null && section.filledCount === section.capacity ? "full" : ""}`}>
                            {section.filledCount}{section.capacity !== null ? `/${section.capacity}` : ""}
                          </span>
                          {section.slipSeat ? <span className="db-tag">SLIP-SEAT</span> : null}
                          {section.dropHookRequired ? <span className="db-tag warn"><WarningIcon size={12} /> DROP-HOOK REQ</span> : null}
                          {section.note ? <span className="db-section-note">{section.note}</span> : null}
                        </div>
                      </td>
                    </tr>
                    {section.loads.length === 0 ? (
                      <tr className="db-empty-row">
                        <td colSpan={BOARD_COLUMN_COUNT} className="db-empty-cell"><span className="dim">No loads booked for {section.title}.</span></td>
                      </tr>
                    ) : (
                      section.loads.map((load) => (
                        <React.Fragment key={load.id}>
                          <tr
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", load.id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            className={`db-row ${selectedLoadId === load.id || highlightLoadId === load.id ? "selected" : ""} ${isBelowFloorLoad(load) ? "flagged" : ""} ${load.attentionSeverity === "URGENT" ? "db-row--urgent" : load.attentionSeverity === "WARN" ? "db-row--warn" : ""}`}
                            onClick={() => setSelectedLoadId(load.id)}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenu({ loadId: load.id, x: event.clientX, y: event.clientY });
                            }}
                          >
                            <td>
                              <button type="button" className="db-row-open-btn" aria-label={`Open details for ${load.ref}`} onClick={(event) => { event.stopPropagation(); setSelectedLoadId(load.id); }}>
                                {load.ref}
                              </button>
                              <button
                                type="button"
                                className="db-btn db-btn-mini db-btn-ghost"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedLoadIds((prev) => (prev.includes(load.id) ? prev.filter((id) => id !== load.id) : [...prev, load.id]));
                                }}
                              >
                                Legs
                              </button>
                            </td>
                            <td><StatusPill status={load.status} /></td>
                            <td className="trunc" title={load.coordinatorNotes ?? load.lateCancelFailedNote ?? undefined}>
                              {load.coordinatorNotes ?? load.lateCancelFailedNote ?? "—"}
                            </td>
                            <td>
                              <select
                                className="db-datepicker"
                                aria-label={`Scale Before for ${load.ref}`}
                                value={load.scaleBeforeTask}
                                onChange={(event) => void updateLoadFields(load.id, { scaleBeforeTask: event.target.value })}
                              >
                                <option value="NOT_DONE">NOT_DONE</option>
                                <option value="DONE">DONE</option>
                              </select>
                            </td>
                            <td>
                              <select
                                className="db-datepicker"
                                aria-label={`Scale After for ${load.ref}`}
                                value={load.scaleAfterTask}
                                onChange={(event) => void updateLoadFields(load.id, { scaleAfterTask: event.target.value })}
                              >
                                <option value="NOT_DONE">NOT_DONE</option>
                                <option value="DONE">DONE</option>
                              </select>
                            </td>
                            <td className="mono">{(load.pickupNumbers ?? []).length > 0 ? (load.pickupNumbers ?? []).join(", ") : (load.pickupNumber ?? "—")}</td>
                            <td className="trunc" title={load.brokerName ?? undefined}>{load.brokerName ?? "—"}{load.brokerRepName ? ` (${load.brokerRepName})` : ""}</td>
                            <td>
                              <select
                                className="db-datepicker"
                                aria-label={`MG task for ${load.ref}`}
                                value={load.mgStatusTask}
                                onChange={(event) => void updateLoadFields(load.id, { mgStatusTask: event.target.value })}
                              >
                                <option value="NOT_DONE">NOT_DONE</option>
                                <option value="DONE">DONE</option>
                              </select>
                            </td>
                            <td>
                              <select
                                className="db-datepicker"
                                aria-label={`TMW task for ${load.ref}`}
                                value={load.tmwStatusTask}
                                onChange={(event) => void updateLoadFields(load.id, { tmwStatusTask: event.target.value })}
                              >
                                <option value="NOT_DONE">NOT_DONE</option>
                                <option value="DONE">DONE</option>
                              </select>
                            </td>
                            <td className="trunc" title={load.pickupDriverAssigned ?? undefined}>{load.pickupDriverAssigned ?? "—"}</td>
                            <td className="trunc">{[load.tractorTrailer1, load.tractorTrailer2].filter(Boolean).join(" / ") || "—"}</td>
                            <td className="trunc">{load.commodity ?? "—"}</td>
                            <td className="trunc">{load.equipmentType ?? load.equipmentNeeds ?? "—"}</td>
                            <td className="trunc" title={load.shipper}>{load.shipper}</td>
                            <td><span className="db-city">{splitCityState(load.pickupCityState).city}</span>{splitCityState(load.pickupCityState).state ? <span className="db-state mono">{splitCityState(load.pickupCityState).state}</span> : null}</td>
                            <td className="mono dim">{load.pickupWindow ?? "—"}</td>
                            <td className="trunc" title={load.receiver}>{load.receiver}</td>
                            <td><span className="db-city">{splitCityState(load.deliveryCityState).city}</span>{splitCityState(load.deliveryCityState).state ? <span className="db-state mono">{splitCityState(load.deliveryCityState).state}</span> : null}</td>
                            <td className="mono dim">{formatShortDate(load.deliveryDate)} / {load.deliveryWindow ?? "—"}</td>
                            <td className="mono">{load.podStatus ?? "—"}</td>
                            <td className="right mono num">{money(load.lineHaul)}</td>
                            <td className="right mono num">{money(load.fscAmount)}</td>
                            <td className="right mono num">{money(load.tonuAmount)}</td>
                            <td className="right mono num">{money(load.allInRevenue)}</td>
                            <td className="right mono num">{int(load.loadedMi)}</td>
                            <td className="right mono num dim">{int(load.puDh)}</td>
                            <td className="right mono num dim">{int(load.delDh)}</td>
                            <td className="right mono num">{int(load.totalMi)}</td>
                            <td className="right mono num">{int(load.negMi)}</td>
                            <td className="right mono num">{rpm(load.loadedRpm)}</td>
                            <td className={`right mono num strong ${isBelowFloorLoad(load) ? "neg" : ""}`}>{rpm(load.floorRpm)}</td>
                            <td className="right">
                              <button className="db-btn db-btn-mini db-btn-ghost" type="button" onClick={(event) => { event.stopPropagation(); void softDeleteLoad(load.id); }}>
                                X
                              </button>
                            </td>
                          </tr>
                          {expandedLoadIds.includes(load.id) ? (
                            <tr className="db-empty-row">
                              <td colSpan={BOARD_COLUMN_COUNT} className="db-empty-cell">
                                <div className="db-mgmt-notes">
                                  <div className="db-mgmt-notes-h">Load Legs</div>
                                  {load.legs.length === 0 ? <div className="dim">No legs recorded.</div> : null}
                                  {load.legs.map((leg) => (
                                    <div key={leg.id} className="db-bucket-recent-item db-row-with-actions">
                                      <span className="mono">#{leg.legIndex} {leg.legType}</span>
                                      <span className="dim">{[leg.startCity, leg.startState].filter(Boolean).join(", ")} → {[leg.endCity, leg.endState].filter(Boolean).join(", ")}</span>
                                      <span className="mono">{leg.driverName ?? "—"} · {leg.legMiles ?? "—"} mi</span>
                                      <button className="db-btn db-btn-mini db-btn-ghost" onClick={() => void deleteLeg(load.id, leg.id)}>Delete leg</button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className="db-btn db-btn-mini"
                                    onClick={() => {
                                      const legIndex = load.legs.length;
                                      void upsertLeg(load.id, { legIndex, legType: "PTP" });
                                    }}
                                  >
                                    + Add leg
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      ))
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {contextMenu ? (
            <div
              className="db-mgmt-notes"
              style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 40, maxWidth: 260 }}
              onMouseLeave={() => setContextMenu(null)}
            >
              <div className="db-mgmt-notes-h">Row actions</div>
              <div className="db-row-with-actions">
                <button className="db-btn db-btn-mini" onClick={() => { void setLoadStatus(contextMenu.loadId, "CANCELED"); setContextMenu(null); }}>Cancel</button>
                <button className="db-btn db-btn-mini" onClick={() => { void toggleTonuLifecycle(contextMenu.loadId, true); setContextMenu(null); }}>Mark TONU</button>
                <button className="db-btn db-btn-mini" onClick={() => { void setLoadStatus(contextMenu.loadId, "FAILED"); setContextMenu(null); }}>Mark failed</button>
              </div>
              <div className="db-row-with-actions">
                <button
                  className="db-btn db-btn-mini db-btn-ghost"
                  onClick={() => {
                    const load = boardState.sections.flatMap((section) => section.loads).find((item) => item.id === contextMenu.loadId);
                    if (load?.rateConfirmationId) {
                      window.location.assign(
                        `/review?rateConfirmationId=${encodeURIComponent(load.rateConfirmationId)}&regionId=${encodeURIComponent(boardState.regionId)}`
                      );
                    } else {
                      setSelectedLoadId(contextMenu.loadId);
                    }
                    setContextMenu(null);
                  }}
                >
                  View Rate Con
                </button>
                <button className="db-btn db-btn-mini db-btn-ghost" onClick={() => { setSelectedLoadId(contextMenu.loadId); setContextMenu(null); }}>Edit / View</button>
                <button className="db-btn db-btn-mini db-btn-ghost" onClick={() => setContextMenu(null)}>Close</button>
              </div>
            </div>
          ) : null}

          <footer className="db-bucket">
            <div className={`db-bucket-zone ${isDragActive ? "drag-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragActive(true); }} onDragLeave={(event) => {
              event.preventDefault();
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                return;
              }
              setIsDragActive(false);
            }} onDrop={(event) => { event.preventDefault(); setIsDragActive(false); void uploadFiles(event.dataTransfer.files); }}>
              <div className="db-bucket-icon" aria-hidden="true">
                <UploadIcon size={16} />
              </div>
              <div className="db-bucket-text">
                <div className="db-bucket-title">{uploadDropzoneLabel(isDragActive)}</div>
                <div className="db-bucket-sub dim">Drag PDFs from Outlook · or <button type="button" className="db-link" onClick={() => fileInputRef.current?.click()}>click to upload</button></div>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,application/pdf" className="db-hidden-input" aria-label="Upload rate confirmation files" onChange={(event) => {
                  if (!event.target.files) {
                    return;
                  }
                  void uploadFiles(event.target.files);
                  event.target.value = "";
                }} />
                {uploadError ? <span className="db-upload-error" role="status" aria-live="polite">{uploadError}</span> : null}
              </div>
            </div>
            <div className="db-bucket-pending" aria-live="polite">
              <div className="db-bucket-pending-head">
                <span className="db-bucket-label">PENDING</span>
                <span className={`db-bucket-badge mono ${pendingTotal > 0 ? "pulse" : ""}`}>{pendingTotal} parsing</span>
              </div>
              {pendingItems.slice(0, 2).map((item) => (
                <div key={item.localId} className="db-bucket-card">
                  <span className="db-bucket-card-name mono">{item.fileName}</span>
                  <span className="db-bucket-card-status parsing">Parsing... {formatElapsed(clockMs - item.createdAtMs)}</span>
                </div>
              ))}
              {(activity?.ready ?? []).slice(0, 2).map((item) => (
                <div key={item.id} className="db-bucket-card ready">
                  <span className="db-bucket-card-name mono">{item.id}</span>
                  <span className="db-bucket-card-status ready"><CheckIcon size={12} /> Ready for review</span>
                  {item.duplicateSignal === "SOFT_DUPLICATE_WARNING" ? <span className="db-tag warn">Soft duplicate</span> : null}
                  <button className="db-btn db-btn-mini" onClick={() => handleReview(item.id)}>Review</button>
                </div>
              ))}
              {readyLocalItems.slice(0, 1).map((item) => (
                <div key={item.localId} className="db-bucket-card ready">
                  <span className="db-bucket-card-name mono">{item.fileName}</span>
                  <span className="db-bucket-card-status ready"><CheckIcon size={12} /> Ready for review</span>
                  {item.duplicateKind === "SOFT_DUPLICATE_WARNING" ? <span className="db-tag warn">Soft duplicate</span> : null}
                  {item.rateConfirmationId ? (
                    <button className="db-btn db-btn-mini" onClick={() => handleReview(item.rateConfirmationId!)}>
                      Review
                    </button>
                  ) : (
                    <span className="db-uistate-copy dim">Waiting for item id...</span>
                  )}
                </div>
              ))}
            </div>
            <div className="db-bucket-recent" aria-live="polite">
              <div className="db-bucket-pending-head">
                <span className="db-bucket-label">RECENT (24h)</span>
                <span className="db-bucket-badge mono">{visibleRecent.length}</span>
              </div>
              <div className="db-bucket-recent-list">
                {visibleRecent.slice(0, 3).map((item) => (
                  <div key={item.id} className="db-bucket-recent-item">
                    <span className="mono">{item.id.slice(0, 10)}</span>
                    <span className="dim">{formatRecentTime(item.updatedAt)}</span>
                    <button
                      className="db-btn db-btn-mini db-btn-ghost"
                      onClick={() => {
                        if (item.loadId) {
                          setSelectedLoadId(item.loadId);
                          setHighlightLoadId(item.loadId);
                        } else {
                          handleReview(item.id);
                        }
                      }}
                    >
                      Open
                    </button>
                  </div>
                ))}
                {failedLocalItems.slice(0, 1).map((item) => (
                  <div key={item.localId} className="db-bucket-recent-item db-row-with-actions failed">
                    <span className="mono">{item.fileName.slice(0, 14)}...</span>
                    <button className="db-btn db-btn-mini" onClick={() => retryLocalUpload(item)}>Retry</button>
                    <button className="db-btn db-btn-mini db-btn-ghost" onClick={openManualEntry}>Manual</button>
                    <button className="db-btn db-btn-mini db-btn-ghost" onClick={() => dismissLocalUploadWithUndo(item.localId)}>Delete</button>
                  </div>
                ))}
                {failedRecent.slice(0, 1).map((item) => (
                  <div key={item.id} className="db-bucket-recent-item db-row-with-actions failed">
                    <span className="mono">{item.id.slice(0, 10)}</span>
                    <button className="db-btn db-btn-mini" onClick={() => handleReview(item.id)}>Retry</button>
                    <button className="db-btn db-btn-mini db-btn-ghost" onClick={openManualEntry}>Manual</button>
                    <button className="db-btn db-btn-mini db-btn-ghost" onClick={() => dismissFailedRecentItemWithUndo(item.id)}>Delete</button>
                  </div>
                ))}
                {(activity?.ready ?? [])
                  .filter((item) => item.duplicateSignal === "SOFT_DUPLICATE_WARNING")
                  .slice(0, 1)
                  .map((item) => (
                    <div key={`dup-${item.id}`} className="db-bucket-recent-item db-row-with-actions">
                      <span className="mono">{item.id.slice(0, 10)}</span>
                      <button className="db-btn db-btn-mini" onClick={() => resolveDuplicate(item.id, "approve")}>Approve</button>
                      <button className="db-btn db-btn-mini db-btn-ghost" onClick={() => resolveDuplicate(item.id, "reject")}>Reject</button>
                    </div>
                  ))}
              </div>
              {undoAction ? (
                <div className="db-undo-toast" role="status" aria-live="polite">
                  <span>Removed item.</span>
                  <button type="button" className="db-link" onClick={undoDismiss}>
                    Undo
                  </button>
                </div>
              ) : null}
            </div>
          </footer>
        </main>
      </div>

      <LoadDetailDrawer
        loadId={selectedLoadId}
        regionId={boardState.regionId}
        fallbackLoad={selectedLoad}
        onClose={() => setSelectedLoadId(null)}
        onSetStatus={setLoadStatusFromDrawer}
        onUpdateFields={updateLoadFieldsFromDrawer}
        onUpsertLeg={upsertLegFromDrawer}
        onDeleteLeg={deleteLegFromDrawer}
      />

      {dialogState?.kind === "tonu" ? (
        <div className="db-modal-overlay" role="dialog" aria-modal="true" aria-label="Mark TONU">
          <div className="db-modal">
            <div className="db-modal-head">Mark TONU</div>
            <div className="db-modal-body">
              <label className="db-field-label">TONU Amount ($)</label>
              <input
                type="number"
                className="db-input"
                min="0"
                step="0.01"
                value={tonuAmountInput}
                disabled={dialogSubmitting}
                onChange={(e) => setTonuAmountInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmTonu();
                  if (e.key === "Escape" && !dialogSubmitting) setDialogState(null);
                }}
              />
            </div>
            <div className="db-modal-footer">
              <button type="button" className="db-btn db-btn-ghost" disabled={dialogSubmitting} onClick={() => setDialogState(null)}>Cancel</button>
              <button type="button" className="db-btn" disabled={dialogSubmitting} aria-busy={dialogSubmitting} onClick={() => void confirmTonu()}>
                {dialogSubmitting ? "Saving..." : "Confirm TONU"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogState?.kind === "delete" ? (
        <div className="db-modal-overlay" role="dialog" aria-modal="true" aria-label="Delete load">
          <div className="db-modal">
            <div className="db-modal-head">Delete Load</div>
            <div className="db-modal-body">
              <label className="db-field-label">Reason (min 10 chars)</label>
              <textarea
                className="db-input"
                rows={3}
                value={deleteReasonInput}
                disabled={dialogSubmitting}
                onChange={(e) => setDeleteReasonInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void confirmDelete();
                  }
                  if (e.key === "Escape" && !dialogSubmitting) setDialogState(null);
                }}
              />
            </div>
            <div className="db-modal-footer">
              <button type="button" className="db-btn db-btn-ghost" disabled={dialogSubmitting} onClick={() => setDialogState(null)}>Cancel</button>
              <button
                type="button"
                className="db-btn db-btn-danger"
                disabled={dialogSubmitting || deleteReasonInput.trim().length < 10}
                aria-busy={dialogSubmitting}
                onClick={() => void confirmDelete()}
              >
                {dialogSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogState?.kind === "driver-type" ? (
        <div className="db-modal-overlay" role="dialog" aria-modal="true" aria-label="Driver type">
          <div
            className="db-modal"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void confirmDriverType("upload");
              }
              if (e.key === "Escape" && !dialogSubmitting) {
                setDialogState(null);
              }
            }}
          >
            <div className="db-modal-head">Driver Type for Upload</div>
            <div className="db-modal-body">
              <label className="db-field-label">Select driver type (optional)</label>
              <div className="db-radio-group">
                {(["SHUTTLE", "PTP", "LTL"] as IntakeDriverType[]).map((dt) => (
                  <label key={dt} className="db-radio-label">
                    <input
                      type="radio"
                      name="driverType"
                      value={dt}
                      checked={driverTypeInput === dt}
                      disabled={dialogSubmitting}
                      onChange={() => setDriverTypeInput(dt)}
                    />
                    {dt}
                  </label>
                ))}
              </div>
            </div>
            <div className="db-modal-footer">
              <button type="button" className="db-btn db-btn-ghost" disabled={dialogSubmitting} onClick={() => { setDialogState(null); }}>Cancel</button>
              <button type="button" className="db-btn db-btn-ghost" disabled={dialogSubmitting} aria-busy={dialogSubmitting} onClick={() => { void confirmDriverType("skip"); }}>
                {dialogSubmitting ? "Uploading..." : "Skip"}
              </button>
              <button type="button" className="db-btn" disabled={dialogSubmitting} aria-busy={dialogSubmitting} onClick={() => { void confirmDriverType("upload"); }}>
                {dialogSubmitting ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
