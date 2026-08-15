import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const appStatusValues = ["active", "deprecated", "deleted"] as const;
export const wallpaperValues = ["aurora", "glacier", "dusk", "void"] as const;

/** A public Play Store listing owned by one YOB-OS user. */
export const apps = mysqlTable(
  "apps",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    publisherId: int("publisherId")
      .notNull()
      .references(() => users.id),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: varchar("name", { length: 96 }).notNull(),
    description: text("description").notNull(),
    icon: varchar("icon", { length: 32 }).notNull().default("◈"),
    status: mysqlEnum("status", appStatusValues).notNull().default("active"),
    currentVersionId: varchar("currentVersionId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("apps_slug_unique").on(table.slug),
    index("apps_publisher_index").on(table.publisherId),
    index("apps_status_index").on(table.status),
  ]
);

/** Each upload is immutable and points to one S3 object that contains standalone HTML. */
export const appVersions = mysqlTable(
  "app_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    appId: varchar("appId", { length: 36 })
      .notNull()
      .references(() => apps.id),
    version: varchar("version", { length: 32 }).notNull(),
    htmlStorageKey: varchar("htmlStorageKey", { length: 512 }).notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    contentSize: int("contentSize").notNull(),
    releaseNotes: text("releaseNotes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("app_versions_app_version_unique").on(
      table.appId,
      table.version
    ),
    index("app_versions_app_index").on(table.appId),
  ]
);

/** The currently applied app-version pointer for a single user and app. */
export const appInstallations = mysqlTable(
  "app_installations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    appId: varchar("appId", { length: 36 })
      .notNull()
      .references(() => apps.id),
    installedVersionId: varchar("installedVersionId", { length: 36 })
      .notNull()
      .references(() => appVersions.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("installations_user_app_unique").on(table.userId, table.appId),
    index("installations_user_index").on(table.userId),
  ]
);

/** One personal OS preference record per authenticated user. */
export const userPreferences = mysqlTable(
  "user_preferences",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    wallpaper: mysqlEnum("wallpaper", wallpaperValues)
      .notNull()
      .default("aurora"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("preferences_user_unique").on(table.userId)]
);

export type App = typeof apps.$inferSelect;
export type AppVersion = typeof appVersions.$inferSelect;
export type AppInstallation = typeof appInstallations.$inferSelect;
export type UserPreference = typeof userPreferences.$inferSelect;
