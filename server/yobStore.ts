import { TRPCError } from "@trpc/server";
import {
  type AppRow,
  type AppStatus,
  type AppVersionRow,
  type WallpaperId,
  inTransaction,
  mapApp,
  mapInstallation,
  mapPreference,
  mapVersion,
  rows,
  withParadox,
} from "./paradox";
import {
  createAppId,
  createVersionId,
  decodeAndValidateHtml,
  makeAppSlug,
  makeHtmlStorageKey,
} from "../shared/yob";
import { storageGet, storagePut } from "./storage";

type ListingRow = AppRow;
type VersionRow = AppVersionRow;
type Database = Parameters<Parameters<typeof withParadox>[0]>[0];

function fail(code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) {
  throw new TRPCError({ code, message });
}

function one<T>(db: Database, sql: string, params: unknown[] = []) {
  return rows<T>(db, sql, params)[0];
}

function inClause(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

function mapListing(row: Parameters<typeof mapApp>[0]) {
  return mapApp(row);
}

async function currentVersions(db: Database, listings: ListingRow[]) {
  const ids = listings
    .map(listing => listing.currentVersionId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map<string, VersionRow>();

  const result = rows<Parameters<typeof mapVersion>[0]>(
    db,
    `SELECT * FROM app_versions WHERE id IN (${inClause(ids)})`,
    ids
  ).map(mapVersion);
  return new Map(result.map(row => [row.id, row]));
}

function listingView(
  listing: ListingRow,
  version?: VersionRow,
  installedVersionId?: string
) {
  return {
    id: listing.id,
    slug: listing.slug,
    name: listing.name,
    description: listing.description,
    icon: listing.icon,
    status: listing.status,
    currentVersion: version
      ? {
          id: version.id,
          version: version.version,
          releaseNotes: version.releaseNotes,
          createdAt: version.createdAt,
        }
      : null,
    installedVersionId,
    hasUpdate: Boolean(
      installedVersionId && version && installedVersionId !== version.id
    ),
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

function ownedApp(db: Database, appId: string, publisherId: number) {
  const row = one<Parameters<typeof mapApp>[0]>(
    db,
    "SELECT * FROM apps WHERE id = ? AND publisher_id = ? LIMIT 1",
    [appId, publisherId]
  );
  if (!row) fail("NOT_FOUND", "The requested publisher app was not found.");
  return mapApp(row);
}

function storeApp(db: Database, appId: string) {
  const row = one<Parameters<typeof mapApp>[0]>(
    db,
    "SELECT * FROM apps WHERE id = ? AND status = 'active' LIMIT 1",
    [appId]
  );
  if (!row) fail("NOT_FOUND", "That Play Store listing is not available.");
  return mapApp(row);
}

export async function listStoreApps(search?: string) {
  return withParadox(async db => {
    const query = search?.trim();
    const params: unknown[] = [];
    let sql = "SELECT * FROM apps WHERE status = 'active'";
    if (query) {
      const pattern = `%${query.slice(0, 80)}%`;
      sql += " AND (name LIKE ? OR description LIKE ?)";
      params.push(pattern, pattern);
    }
    sql += " ORDER BY updated_at DESC";
    const listings = rows<Parameters<typeof mapApp>[0]>(db, sql, params).map(
      mapListing
    );
    const versions = await currentVersions(db, listings);
    return listings.map(listing =>
      listingView(listing, versions.get(listing.currentVersionId ?? ""))
    );
  });
}

export async function getStoreApp(appId: string) {
  return withParadox(async db => {
    const listing = storeApp(db, appId);
    const versions = await currentVersions(db, [listing]);
    return listingView(listing, versions.get(listing.currentVersionId ?? ""));
  });
}

export async function listPublisherApps(publisherId: number) {
  return withParadox(async db => {
    const listings = rows<Parameters<typeof mapApp>[0]>(
      db,
      "SELECT * FROM apps WHERE publisher_id = ? ORDER BY updated_at DESC",
      [publisherId]
    ).map(mapListing);
    const versions = await currentVersions(db, listings);
    return listings.map(listing =>
      listingView(listing, versions.get(listing.currentVersionId ?? ""))
    );
  });
}

export async function publishApp(input: {
  publisherId: number;
  name: string;
  description: string;
  icon: string;
  version: string;
  releaseNotes?: string;
  htmlBase64: string;
}) {
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
    db =>
      inTransaction(db, () => {
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
            now,
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
            now,
          ]
        );
      }),
    { write: true }
  );

  return getStoreApp(appId);
}

export async function publishVersion(input: {
  publisherId: number;
  appId: string;
  version: string;
  releaseNotes?: string;
  htmlBase64: string;
}) {
  const packageData = decodeAndValidateHtml(input.htmlBase64);
  const versionId = createVersionId();
  const now = Date.now();

  await withParadox(
    async db => {
      const app = ownedApp(db, input.appId, input.publisherId);
      if (app.status !== "active") {
        fail("BAD_REQUEST", "Only active listings can receive a new version.");
      }
      const existing = one<{ id: string }>(
        db,
        "SELECT id FROM app_versions WHERE app_id = ? AND version = ? LIMIT 1",
        [app.id, input.version.trim()]
      );
      if (existing)
        fail("CONFLICT", "This version already exists for the app.");

      const stored = await storagePut(
        makeHtmlStorageKey(app.id, versionId),
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
            app.id,
            input.version.trim(),
            stored.key,
            packageData.checksum,
            packageData.size,
            input.releaseNotes?.trim() || null,
            now,
          ]
        );
        db.execute(
          "UPDATE apps SET current_version_id = ?, updated_at = ? WHERE id = ?",
          [versionId, now, app.id]
        );
      });
    },
    { write: true }
  );
  return listPublisherApps(input.publisherId);
}

