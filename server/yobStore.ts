import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  appInstallations,
  appVersions,
  apps,
  userPreferences,
} from "../drizzle/schema";
import {
  type AppStatus,
  type WallpaperId,
  createAppId,
  createVersionId,
  decodeAndValidateHtml,
  makeAppSlug,
  makeHtmlStorageKey,
} from "../shared/yob";
import { getDb } from "./db";
import { storageGet, storagePut } from "./storage";

type ListingRow = typeof apps.$inferSelect;
type VersionRow = typeof appVersions.$inferSelect;

async function database() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "YOB-OS cloud storage is temporarily unavailable.",
    });
  }
  return db;
}

async function currentVersions(listings: ListingRow[]) {
  const ids = listings
    .map(listing => listing.currentVersionId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map<string, VersionRow>();

  const db = await database();
  const rows = await db
    .select()
    .from(appVersions)
    .where(inArray(appVersions.id, ids));
  return new Map(rows.map(row => [row.id, row]));
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

async function ownedApp(appId: string, publisherId: number) {
  const db = await database();
  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.publisherId, publisherId)))
    .limit(1);
  const app = rows[0];
  if (!app) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The requested publisher app was not found.",
    });
  }
  return app;
}

export async function listStoreApps(search?: string) {
  const db = await database();
  const query = search?.trim();
  const conditions = [eq(apps.status, "active")];
  if (query) {
    const pattern = `%${query.slice(0, 80)}%`;
    conditions.push(
      or(like(apps.name, pattern), like(apps.description, pattern))!
    );
  }
  const listings = await db
    .select()
    .from(apps)
    .where(and(...conditions))
    .orderBy(desc(apps.updatedAt));
  const versions = await currentVersions(listings);
  return listings.map(listing =>
    listingView(listing, versions.get(listing.currentVersionId ?? ""))
  );
}

export async function getStoreApp(appId: string) {
  const db = await database();
  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.status, "active")))
    .limit(1);
  const listing = rows[0];
  if (!listing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That Play Store listing is not available.",
    });
  }
  const versions = await currentVersions([listing]);
  return listingView(listing, versions.get(listing.currentVersionId ?? ""));
}

export async function listPublisherApps(publisherId: number) {
  const db = await database();
  const listings = await db
    .select()
    .from(apps)
    .where(eq(apps.publisherId, publisherId))
    .orderBy(desc(apps.updatedAt));
  const versions = await currentVersions(listings);
  return listings.map(listing =>
    listingView(listing, versions.get(listing.currentVersionId ?? ""))
  );
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
  const db = await database();

  await db.transaction(async tx => {
    await tx.insert(apps).values({
      id: appId,
      publisherId: input.publisherId,
      slug: makeAppSlug(input.name),
      name: input.name.trim(),
      description: input.description.trim(),
      icon: input.icon.trim(),
      currentVersionId: versionId,
      status: "active",
    });
    await tx.insert(appVersions).values({
      id: versionId,
      appId,
      version: input.version.trim(),
      htmlStorageKey: stored.key,
      checksum: packageData.checksum,
      contentSize: packageData.size,
      releaseNotes: input.releaseNotes?.trim() || null,
    });
  });

  return getStoreApp(appId);
}

export async function publishVersion(input: {
  publisherId: number;
  appId: string;
  version: string;
  releaseNotes?: string;
  htmlBase64: string;
}) {
  const app = await ownedApp(input.appId, input.publisherId);
  if (app.status !== "active") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only active listings can receive a new version.",
    });
  }

  const db = await database();
  const existing = await db
    .select({ id: appVersions.id })
    .from(appVersions)
    .where(
      and(
        eq(appVersions.appId, app.id),
        eq(appVersions.version, input.version.trim())
      )
    )
    .limit(1);
  if (existing.length > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This version already exists for the app.",
    });
  }

  const packageData = decodeAndValidateHtml(input.htmlBase64);
  const versionId = createVersionId();
  const stored = await storagePut(
    makeHtmlStorageKey(app.id, versionId),
    packageData.bytes,
    "text/html; charset=utf-8"
  );
  await db.transaction(async tx => {
    await tx.insert(appVersions).values({
      id: versionId,
      appId: app.id,
      version: input.version.trim(),
      htmlStorageKey: stored.key,
      checksum: packageData.checksum,
      contentSize: packageData.size,
      releaseNotes: input.releaseNotes?.trim() || null,
    });
    await tx
      .update(apps)
      .set({ currentVersionId: versionId })
      .where(eq(apps.id, app.id));
  });
  return listPublisherApps(input.publisherId);
}

