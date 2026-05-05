export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface UploadFileLike {
  name: string;
  type: string;
  size: number;
}

export function isPdfUpload(file: UploadFileLike): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function splitUploadBatch<T extends UploadFileLike>(files: T[]) {
  const acceptedFiles = files.filter(isPdfUpload);
  const rejectedFiles = files.filter((file) => !isPdfUpload(file));
  const oversizedFiles = acceptedFiles.filter((file) => file.size > MAX_UPLOAD_BYTES);
  const validFiles = acceptedFiles.filter((file) => file.size <= MAX_UPLOAD_BYTES);
  return { acceptedFiles, rejectedFiles, oversizedFiles, validFiles };
}

export function uploadDropzoneLabel(isDragActive: boolean): string {
  return isDragActive ? "Release to upload" : "Drop rate cons here";
}