export async function setAppStatus(
  publisherId: number,
  appId: string,
  status: AppStatus
) {
  await withParadox(
    db => {
      ownedApp(db, appId, publisherId);
      db.execute("UPDATE apps SET status = ?, updated_at = ? WHERE id = ?", [
        status,
        Date.now(),
        appId,
      ]);
    },
    { write: true }
  );
  return listPublisherApps(publisherId);
}

export async function homeSnapshot(userId: number) {
  return withParadox(async db => {
    const preference = one<Parameters<typeof mapPreference>[0]>(
      db,
      "SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1",
      [userId]
    );
    const installations = rows<Parameters<typeof mapInstallation>[0]>(
      db,
      "SELECT * FROM app_installations WHERE user_id = ?",
      [userId]
    ).map(mapInstallation);
    const listingIds = installations.map(installation => installation.appId);
    const listings = listingIds.length
      ? rows<Parameters<typeof mapApp>[0]>(
          db,
          `SELECT * FROM apps WHERE id IN (${inClause(listingIds)})`,
          listingIds
        ).map(mapListing)
      : [];
    const listingById = new Map(listings.map(listing => [listing.id, listing]));
    const installedVersionIds = installations.map(
      installation => installation.installedVersionId
    );
    const installedVersions = installedVersionIds.length
      ? rows<Parameters<typeof mapVersion>[0]>(
          db,
          `SELECT * FROM app_versions WHERE id IN (${inClause(installedVersionIds)})`,
          installedVersionIds
        ).map(mapVersion)
      : [];
    const installedVersionById = new Map(
      installedVersions.map(version => [version.id, version])
    );
    const current = await currentVersions(db, listings);

    return {
      wallpaper: preference ? mapPreference(preference).wallpaper : "aurora",
      apps: installations.flatMap(installation => {
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
              version: installedVersion.version,
            },
            canUpdate:
              listing.status === "active" &&
              installation.installedVersionId !== listing.currentVersionId,
          },
        ];
      }),
    };
  });
}

export async function setWallpaper(userId: number, wallpaper: WallpaperId) {
  const now = Date.now();
  await withParadox(
    db => {
      const preference = one<{ id: string }>(
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

export async function installApp(userId: number, appId: string) {
  const now = Date.now();
  await withParadox(
    db => {
      const listing = storeApp(db, appId);
      if (!listing.currentVersionId) {
        fail("NOT_FOUND", "This Play Store listing is unavailable.");
      }
      const existing = one<{ id: string }>(
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

export async function applyUpdate(userId: number, appId: string) {
  await withParadox(
    db => {
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

export async function uninstallApp(userId: number, appId: string) {
  await withParadox(
    db => {
      db.execute(
        "DELETE FROM app_installations WHERE user_id = ? AND app_id = ?",
        [userId, appId]
      );
    },
    { write: true }
  );
  return homeSnapshot(userId);
}

export async function launchInstalledApp(userId: number, appId: string) {
  return withParadox(async db => {
    const installation = one<Parameters<typeof mapInstallation>[0]>(
      db,
      "SELECT * FROM app_installations WHERE user_id = ? AND app_id = ? LIMIT 1",
      [userId, appId]
    );
    if (!installation) {
      fail("NOT_FOUND", "This app is not installed or is no longer available.");
    }
    const listing = one<Parameters<typeof mapApp>[0]>(
      db,
      "SELECT * FROM apps WHERE id = ? LIMIT 1",
      [appId]
    );
    const version = one<Parameters<typeof mapVersion>[0]>(
      db,
      "SELECT * FROM app_versions WHERE id = ? LIMIT 1",
      [installation.installed_version_id]
    );
    if (!listing || !version || listing.status === "deleted") {
      fail("NOT_FOUND", "This app is not installed or is no longer available.");
    }
    const stored = await storageGet(mapVersion(version).htmlStorageKey);
    const app = mapApp(listing);
    const installedVersion = mapVersion(version);
    return {
      appId: app.id,
      name: app.name,
      version: installedVersion.version,
      htmlUrl: stored.url,
    };
  });
}
