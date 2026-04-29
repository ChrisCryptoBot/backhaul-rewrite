import { beforeEach, describe, expect, test, vi } from "vitest";
import { PolicyViolationError } from "@/lib/policy-error";
import { IdempotencyConflictError } from "@/lib/idempotency-error";

const auth = vi.fn();
const requireRegionAccess = vi.fn();
const runInRegionScope = vi.fn();
const finalizeUpload = vi.fn();
const enqueueJob = vi.fn();
const isWriteBypassed = vi.fn();
const pdfFixtureBase64 = "JVBERi0xLjQgZmFrZQ==";

vi.mock("@clerk/nextjs/server", () => ({
  auth
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    S3_BUCKET_NAME: "backhaul-ratecons",
    AWS_REGION: "us-east-1"
  })
}));

vi.mock("@/lib/access", () => ({
  requireRegionAccess
}));

vi.mock("@/lib/db", () => ({
  runInRegionScope
}));

vi.mock("@/server/ingestion", () => ({
  computeContentHash: () => "hash-1",
  finalizeUpload
}));

vi.mock("@/server/queue", () => ({
  enqueueJob
}));

vi.mock("@/lib/auth-mode", () => ({
  isWriteBypassed
}));

describe("POST /api/rate-confirmations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isWriteBypassed.mockReturnValue(false);
    runInRegionScope.mockImplementation(async (_regionId: string, fn: () => Promise<unknown>) => fn());
  });

  test("rejects malformed payloads", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        body: JSON.stringify({ pickupDate: "bad" })
      })
    );
    expect(response.status).toBe(400);
  }, 10000);

  test("returns 401 for unauthenticated requests", async () => {
    auth.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          pickupDate: "2026-04-27T12:00:00.000Z",
          sourceFileUrl: "https://backhaul-ratecons.s3.us-east-1.amazonaws.com/file.pdf",
          fileContentBase64: pdfFixtureBase64
        })
      })
    );
    expect(response.status).toBe(401);
  });

  test("requires region membership", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockRejectedValue(new PolicyViolationError("Forbidden"));
    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          pickupDate: "2026-04-27T12:00:00.000Z",
          sourceFileUrl: "https://backhaul-ratecons.s3.us-east-1.amazonaws.com/file.pdf",
          fileContentBase64: pdfFixtureBase64
        })
      })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  test("returns 500 when region access lookup fails unexpectedly", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockRejectedValue(new Error("database timeout"));
    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          pickupDate: "2026-04-27T12:00:00.000Z",
          sourceFileUrl: "https://backhaul-ratecons.s3.us-east-1.amazonaws.com/file.pdf",
          fileContentBase64: pdfFixtureBase64
        })
      })
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "Internal server error" });
  });

  test("succeeds for valid canonical payload", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    finalizeUpload.mockResolvedValue({ rateConfirmationId: "rc-1" });

    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-1"
        },
        body: JSON.stringify({
          regionId: "region-1",
          pickupDate: "2026-04-27T12:00:00.000Z",
          sourceFileUrl: "https://backhaul-ratecons.s3.us-east-1.amazonaws.com/file.pdf",
          fileContentBase64: pdfFixtureBase64
        })
      })
    );

    expect(response.status).toBe(201);
    expect(finalizeUpload).toHaveBeenCalledTimes(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  test("accepts sourceFileName when sourceFileUrl is omitted", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    finalizeUpload.mockResolvedValue({ rateConfirmationId: "rc-1" });

    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          pickupDate: "2026-04-27T12:00:00.000Z",
          sourceFileName: "ratecon.pdf",
          fileContentBase64: pdfFixtureBase64
        })
      })
    );

    expect(response.status).toBe(201);
    expect(finalizeUpload).toHaveBeenCalledTimes(1);
  });

  test("returns 409 on idempotency hash conflict", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    finalizeUpload.mockRejectedValue(new IdempotencyConflictError("Idempotency-Key conflict: payload hash differs from existing request"));
    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-1"
        },
        body: JSON.stringify({
          regionId: "region-1",
          pickupDate: "2026-04-27T12:00:00.000Z",
          sourceFileUrl: "https://backhaul-ratecons.s3.us-east-1.amazonaws.com/file.pdf",
          fileContentBase64: pdfFixtureBase64
        })
      })
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Idempotency-Key conflict: payload hash differs from existing request"
    });
  });

  test("allows unauthenticated write only when explicit write bypass is enabled", async () => {
    isWriteBypassed.mockReturnValue(true);
    auth.mockResolvedValue({ userId: null });
    finalizeUpload.mockResolvedValue({ rateConfirmationId: "rc-1" });
    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          pickupDate: "2026-04-27T12:00:00.000Z",
          sourceFileUrl: "https://backhaul-ratecons.s3.us-east-1.amazonaws.com/file.pdf",
          fileContentBase64: pdfFixtureBase64
        })
      })
    );
    expect(response.status).toBe(201);
  });

  test("rejects non-PDF payloads at API boundary", async () => {
    auth.mockResolvedValue({ userId: "user-1" });
    requireRegionAccess.mockResolvedValue({ userId: "user-1", regionId: "region-1", role: "COORDINATOR" });
    const { POST } = await import("@/app/api/rate-confirmations/route");
    const response = await POST(
      new Request("http://localhost/api/rate-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId: "region-1",
          pickupDate: "2026-04-27T12:00:00.000Z",
          sourceFileName: "note.txt",
          fileContentBase64: "ZmFrZQ=="
        })
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Only PDF files are accepted." });
  });
});
