import { createHash, randomUUID } from "node:crypto";

export const MAX_HTML_APP_BYTES = 1024 * 1024;

export const WALLPAPERS = ["aurora", "glacier", "dusk", "void"] as const;
export type WallpaperId = (typeof WALLPAPERS)[number];

export const APP_STATUSES = ["active", "deprecated", "deleted"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export type HtmlPackage = {
  bytes: Buffer;
  checksum: string;
  size: number;
};

export function decodeAndValidateHtml(base64: string): HtmlPackage {
  if (!base64 || base64.length > Math.ceil(MAX_HTML_APP_BYTES * 1.4)) {
    throw new Error("The HTML package is empty or exceeds the 1 MiB limit.");
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("The upload must be a Base64-encoded HTML document.");
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_HTML_APP_BYTES) {
    throw new Error("The HTML package is empty or exceeds the 1 MiB limit.");
  }

  const html = bytes.toString("utf8");
  if (!/<!doctype\s+html|<html(?:\s|>)/i.test(html)) {
    throw new Error("Upload a complete standalone HTML document.");
  }

  if (/<base(?:\s|>)/i.test(html)) {
    throw new Error("HTML applications cannot declare a base element.");
  }

  if (/<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(html)) {
    throw new Error(
      "HTML applications cannot use automatic page refresh redirects."
    );
  }

  return {
    bytes,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.byteLength,
  };
}

export function createAppId() {
  return randomUUID();
}

export function createVersionId() {
  return randomUUID();
}

export function makeAppSlug(name: string) {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${normalized || "yob-app"}-${randomUUID().slice(0, 8)}`;
}

export function makeHtmlStorageKey(appId: string, versionId: string) {
  return `yob-os/apps/${appId}/versions/${versionId}.html`;
}
