import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getUserByOpenId, upsertUser } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { withParadox } from "./paradox";

const hasDatabase = Boolean(
  process.env.PARADOX_API_KEY && process.env.PARADOX_PASSPHRASE
);
const runLiveValidation = process.env.PARADOX_LIVE_TESTS === "true";
const testOpenId = `yob-e2e-${randomUUID()}`;
let appId: string | undefined;
let userId: number | undefined;

function createContext(): TrpcContext {
  if (!userId) throw new Error("E2E test user has not been initialized");
  const now = new Date();
  return {
    user: {
      id: userId,
      openId: testOpenId,
      name: "YOB E2E Test",
      email: null,
      loginMethod: "test",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe.skipIf(!runLiveValidation || !hasDatabase)(
  "YOB-OS cloud lifecycle integration",
  () => {
    beforeAll(async () => {
      await upsertUser({
        openId: testOpenId,
        name: "YOB E2E Test",
        email: null,
        loginMethod: "test",
        lastSignedIn: new Date(),
      });
      const user = await getUserByOpenId(testOpenId);
      if (!user) throw new Error("Could not create E2E test user");
      userId = user.id;
    }, 30_000);

    afterAll(async () => {
      await withParadox(
        db => {
          if (appId) {
            db.execute("DELETE FROM app_installations WHERE app_id = ?", [
              appId,
            ]);
            db.execute("DELETE FROM app_versions WHERE app_id = ?", [appId]);
            db.execute("DELETE FROM apps WHERE id = ?", [appId]);
          }
          if (userId) {
            db.execute("DELETE FROM user_preferences WHERE user_id = ?", [
              userId,
            ]);
            db.execute("DELETE FROM users WHERE id = ? AND open_id = ?", [
              userId,
              testOpenId,
            ]);
          }
        },
        { write: true }
      );
    }, 30_000);

    it("publishes an S3-backed HTML app and synchronizes the full install/update lifecycle", async () => {
      const caller = appRouter.createCaller(createContext());
      const secondClientSession = appRouter.createCaller(createContext());
      const v1Html =
        "<!doctype html><html><head><title>YOB E2E</title></head><body><h1>Version one</h1></body></html>";
      const v2Html =
        "<!doctype html><html><head><title>YOB E2E</title></head><body><h1>Version two</h1></body></html>";

      const published = await caller.yob.publisher.create({
        name: `YOB Integration ${testOpenId.slice(-8)}`,
        description:
          "Ephemeral package used only to validate the YOB-OS cloud lifecycle.",
        icon: "◈",
        version: "1.0.0",
        releaseNotes: "Initial test release.",
        htmlBase64: Buffer.from(v1Html).toString("base64"),
      });
      appId = published.id;
      expect(published.currentVersion?.version).toBe("1.0.0");

      const initialHome = await caller.yob.store.install({ appId });
      expect(initialHome.apps).toHaveLength(1);
      expect(initialHome.apps[0]?.installedVersion.version).toBe("1.0.0");
      const secondClientAfterInstall =
        await secondClientSession.yob.home.snapshot();
      expect(secondClientAfterInstall.apps[0]?.installedVersion.version).toBe(
        "1.0.0"
      );

      const launchV1 = await caller.yob.home.launch({ appId });
      expect(launchV1.htmlUrl).toContain("/manus-storage/yob-os/apps/");
      expect(launchV1.version).toBe("1.0.0");

      await caller.yob.publisher.publishVersion({
        appId,
        version: "1.0.1",
        releaseNotes: "Integration test update.",
        htmlBase64: Buffer.from(v2Html).toString("base64"),
      });
      const beforeUpdate = await caller.yob.home.snapshot();
      expect(beforeUpdate.apps[0]?.canUpdate).toBe(true);
      const secondClientBeforeUpdate =
        await secondClientSession.yob.home.snapshot();
      expect(secondClientBeforeUpdate.apps[0]?.canUpdate).toBe(true);

      const updatedHome = await caller.yob.home.update({ appId });
      expect(updatedHome.apps[0]?.installedVersion.version).toBe("1.0.1");
      expect(updatedHome.apps[0]?.canUpdate).toBe(false);
      const secondClientAfterUpdate =
        await secondClientSession.yob.home.snapshot();
      expect(secondClientAfterUpdate.apps[0]?.installedVersion.version).toBe(
        "1.0.1"
      );

      const glacierHome = await caller.yob.home.setWallpaper({
        wallpaper: "glacier",
      });
      expect(glacierHome.wallpaper).toBe("glacier");
      const secondClientAfterWallpaperChange =
        await secondClientSession.yob.home.snapshot();
      expect(secondClientAfterWallpaperChange.wallpaper).toBe("glacier");

      const removedHome = await caller.yob.home.uninstall({ appId });
      expect(removedHome.apps).toHaveLength(0);

      const listings = await caller.yob.publisher.setStatus({
        appId,
        status: "deprecated",
      });
      expect(listings.find(listing => listing.id === appId)?.status).toBe(
        "deprecated"
      );
      await expect(caller.yob.store.get({ appId })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }, 180_000);
  }
);
