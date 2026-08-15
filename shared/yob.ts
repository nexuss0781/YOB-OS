import { createHash, randomUUID } from "node:crypto";

export const MAX_HTML_APP_BYTES = 1024 * 1024;
export const MAX_WALLPAPER_IMAGE_BYTES = 5 * 1024 * 1024;

export const WALLPAPERS = ["aurora", "glacier", "dusk", "void"] as const;
export type WallpaperId = (typeof WALLPAPERS)[number];

export const APP_STATUSES = ["active", "deprecated", "deleted"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export type HtmlPackage = {
  bytes: Buffer;
  checksum: string;
  size: number;
};

export type WallpaperImagePackage = {
  bytes: Buffer;
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
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

export function decodeAndValidateWallpaperImage(
  base64: string,
  mimeType: WallpaperImagePackage["mimeType"]
): WallpaperImagePackage {
  if (
    !base64 ||
    base64.length > Math.ceil(MAX_WALLPAPER_IMAGE_BYTES * 1.4) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) {
    throw new Error("Choose a JPG, PNG, or WebP image under 5 MiB.");
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_WALLPAPER_IMAGE_BYTES) {
    throw new Error("Choose a JPG, PNG, or WebP image under 5 MiB.");
  }

  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  const webp =
    bytes.subarray(0, 4).equals(Buffer.from("RIFF")) &&
    bytes.subarray(8, 12).equals(Buffer.from("WEBP"));
  const valid =
    (mimeType === "image/png" && png) ||
    (mimeType === "image/jpeg" && jpeg) ||
    (mimeType === "image/webp" && webp);
  if (!valid) {
    throw new Error("The selected image does not match its declared format.");
  }

  return {
    bytes,
    mimeType,
    extension:
      mimeType === "image/jpeg"
        ? "jpg"
        : mimeType === "image/png"
          ? "png"
          : "webp",
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

export function makeWallpaperStorageKey(
  userId: number,
  extension: WallpaperImagePackage["extension"]
) {
  return `yob-os/users/${userId}/wallpapers/${randomUUID()}.${extension}`;
}
