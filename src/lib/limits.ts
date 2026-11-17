// Cloud Run rejects HTTP/1 request bodies over 32 MiB, so originals are capped
// at 30 MB to leave room for the multipart form around the file.
export const MAX_UPLOAD_MB = 30;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
