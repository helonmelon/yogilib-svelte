import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Failure } from './archive';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../limits';
const root = () => resolve(process.env.YOGILIB_UPLOAD_DIR || '.local/uploads');
const client = () =>
  new S3Client({
    region: process.env.AWS_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
  });
export const mediaType = (key: string) =>
  ({
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  })[extname(key).toLowerCase()] || 'application/octet-stream';
export async function saveMedia(file: File) {
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Failure(413, `Maximum upload size is ${MAX_UPLOAD_MB} MB`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = extname(file.name).toLowerCase();
  const valid =
    ext === '.pdf'
      ? bytes.subarray(0, 5).toString() === '%PDF-'
      : ext === '.png'
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : ['.jpg', '.jpeg'].includes(ext)
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : ext === '.webp'
            ? bytes.subarray(0, 4).toString() === 'RIFF' &&
              bytes.subarray(8, 12).toString() === 'WEBP'
            : false;
  if (!valid)
    throw new Failure(400, 'Upload a PDF, PNG, JPEG, or WebP original');
  const key = randomUUID() + ext;
  if (process.env.S3_BUCKET)
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: 'originals/' + key,
        Body: bytes,
        ContentType: mediaType(key),
      }),
    );
  else {
    await mkdir(root(), { recursive: true });
    await writeFile(resolve(root(), key), bytes, { flag: 'wx' });
  }
  return '/api/files/' + key;
}
export async function readMedia(key: string, legacy = false) {
  if (key !== basename(key) || key.startsWith('.') || !/^[\w.-]+$/.test(key))
    throw new Failure(404, 'File not found');
  try {
    if (legacy) {
      if (!process.env.LEGACY_UPLOAD_DIR)
        throw new Failure(404, 'Original is not available on this server');
      return await readFile(resolve(process.env.LEGACY_UPLOAD_DIR, key));
    }
    if (process.env.S3_BUCKET) {
      const r = await client().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: 'originals/' + key,
        }),
      );
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return await readFile(resolve(root(), key));
  } catch {
    throw new Failure(404, 'Original is not available on this server');
  }
}
export async function removeMedia(path: string) {
  if (!path.startsWith('/api/files/')) return;
  const key = path.slice(11);
  if (key !== basename(key)) return;
  if (process.env.S3_BUCKET)
    await client().send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: 'originals/' + key,
      }),
    );
  else await unlink(resolve(root(), key)).catch(() => {});
}
export async function mediaResponse(
  key: string,
  request: Request,
  legacy = false,
) {
  const bytes = await readMedia(key, legacy);
  const headers: Record<string, string> = {
    'Content-Type': mediaType(key),
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public,max-age=300',
  };
  const range = request.headers.get('range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2]))
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${bytes.length}` },
      });
    const start = m[1]
      ? Number(m[1])
      : Math.max(0, bytes.length - Number(m[2]));
    const end = m[1]
      ? m[2]
        ? Math.min(Number(m[2]), bytes.length - 1)
        : bytes.length - 1
      : bytes.length - 1;
    if (start > end || start >= bytes.length)
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${bytes.length}` },
      });
    headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`;
    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers,
    });
  }
  return new Response(bytes, { headers });
}