export async function setAppStatus(
  publisherId: number,
  appId: string,
  status: AppStatus
) {
  await ownedApp(appId, publisherId);
  const db = await database();
  await db.update(apps).set({ status }).where(eq(apps.id, appId));
  return listPublisherApps(publisherId);
}

export async function homeSnapshot(userId: number) {
  const db = await database();
  const [preferences] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const rows = await db
    .select({
      installation: appInstallations,
      listing: apps,
      installedVersion: appVersions,
    })
    .from(appInstallations)
    .innerJoin(apps, eq(appInstallations.appId, apps.id))
    .innerJoin(
      appVersions,
      eq(appInstallations.installedVersionId, appVersions.id)
    )
    .where(eq(appInstallations.userId, userId));

  const visible = rows.filter(row => row.listing.status !== "deleted");
  const current = await currentVersions(visible.map(row => row.listing));
  return {
    wallpaper: preferences?.wallpaper ?? "aurora",
    apps: visible.map(row => ({
      ...listingView(
        row.listing,
        current.get(row.listing.currentVersionId ?? ""),
        row.installation.installedVersionId
      ),
      installedVersion: {
        id: row.installedVersion.id,
        version: row.installedVersion.version,
      },
      canUpdate:
        row.listing.status === "active" &&
        row.installation.installedVersionId !== row.listing.currentVersionId,
    })),
  };
}

export async function setWallpaper(userId: number, wallpaper: WallpaperId) {
  const db = await database();
  await db
    .insert(userPreferences)
    .values({ id: createAppId(), userId, wallpaper })
    .onDuplicateKeyUpdate({
      set: { wallpaper },
    });
  return homeSnapshot(userId);
}

export async function installApp(userId: number, appId: string) {
  const db = await database();
  const [listing] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.status, "active")))
    .limit(1);
  if (!listing?.currentVersionId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This Play Store listing is unavailable.",
    });
  }
  const [existing] = await db
    .select({ id: appInstallations.id })
    .from(appInstallations)
    .where(
      and(
        eq(appInstallations.userId, userId),
        eq(appInstallations.appId, appId)
      )
    )
    .limit(1);
  if (!existing) {
    await db.insert(appInstallations).values({
      id: createAppId(),
      userId,
      appId,
      installedVersionId: listing.currentVersionId,
    });
  }
  return homeSnapshot(userId);
}

export async function applyUpdate(userId: number, appId: string) {
  const db = await database();
  const [listing] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.status, "active")))
    .limit(1);
  if (!listing?.currentVersionId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "There is no update available for this app.",
    });
  }
  const result = await db
    .update(appInstallations)
    .set({ installedVersionId: listing.currentVersionId })
    .where(
      and(
        eq(appInstallations.userId, userId),
        eq(appInstallations.appId, appId)
      )
    );
  if (result[0].affectedRows === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Install the app before applying updates.",
    });
  }
  return homeSnapshot(userId);
}

export async function uninstallApp(userId: number, appId: string) {
  const db = await database();
  await db
    .delete(appInstallations)
    .where(
      and(
        eq(appInstallations.userId, userId),
        eq(appInstallations.appId, appId)
      )
    );
  return homeSnapshot(userId);
}

export async function launchInstalledApp(userId: number, appId: string) {
  const db = await database();
  const [row] = await db
    .select({
      installation: appInstallations,
      listing: apps,
      version: appVersions,
    })
    .from(appInstallations)
    .innerJoin(apps, eq(appInstallations.appId, apps.id))
    .innerJoin(
      appVersions,
      eq(appInstallations.installedVersionId, appVersions.id)
    )
    .where(
      and(
        eq(appInstallations.userId, userId),
        eq(appInstallations.appId, appId)
      )
    )
    .limit(1);
  if (!row || row.listing.status === "deleted") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This app is not installed or is no longer available.",
    });
  }
  const stored = await storageGet(row.version.htmlStorageKey);
  return {
    appId: row.listing.id,
    name: row.listing.name,
    version: row.version.version,
    htmlUrl: stored.url,
  };
}
