import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

function localUploadDir(): string {
  return path.join(process.cwd(), ".uploads");
}

function localUploadPath(hash: string): string {
  return path.join(localUploadDir(), `${hash}.pdf`);
}

function stagedUploadDir(): string {
  return path.join(localUploadDir(), "staged");
}

function stagedUploadPdfPath(uploadId: string): string {
  return path.join(stagedUploadDir(), `${uploadId}.pdf`);
}

function stagedUploadMetaPath(uploadId: string): string {
  return path.join(stagedUploadDir(), `${uploadId}.json`);
}

function isPresignedUrl(url: URL): boolean {
  return url.searchParams.has("X-Amz-Signature") || url.searchParams.has("X-Amz-Algorithm");
}

export async function persistUploadedPdf(input: {
  sourceFileUrl: string;
  sourceFileHash: string;
  fileBuffer: Buffer;
}): Promise<{ mode: "presigned-put" | "local-fallback"; localPath?: string }> {
  const parsed = new URL(input.sourceFileUrl);

  if (isPresignedUrl(parsed) && process.env.NODE_ENV !== "test") {
    const response = await fetch(input.sourceFileUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(input.fileBuffer)
    });
    if (!response.ok) {
      throw new Error(`Failed to upload file to presigned URL: ${response.status}`);
    }
    return { mode: "presigned-put" };
  }

  await mkdir(localUploadDir(), { recursive: true });
  const outputPath = localUploadPath(input.sourceFileHash);
  await writeFile(outputPath, input.fileBuffer);
  return { mode: "local-fallback", localPath: outputPath };
}

export async function readUploadedPdf(input: {
  sourceFileHash: string;
}): Promise<Buffer> {
  return readFile(localUploadPath(input.sourceFileHash));
}

export async function createStagedUpload(input: {
  sourceFileName: string;
  sourceFileUrl: string;
}): Promise<{ uploadId: string; uploadUrl: string; sourceFileUrl: string; expiresAtIso: string }> {
  const uploadId = crypto.randomUUID();
  await mkdir(stagedUploadDir(), { recursive: true });
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const metadata = {
    sourceFileName: input.sourceFileName,
    sourceFileUrl: input.sourceFileUrl,
    createdAtIso: new Date().toISOString(),
    expiresAtIso: expiresAt.toISOString()
  };
  await writeFile(stagedUploadMetaPath(uploadId), JSON.stringify(metadata), "utf8");
  return {
    uploadId,
    uploadUrl: `/api/rate-confirmations?uploadId=${encodeURIComponent(uploadId)}`,
    sourceFileUrl: input.sourceFileUrl,
    expiresAtIso: expiresAt.toISOString()
  };
}

export async function writeStagedUploadBinary(input: { uploadId: string; fileBuffer: Buffer }): Promise<void> {
  await mkdir(stagedUploadDir(), { recursive: true });
  await writeFile(stagedUploadPdfPath(input.uploadId), input.fileBuffer);
}

export async function readStagedUpload(input: {
  uploadId: string;
}): Promise<{ fileBuffer: Buffer; sourceFileUrl: string; sourceFileName: string }> {
  const [fileBuffer, metadataBuffer] = await Promise.all([
    readFile(stagedUploadPdfPath(input.uploadId)),
    readFile(stagedUploadMetaPath(input.uploadId))
  ]);
  const parsed = JSON.parse(metadataBuffer.toString("utf8")) as {
    sourceFileName?: string;
    sourceFileUrl?: string;
    expiresAtIso?: string;
  };
  if (!parsed.sourceFileName || !parsed.sourceFileUrl || !parsed.expiresAtIso) {
    throw new Error("Staged upload metadata is incomplete.");
  }
  const expiresAt = new Date(parsed.expiresAtIso);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw new Error("Staged upload expired. Please retry.");
  }
  return {
    fileBuffer,
    sourceFileName: parsed.sourceFileName,
    sourceFileUrl: parsed.sourceFileUrl
  };
}

export async function clearStagedUpload(input: { uploadId: string }): Promise<void> {
  await Promise.allSettled([
    rm(stagedUploadPdfPath(input.uploadId), { force: true }),
    rm(stagedUploadMetaPath(input.uploadId), { force: true })
  ]);
}

