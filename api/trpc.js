// server/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/env.ts
var ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";

// server/db.ts
import { randomUUID } from "node:crypto";

// server/paradox.ts
import { connect } from "parad";
import path from "node:path";
import os from "node:os";
var PARADOX_PROJECT = "yob-os";
var PARADOX_DATABASE = "yob-os";
var PARADOX_DB_PATH = path.join(os.tmpdir(), "yob-os-paradox", "yob-os.db");
var FALLBACK_GATEWAY = "https://paradox-db.onrender.com/v1";
var ACTIVE_GATEWAY_RESOLVER = "https://paradox-domain.onrender.com/active-domain.json";
var cachedGatewayUrl = null;
var queue = Promise.resolve();
function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? new Date(asNumber) : new Date(value);
}
function mapUser(row) {
  return {
    id: Number(row.id),
    openId: row.open_id,
    name: row.name,
    email: row.email,
    loginMethod: row.login_method,
    role: row.role,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    lastSignedIn: toDate(row.last_signed_in)
  };
}
function mapApp(row) {
  return {
    id: row.id,
    publisherId: Number(row.publisher_id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    status: row.status,
    currentVersionId: row.current_version_id,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  };
}
function mapVersion(row) {
  return {
    id: row.id,
    appId: row.app_id,
    version: row.version,
    htmlStorageKey: row.html_storage_key,
    checksum: row.checksum,
    contentSize: Number(row.content_size),
    releaseNotes: row.release_notes,
    createdAt: toDate(row.created_at)
  };
}
function mapInstallation(row) {
  return {
    id: row.id,
    userId: Number(row.user_id),
    appId: row.app_id,
    installedVersionId: row.installed_version_id,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  };
}
function mapPreference(row) {
  return {
    id: row.id,
    userId: Number(row.user_id),
    wallpaper: row.wallpaper,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  };
}
function rows(db, sql, params = []) {
  return db.execute(sql, params).rows;
}
function schemaExists(db) {
  return rows(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  ).length > 0;
}
function hasColumn(db, column) {
  return rows(db, "PRAGMA table_info(users)").some(
    (row) => row.name === column
  );
}
function ensureSchema(db) {
  const schemaAlreadyExists = schemaExists(db);
  db.execute("PRAGMA foreign_keys = ON");
  if (!schemaAlreadyExists) {
    db.execute(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    open_id TEXT NOT NULL UNIQUE,
    name TEXT,
    email TEXT,
    login_method TEXT,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_signed_in INTEGER NOT NULL
  )`);
    db.execute(`CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    publisher_id INTEGER NOT NULL REFERENCES users(id),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '\u25C8',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'deleted')),
    current_version_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
    db.execute(`CREATE TABLE app_versions (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(id),
    version TEXT NOT NULL,
    html_storage_key TEXT NOT NULL,
    checksum TEXT NOT NULL,
    content_size INTEGER NOT NULL,
    release_notes TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(app_id, version)
  )`);
    db.execute(`CREATE TABLE app_installations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    app_id TEXT NOT NULL REFERENCES apps(id),
    installed_version_id TEXT NOT NULL REFERENCES app_versions(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(user_id, app_id)
  )`);
    db.execute(`CREATE TABLE user_preferences (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    wallpaper TEXT NOT NULL DEFAULT 'aurora' CHECK (wallpaper IN ('aurora', 'glacier', 'dusk', 'void')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
    db.execute("CREATE INDEX apps_publisher_index ON apps(publisher_id)");
    db.execute("CREATE INDEX apps_status_index ON apps(status)");
    db.execute("CREATE INDEX app_versions_app_index ON app_versions(app_id)");
    db.execute(
      "CREATE INDEX installations_user_index ON app_installations(user_id)"
    );
  }
  if (!hasColumn(db, "password_hash")) {
    db.execute("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }
  db.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL"
  );
  return !schemaAlreadyExists;
}
async function resolveGatewayUrl() {
  if (process.env.PARADOX_GATEWAY_URL) {
    return process.env.PARADOX_GATEWAY_URL.replace(/\/+$/, "");
  }
  if (cachedGatewayUrl) return cachedGatewayUrl;
  try {
    const response = await fetch(ACTIVE_GATEWAY_RESOLVER);
    if (!response.ok) throw new Error(`resolver status ${response.status}`);
    const payload = await response.json();
    if (!payload.gatewayUrl)
      throw new Error("resolver returned no gateway URL");
    cachedGatewayUrl = `${payload.gatewayUrl.replace(/\/+$/, "")}/v1`;
  } catch {
    cachedGatewayUrl = FALLBACK_GATEWAY;
  }
  return cachedGatewayUrl;
}
function assertRuntimeConfig() {
  const apiKey = process.env.PARADOX_API_KEY;
  const passphrase = process.env.PARADOX_PASSPHRASE;
  if (!apiKey || !passphrase) {
    throw new Error("Paradox database credentials are not configured.");
  }
  return { apiKey, passphrase };
}
async function exclusive(work) {
  const previous = queue;
  let release;
  queue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release?.();
  }
}
async function withParadox(work, options = {}) {
  return exclusive(async () => {
    const { apiKey, passphrase } = assertRuntimeConfig();
    const gatewayUrl = await resolveGatewayUrl();
    const db = await connect({
      name: PARADOX_DATABASE,
      project: PARADOX_PROJECT,
      dbPath: PARADOX_DB_PATH,
      gatewayUrl,
      apiKey,
      passphrase,
      autoSync: false
    });
    try {
      await db.pull();
      const schemaCreated = ensureSchema(db);
      const result = await work(db);
      if (options.write || schemaCreated) await db.push();
      return result;
    } finally {
      db.close();
    }
  });
}
async function inTransaction(db, work) {
  db.execute("BEGIN");
  try {
    const result = await work();
    db.execute("COMMIT");
    return result;
  } catch (error) {
    db.execute("ROLLBACK");
    throw error;
  }
}

// server/db.ts
async function getUserByOpenId(openId) {
  return withParadox((db) => {
    const row = rows(
      db,
      "SELECT * FROM users WHERE open_id = ? LIMIT 1",
      [openId]
    )[0];
    return row ? mapUser(row) : void 0;
  });
}
async function createLocalUser(input) {
  return withParadox(
    (db) => {
      const existing = rows(
        db,
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [input.email]
      )[0];
      if (existing) throw new Error("EMAIL_IN_USE");
      const now = Date.now();
      const openId = `local_${randomUUID()}`;
      db.execute(
        `INSERT INTO users (
          open_id, name, email, login_method, password_hash, role, created_at, updated_at, last_signed_in
        ) VALUES (?, ?, ?, 'password', ?, 'user', ?, ?, ?)`,
        [openId, input.name, input.email, input.passwordHash, now, now, now]
      );
      const row = rows(
        db,
        "SELECT * FROM users WHERE open_id = ? LIMIT 1",
        [openId]
      )[0];
      if (!row) throw new Error("Unable to create account.");
      return mapUser(row);
    },
    { write: true }
  );
}
async function getLocalUserCredentials(email) {
  return withParadox((db) => {
    const row = rows(db, "SELECT * FROM users WHERE email = ? LIMIT 1", [email])[0];
    if (!row?.password_hash) return void 0;
    return { user: mapUser(row), passwordHash: row.password_hash };
  });
}
async function recordLocalSignIn(openId) {
  await withParadox(
    (db) => {
      const now = Date.now();
      db.execute(
        "UPDATE users SET last_signed_in = ?, updated_at = ? WHERE open_id = ?",
        [now, now, openId]
      );
    },
    { write: true }
  );
}

// server/_core/sdk.ts
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var SDKServer = class {
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) {
      throw new Error(
        "JWT_SECRET must be configured for first-party sessions."
      );
    }
    return new TextEncoder().encode(secret);
  }
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let token = cookies.get(COOKIE_NAME);
    if (!token) {
      const header = req.headers.authorization;
      if (typeof header === "string" && header.startsWith("Bearer ")) {
        token = header.slice(7);
      }
    }
    const session = await this.verifySession(token);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const user = await getUserByOpenId(session.openId);
    if (!user) {
      throw ForbiddenError("User not found");
    }
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/routers.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
import { z as z3 } from "zod";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/localAuth.ts
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
var scrypt = promisify(scryptCallback);
var HASH_BYTES = 64;
var MIN_PASSWORD_LENGTH = 10;
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Use at least 10 characters for your password.";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Use both letters and numbers in your password.";
  }
  return null;
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, HASH_BYTES);
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}
async function verifyPassword(password, storedHash) {
  const [algorithm, salt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, "base64url");
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/yob.ts
import { z as z2 } from "zod";

// server/yobStore.ts
import { TRPCError as TRPCError3 } from "@trpc/server";

// shared/yob.ts
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
var MAX_HTML_APP_BYTES = 1024 * 1024;
var WALLPAPERS = ["aurora", "glacier", "dusk", "void"];
var APP_STATUSES = ["active", "deprecated", "deleted"];
function decodeAndValidateHtml(base64) {
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
    size: bytes.byteLength
  };
}
function createAppId() {
  return randomUUID2();
}
function createVersionId() {
  return randomUUID2();
}
function makeAppSlug(name) {
  const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return `${normalized || "yob-app"}-${randomUUID2().slice(0, 8)}`;
}
function makeHtmlStorageKey(appId, versionId) {
  return `yob-os/apps/${appId}/versions/${versionId}.html`;
}

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}
async function storageGet(relKey) {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

// server/yobStore.ts
function fail(code, message) {
  throw new TRPCError3({ code, message });
}
function one(db, sql, params = []) {
  return rows(db, sql, params)[0];
}
function inClause(values) {
  return values.map(() => "?").join(", ");
}
function mapListing(row) {
  return mapApp(row);
}
async function currentVersions(db, listings) {
  const ids = listings.map((listing) => listing.currentVersionId).filter((id) => Boolean(id));
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const result = rows(
    db,
    `SELECT * FROM app_versions WHERE id IN (${inClause(ids)})`,
    ids
  ).map(mapVersion);
  return new Map(result.map((row) => [row.id, row]));
}
function listingView(listing, version, installedVersionId) {
  return {
    id: listing.id,
    slug: listing.slug,
    name: listing.name,
    description: listing.description,
    icon: listing.icon,
    status: listing.status,
    currentVersion: version ? {
      id: version.id,
      version: version.version,
      releaseNotes: version.releaseNotes,
      createdAt: version.createdAt
    } : null,
    installedVersionId,
    hasUpdate: Boolean(
      installedVersionId && version && installedVersionId !== version.id
    ),
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt
  };
}
function ownedApp(db, appId, publisherId) {
  const row = one(
    db,
    "SELECT * FROM apps WHERE id = ? AND publisher_id = ? LIMIT 1",
    [appId, publisherId]
  );
  if (!row) fail("NOT_FOUND", "The requested publisher app was not found.");
  return mapApp(row);
}
function storeApp(db, appId) {
  const row = one(
    db,
    "SELECT * FROM apps WHERE id = ? AND status = 'active' LIMIT 1",
    [appId]
  );
  if (!row) fail("NOT_FOUND", "That Play Store listing is not available.");
  return mapApp(row);
}
async function listStoreApps(search) {
  return withParadox(async (db) => {
    const query = search?.trim();
    const params = [];
    let sql = "SELECT * FROM apps WHERE status = 'active'";
    if (query) {
      const pattern = `%${query.slice(0, 80)}%`;
      sql += " AND (name LIKE ? OR description LIKE ?)";
      params.push(pattern, pattern);
    }
    sql += " ORDER BY updated_at DESC";
    const listings = rows(db, sql, params).map(
      mapListing
    );
    const versions = await currentVersions(db, listings);
    return listings.map(
      (listing) => listingView(listing, versions.get(listing.currentVersionId ?? ""))
    );
  });
}
async function getStoreApp(appId) {
  return withParadox(async (db) => {
    const listing = storeApp(db, appId);
    const versions = await currentVersions(db, [listing]);
    return listingView(listing, versions.get(listing.currentVersionId ?? ""));
  });
}
async function listPublisherApps(publisherId) {
  return withParadox(async (db) => {
    const listings = rows(
      db,
      "SELECT * FROM apps WHERE publisher_id = ? ORDER BY updated_at DESC",
      [publisherId]
    ).map(mapListing);
    const versions = await currentVersions(db, listings);
    return listings.map(
      (listing) => listingView(listing, versions.get(listing.currentVersionId ?? ""))
    );
  });
}
async function publishApp(input) {
  const packageData = decodeAndValidateHtml(input.htmlBase64);
  const appId = createAppId();
  const versionId = createVersionId();
  const stored = await storagePut(
    makeHtmlStorageKey(appId, versionId),
    packageData.bytes,
    "text/html; charset=utf-8"
  );
  const now = Date.now();
  await withParadox(
    (db) => inTransaction(db, () => {
      db.execute(
        `INSERT INTO apps (
            id, publisher_id, slug, name, description, icon, status, current_version_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        [
          appId,
          input.publisherId,
          makeAppSlug(input.name),
          input.name.trim(),
          input.description.trim(),
          input.icon.trim(),
          versionId,
          now,
          now
        ]
      );
      db.execute(
        `INSERT INTO app_versions (
            id, app_id, version, html_storage_key, checksum, content_size, release_notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          appId,
          input.version.trim(),
          stored.key,
          packageData.checksum,
          packageData.size,
          input.releaseNotes?.trim() || null,
          now
        ]
      );
    }),
    { write: true }
  );
  return getStoreApp(appId);
}
async function publishVersion(input) {
  const packageData = decodeAndValidateHtml(input.htmlBase64);
  const versionId = createVersionId();
  const now = Date.now();
  await withParadox(
    async (db) => {
      const app2 = ownedApp(db, input.appId, input.publisherId);
      if (app2.status !== "active") {
        fail("BAD_REQUEST", "Only active listings can receive a new version.");
      }
      const existing = one(
        db,
        "SELECT id FROM app_versions WHERE app_id = ? AND version = ? LIMIT 1",
        [app2.id, input.version.trim()]
      );
      if (existing)
        fail("CONFLICT", "This version already exists for the app.");
      const stored = await storagePut(
        makeHtmlStorageKey(app2.id, versionId),
        packageData.bytes,
        "text/html; charset=utf-8"
      );
      return inTransaction(db, () => {
        db.execute(
          `INSERT INTO app_versions (
            id, app_id, version, html_storage_key, checksum, content_size, release_notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            versionId,
            app2.id,
            input.version.trim(),
            stored.key,
            packageData.checksum,
            packageData.size,
            input.releaseNotes?.trim() || null,
            now
          ]
        );
        db.execute(
          "UPDATE apps SET current_version_id = ?, updated_at = ? WHERE id = ?",
          [versionId, now, app2.id]
        );
      });
    },
    { write: true }
  );
  return listPublisherApps(input.publisherId);
}
async function setAppStatus(publisherId, appId, status) {
  await withParadox(
    (db) => {
      ownedApp(db, appId, publisherId);
      db.execute("UPDATE apps SET status = ?, updated_at = ? WHERE id = ?", [
        status,
        Date.now(),
        appId
      ]);
    },
    { write: true }
  );
  return listPublisherApps(publisherId);
}
async function homeSnapshot(userId) {
  return withParadox(async (db) => {
    const preference = one(
      db,
      "SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1",
      [userId]
    );
    const installations = rows(
      db,
      "SELECT * FROM app_installations WHERE user_id = ?",
      [userId]
    ).map(mapInstallation);
    const listingIds = installations.map((installation) => installation.appId);
    const listings = listingIds.length ? rows(
      db,
      `SELECT * FROM apps WHERE id IN (${inClause(listingIds)})`,
      listingIds
    ).map(mapListing) : [];
    const listingById = new Map(listings.map((listing) => [listing.id, listing]));
    const installedVersionIds = installations.map(
      (installation) => installation.installedVersionId
    );
    const installedVersions = installedVersionIds.length ? rows(
      db,
      `SELECT * FROM app_versions WHERE id IN (${inClause(installedVersionIds)})`,
      installedVersionIds
    ).map(mapVersion) : [];
    const installedVersionById = new Map(
      installedVersions.map((version) => [version.id, version])
    );
    const current = await currentVersions(db, listings);
    return {
      wallpaper: preference ? mapPreference(preference).wallpaper : "aurora",
      apps: installations.flatMap((installation) => {
        const listing = listingById.get(installation.appId);
        const installedVersion = installedVersionById.get(
          installation.installedVersionId
        );
        if (!listing || !installedVersion || listing.status === "deleted")
          return [];
        return [
          {
            ...listingView(
              listing,
              current.get(listing.currentVersionId ?? ""),
              installation.installedVersionId
            ),
            installedVersion: {
              id: installedVersion.id,
              version: installedVersion.version
            },
            canUpdate: listing.status === "active" && installation.installedVersionId !== listing.currentVersionId
          }
        ];
      })
    };
  });
}
async function setWallpaper(userId, wallpaper) {
  const now = Date.now();
  await withParadox(
    (db) => {
      const preference = one(
        db,
        "SELECT id FROM user_preferences WHERE user_id = ? LIMIT 1",
        [userId]
      );
      if (preference) {
        db.execute(
          "UPDATE user_preferences SET wallpaper = ?, updated_at = ? WHERE user_id = ?",
          [wallpaper, now, userId]
        );
      } else {
        db.execute(
          `INSERT INTO user_preferences (id, user_id, wallpaper, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [createAppId(), userId, wallpaper, now, now]
        );
      }
    },
    { write: true }
  );
  return homeSnapshot(userId);
}
async function installApp(userId, appId) {
  const now = Date.now();
  await withParadox(
    (db) => {
      const listing = storeApp(db, appId);
      if (!listing.currentVersionId) {
        fail("NOT_FOUND", "This Play Store listing is unavailable.");
      }
      const existing = one(
        db,
        "SELECT id FROM app_installations WHERE user_id = ? AND app_id = ? LIMIT 1",
        [userId, appId]
      );
      if (!existing) {
        db.execute(
          `INSERT INTO app_installations (
            id, user_id, app_id, installed_version_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [createAppId(), userId, appId, listing.currentVersionId, now, now]
        );
      }
    },
    { write: true }
  );
  return homeSnapshot(userId);
}
async function applyUpdate(userId, appId) {
  await withParadox(
    (db) => {
      const listing = storeApp(db, appId);
      if (!listing.currentVersionId) {
        fail("NOT_FOUND", "There is no update available for this app.");
      }
      const result = db.execute(
        `UPDATE app_installations
         SET installed_version_id = ?, updated_at = ?
         WHERE user_id = ? AND app_id = ?`,
        [listing.currentVersionId, Date.now(), userId, appId]
      );
      if (result.changes === 0) {
        fail("NOT_FOUND", "Install the app before applying updates.");
      }
    },
    { write: true }
  );
  return homeSnapshot(userId);
}
async function uninstallApp(userId, appId) {
  await withParadox(
    (db) => {
      db.execute(
        "DELETE FROM app_installations WHERE user_id = ? AND app_id = ?",
        [userId, appId]
      );
    },
    { write: true }
  );
  return homeSnapshot(userId);
}
async function launchInstalledApp(userId, appId) {
  return withParadox(async (db) => {
    const installation = one(
      db,
      "SELECT * FROM app_installations WHERE user_id = ? AND app_id = ? LIMIT 1",
      [userId, appId]
    );
    if (!installation) {
      fail("NOT_FOUND", "This app is not installed or is no longer available.");
    }
    const listing = one(
      db,
      "SELECT * FROM apps WHERE id = ? LIMIT 1",
      [appId]
    );
    const version = one(
      db,
      "SELECT * FROM app_versions WHERE id = ? LIMIT 1",
      [installation.installed_version_id]
    );
    if (!listing || !version || listing.status === "deleted") {
      fail("NOT_FOUND", "This app is not installed or is no longer available.");
    }
    const stored = await storageGet(mapVersion(version).htmlStorageKey);
    const app2 = mapApp(listing);
    const installedVersion = mapVersion(version);
    return {
      appId: app2.id,
      name: app2.name,
      version: installedVersion.version,
      htmlUrl: stored.url
    };
  });
}

// server/routers/yob.ts
var appIdInput = z2.object({ appId: z2.string().uuid() });
var htmlAppInput = z2.object({
  htmlBase64: z2.string().min(16),
  version: z2.string().trim().min(1).max(32).regex(/^v?\d+(?:\.\d+){0,2}(?:[-+][a-zA-Z0-9.-]+)?$/),
  releaseNotes: z2.string().trim().max(2e3).optional()
});
var yobRouter = router({
  store: router({
    list: publicProcedure.input(
      z2.object({ search: z2.string().trim().max(80).optional() }).optional()
    ).query(({ input }) => listStoreApps(input?.search)),
    get: publicProcedure.input(appIdInput).query(({ input }) => getStoreApp(input.appId)),
    install: protectedProcedure.input(appIdInput).mutation(({ ctx, input }) => installApp(ctx.user.id, input.appId))
  }),
  home: router({
    snapshot: protectedProcedure.query(({ ctx }) => homeSnapshot(ctx.user.id)),
    setWallpaper: protectedProcedure.input(z2.object({ wallpaper: z2.enum(WALLPAPERS) })).mutation(({ ctx, input }) => setWallpaper(ctx.user.id, input.wallpaper)),
    update: protectedProcedure.input(appIdInput).mutation(({ ctx, input }) => applyUpdate(ctx.user.id, input.appId)),
    uninstall: protectedProcedure.input(appIdInput).mutation(({ ctx, input }) => uninstallApp(ctx.user.id, input.appId)),
    launch: protectedProcedure.input(appIdInput).query(({ ctx, input }) => launchInstalledApp(ctx.user.id, input.appId))
  }),
  publisher: router({
    list: protectedProcedure.query(({ ctx }) => listPublisherApps(ctx.user.id)),
    create: protectedProcedure.input(
      htmlAppInput.extend({
        name: z2.string().trim().min(2).max(96),
        description: z2.string().trim().min(8).max(2e3),
        icon: z2.string().trim().min(1).max(32)
      })
    ).mutation(
      ({ ctx, input }) => publishApp({ publisherId: ctx.user.id, ...input })
    ),
    publishVersion: protectedProcedure.input(appIdInput.merge(htmlAppInput)).mutation(
      ({ ctx, input }) => publishVersion({ publisherId: ctx.user.id, ...input })
    ),
    setStatus: protectedProcedure.input(appIdInput.extend({ status: z2.enum(APP_STATUSES) })).mutation(
      ({ ctx, input }) => setAppStatus(ctx.user.id, input.appId, input.status)
    )
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    register: publicProcedure.input(
      z3.object({
        name: z3.string().trim().min(2).max(80),
        email: z3.string().trim().email().max(320),
        password: z3.string().min(1).max(256)
      })
    ).mutation(async ({ ctx, input }) => {
      const passwordIssue = validatePassword(input.password);
      if (passwordIssue) {
        throw new TRPCError4({ code: "BAD_REQUEST", message: passwordIssue });
      }
      const email = normalizeEmail(input.email);
      try {
        const user = await createLocalUser({
          name: input.name.trim(),
          email,
          passwordHash: await hashPassword(input.password)
        });
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || email
        });
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: 1e3 * 60 * 60 * 24 * 365
        });
        return user;
      } catch (error) {
        if (error instanceof Error && error.message === "EMAIL_IN_USE") {
          throw new TRPCError4({
            code: "CONFLICT",
            message: "An account already exists for this email."
          });
        }
        throw error;
      }
    }),
    login: publicProcedure.input(
      z3.object({
        email: z3.string().trim().email().max(320),
        password: z3.string().min(1).max(256)
      })
    ).mutation(async ({ ctx, input }) => {
      const account = await getLocalUserCredentials(
        normalizeEmail(input.email)
      );
      if (!account || !await verifyPassword(input.password, account.passwordHash)) {
        throw new TRPCError4({
          code: "UNAUTHORIZED",
          message: "Email or password is incorrect."
        });
      }
      await recordLocalSignIn(account.user.openId);
      const sessionToken = await sdk.createSessionToken(account.user.openId, {
        name: account.user.name || account.user.email || "YOB user"
      });
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: 1e3 * 60 * 60 * 24 * 365
      });
      return account.user;
    }),
    mobileRegister: publicProcedure.input(
      z3.object({
        name: z3.string().trim().min(2).max(80),
        email: z3.string().trim().email().max(320),
        password: z3.string().min(1).max(256)
      })
    ).mutation(async ({ input }) => {
      const passwordIssue = validatePassword(input.password);
      if (passwordIssue) {
        throw new TRPCError4({ code: "BAD_REQUEST", message: passwordIssue });
      }
      const email = normalizeEmail(input.email);
      try {
        const user = await createLocalUser({
          name: input.name.trim(),
          email,
          passwordHash: await hashPassword(input.password)
        });
        return {
          user,
          sessionToken: await sdk.createSessionToken(user.openId, {
            name: user.name || email
          })
        };
      } catch (error) {
        if (error instanceof Error && error.message === "EMAIL_IN_USE") {
          throw new TRPCError4({
            code: "CONFLICT",
            message: "An account already exists for this email."
          });
        }
        throw error;
      }
    }),
    mobileLogin: publicProcedure.input(
      z3.object({
        email: z3.string().trim().email().max(320),
        password: z3.string().min(1).max(256)
      })
    ).mutation(async ({ input }) => {
      const account = await getLocalUserCredentials(
        normalizeEmail(input.email)
      );
      if (!account || !await verifyPassword(input.password, account.passwordHash)) {
        throw new TRPCError4({
          code: "UNAUTHORIZED",
          message: "Email or password is incorrect."
        });
      }
      await recordLocalSignIn(account.user.openId);
      return {
        user: account.user,
        sessionToken: await sdk.createSessionToken(account.user.openId, {
          name: account.user.name || account.user.email || "YOB user"
        })
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  yob: yobRouter
});

// server/app.ts
function createApp() {
  const app2 = express();
  app2.use(express.json({ limit: "50mb" }));
  app2.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app2);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app2;
}

// server/vercel-trpc.ts
var app = createApp();
function handler(req, res) {
  const procedurePath = req.query?.trpcPath;
  const path2 = Array.isArray(procedurePath) ? procedurePath[0] : procedurePath;
  if (path2) {
    const currentUrl = new URL(req.url ?? "/api/trpc", "http://localhost");
    currentUrl.searchParams.delete("trpcPath");
    req.url = `/api/trpc/${path2}${currentUrl.search}`;
  }
  return app(req, res);
}
export {
  handler as default
};
