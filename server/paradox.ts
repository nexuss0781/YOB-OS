import { connect, type ParadConnection } from "parad";
import path from "node:path";
import os from "node:os";

export type UserRole = "user" | "admin";
export type AppStatus = "active" | "deprecated" | "deleted";
export type WallpaperId = "aurora" | "glacier" | "dusk" | "void";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type InsertUser = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  passwordHash?: string | null;
  role?: UserRole;
  lastSignedIn?: Date;
};

export type AppRow = {
  id: string;
  publisherId: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  status: AppStatus;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AppVersionRow = {
  id: string;
  appId: string;
  version: string;
  htmlStorageKey: string;
  checksum: string;
  contentSize: number;
  releaseNotes: string | null;
  createdAt: Date;
};

export type AppInstallationRow = {
  id: string;
  userId: number;
  appId: string;
  installedVersionId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserPreferenceRow = {
  id: string;
  userId: number;
  wallpaper: WallpaperId;
  createdAt: Date;
  updatedAt: Date;
};

type RawUser = {
  id: number;
  open_id: string;
  name: string | null;
  email: string | null;
  login_method: string | null;
  password_hash: string | null;
  role: UserRole;
  created_at: number;
  updated_at: number;
  last_signed_in: number;
};

type RawApp = {
  id: string;
  publisher_id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  status: AppStatus;
  current_version_id: string | null;
  created_at: number;
  updated_at: number;
};

type RawVersion = {
  id: string;
  app_id: string;
  version: string;
  html_storage_key: string;
  checksum: string;
  content_size: number;
  release_notes: string | null;
  created_at: number;
};

type RawInstallation = {
  id: string;
  user_id: number;
  app_id: string;
  installed_version_id: string;
  created_at: number;
  updated_at: number;
};

type RawPreference = {
  id: string;
  user_id: number;
  wallpaper: WallpaperId;
  created_at: number;
  updated_at: number;
};

const PARADOX_PROJECT = "yob-os";
const PARADOX_DATABASE = "yob-os";
const PARADOX_RUNTIME_DIR = path.join(os.tmpdir(), "yob-os-paradox");
const PARADOX_DB_PATH = path.join(PARADOX_RUNTIME_DIR, "yob-os.db");
process.env.PARADOX_HOME ??= path.join(PARADOX_RUNTIME_DIR, "config");
const FALLBACK_GATEWAY = "https://paradox-db.onrender.com/v1";
const ACTIVE_GATEWAY_RESOLVER =
  "https://paradox-domain.onrender.com/active-domain.json";

let cachedGatewayUrl: string | null = null;
let queue: Promise<void> = Promise.resolve();

function toDate(value: number | string | Date) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? new Date(asNumber) : new Date(value);
}

export function mapUser(row: RawUser): User {
  return {
    id: Number(row.id),
    openId: row.open_id,
    name: row.name,
    email: row.email,
    loginMethod: row.login_method,
    role: row.role,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    lastSignedIn: toDate(row.last_signed_in),
  };
}

export function mapApp(row: RawApp): AppRow {
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
    updatedAt: toDate(row.updated_at),
  };
}

export function mapVersion(row: RawVersion): AppVersionRow {
  return {
    id: row.id,
    appId: row.app_id,
    version: row.version,
    htmlStorageKey: row.html_storage_key,
    checksum: row.checksum,
    contentSize: Number(row.content_size),
    releaseNotes: row.release_notes,
    createdAt: toDate(row.created_at),
  };
}

export function mapInstallation(row: RawInstallation): AppInstallationRow {
  return {
    id: row.id,
    userId: Number(row.user_id),
    appId: row.app_id,
    installedVersionId: row.installed_version_id,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapPreference(row: RawPreference): UserPreferenceRow {
  return {
    id: row.id,
    userId: Number(row.user_id),
    wallpaper: row.wallpaper,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function rows<T>(
  db: ParadConnection,
  sql: string,
  params: unknown[] = []
) {
  return db.execute(sql, params).rows as T[];
}

function schemaExists(db: ParadConnection) {
  return (
    rows<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).length > 0
  );
}

function hasColumn(db: ParadConnection, column: string) {
  return rows<{ name: string }>(db, "PRAGMA table_info(users)").some(
    row => row.name === column
  );
}

function ensureSchema(db: ParadConnection) {
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
    icon TEXT NOT NULL DEFAULT '◈',
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
    const payload = (await response.json()) as { gatewayUrl?: string };
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

async function exclusive<T>(work: () => Promise<T>) {
  const previous = queue;
  let release: (() => void) | undefined;
  queue = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release?.();
  }
}

export async function withParadox<T>(
  work: (db: ParadConnection) => Promise<T> | T,
  options: { write?: boolean } = {}
) {
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
      autoSync: false,
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

export async function inTransaction<T>(
  db: ParadConnection,
  work: () => Promise<T> | T
) {
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
