// ─── Storage Provider ─────────────────────────────────────────────────────────
// Configure which backend to use via STORAGE_PROVIDER env var:
//   "proxy"  — HTTP upload proxy (default; set PROXY_API_URL + PROXY_API_KEY)
//   "s3"     — AWS S3 / Cloudflare R2 / MinIO   (set S3_BUCKET, S3_REGION, etc.)
//   "local"  — write to local filesystem (STORAGE_LOCAL_DIR; dev/test only)
//
// The interface is: storagePut / storageGet / storageDelete
// Swap the implementation below to add a new backend.

import { ENV } from './_core/env';
import path from 'node:path';
import fs from 'node:fs/promises';

// ─── HTTP Proxy adapter (default) ───────────────────────────────────────────

function getProxyConfig() {
  const baseUrl = ENV.proxyApiUrl;
  const apiKey = ENV.proxyApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing. Set PROXY_API_URL and PROXY_API_KEY, " +
      "or switch STORAGE_PROVIDER to 's3' or 'local'."
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

async function proxyPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getProxyConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set("path", key);

  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([Buffer.from(data as Uint8Array)], { type: contentType });
  const form = new FormData();
  form.append("file", blob, key.split("/").pop() ?? key);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: form,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status}): ${message}`);
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function proxyDelete(relKey: string): Promise<void> {
  const { baseUrl, apiKey } = getProxyConfig();
  const key = normalizeKey(relKey);
  const deleteUrl = new URL("v1/storage/delete", ensureTrailingSlash(baseUrl));
  deleteUrl.searchParams.set("path", key);
  await fetch(deleteUrl, { method: "DELETE", headers: buildAuthHeaders(apiKey) }).catch(() => {});
}

async function proxyGet(relKey: string): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getProxyConfig();
  const key = normalizeKey(relKey);
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set("path", key);
  const response = await fetch(downloadApiUrl, { method: "GET", headers: buildAuthHeaders(apiKey) });
  const url = (await response.json()).url;
  return { key, url };
}

// ─── S3 / R2 / MinIO adapter ─────────────────────────────────────────────────

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const key = normalizeKey(relKey);
  const client = new S3Client({
    region: ENV.s3Region || "us-east-1",
    endpoint: ENV.s3Endpoint || undefined,
    credentials: ENV.s3AccessKeyId
      ? { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey }
      : undefined,
  });
  await client.send(new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    Body: typeof data === "string" ? Buffer.from(data) : data,
    ContentType: contentType,
  }));
  const endpoint = ENV.s3Endpoint
    ? `${ENV.s3Endpoint.replace(/\/+$/, "")}/${ENV.s3Bucket}`
    : `https://${ENV.s3Bucket}.s3.${ENV.s3Region || "us-east-1"}.amazonaws.com`;
  return { key, url: `${endpoint}/${key}` };
}

async function s3Delete(relKey: string): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const key = normalizeKey(relKey);
  const client = new S3Client({
    region: ENV.s3Region || "us-east-1",
    endpoint: ENV.s3Endpoint || undefined,
    credentials: ENV.s3AccessKeyId
      ? { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey }
      : undefined,
  });
  await client.send(new DeleteObjectCommand({ Bucket: ENV.s3Bucket, Key: key })).catch(() => {});
}

async function s3Get(relKey: string): Promise<{ key: string; url: string }> {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const key = normalizeKey(relKey);
  const client = new S3Client({
    region: ENV.s3Region || "us-east-1",
    endpoint: ENV.s3Endpoint || undefined,
    credentials: ENV.s3AccessKeyId
      ? { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey }
      : undefined,
  });
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }), { expiresIn: 3600 });
  return { key, url };
}

// ─── Local filesystem adapter (dev/test only) ─────────────────────────────────

async function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const dir = ENV.storageLocalDir || "./uploads";
  const filePath = path.join(dir, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data as Buffer);
  const baseUrl = ENV.publicBaseUrl || "http://localhost:3000";
  return { key, url: `${baseUrl}/uploads/${key}` };
}

async function localDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  const dir = ENV.storageLocalDir || "./uploads";
  await fs.rm(path.join(dir, key), { force: true }).catch(() => {});
}

async function localGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const baseUrl = ENV.publicBaseUrl || "http://localhost:3000";
  return { key, url: `${baseUrl}/uploads/${key}` };
}

// ─── Public API ───────────────────────────────────────────────────────────────

function provider() {
  return (ENV.storageProvider || "proxy").toLowerCase();
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  switch (provider()) {
    case "s3": return s3Put(relKey, data, contentType);
    case "local": return localPut(relKey, data, contentType);
    default: return proxyPut(relKey, data, contentType);
  }
}

export async function storageDelete(relKey: string): Promise<void> {
  switch (provider()) {
    case "s3": return s3Delete(relKey);
    case "local": return localDelete(relKey);
    default: return proxyDelete(relKey);
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  switch (provider()) {
    case "s3": return s3Get(relKey);
    case "local": return localGet(relKey);
    default: return proxyGet(relKey);
  }
}
