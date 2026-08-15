import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  applyUpdate,
  getStoreApp,
  homeSnapshot,
  installApp,
  launchInstalledApp,
  listPublisherApps,
  listStoreApps,
  publishApp,
  publishVersion,
  setAppStatus,
  setAppOrder,
  setWallpaper,
  setWallpaperPhoto,
  uninstallApp,
} from "../yobStore";
import { APP_STATUSES, WALLPAPERS } from "../../shared/yob";

const appIdInput = z.object({ appId: z.string().uuid() });
const htmlAppInput = z.object({
  htmlBase64: z.string().min(16),
  version: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^v?\d+(?:\.\d+){0,2}(?:[-+][a-zA-Z0-9.-]+)?$/),
  releaseNotes: z.string().trim().max(2_000).optional(),
});

export const yobRouter = router({
  store: router({
    list: publicProcedure
      .input(
        z.object({ search: z.string().trim().max(80).optional() }).optional()
      )
      .query(({ input }) => listStoreApps(input?.search)),
    get: publicProcedure
      .input(appIdInput)
      .query(({ input }) => getStoreApp(input.appId)),
    install: protectedProcedure
      .input(appIdInput)
      .mutation(({ ctx, input }) => installApp(ctx.user.id, input.appId)),
  }),
  home: router({
    snapshot: protectedProcedure.query(({ ctx }) => homeSnapshot(ctx.user.id)),
    setWallpaper: protectedProcedure
      .input(z.object({ wallpaper: z.enum(WALLPAPERS) }))
      .mutation(({ ctx, input }) => setWallpaper(ctx.user.id, input.wallpaper)),
    setWallpaperPhoto: protectedProcedure
      .input(
        z.object({
          base64: z.string().min(16).max(7_000_000),
          mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        })
      )
      .mutation(({ ctx, input }) =>
        setWallpaperPhoto({ userId: ctx.user.id, ...input })
      ),
    setAppOrder: protectedProcedure
      .input(z.object({ appIds: z.array(z.string().uuid()).max(500) }))
      .mutation(({ ctx, input }) => setAppOrder(ctx.user.id, input.appIds)),
    update: protectedProcedure
      .input(appIdInput)
      .mutation(({ ctx, input }) => applyUpdate(ctx.user.id, input.appId)),
    uninstall: protectedProcedure
      .input(appIdInput)
      .mutation(({ ctx, input }) => uninstallApp(ctx.user.id, input.appId)),
    launch: protectedProcedure
      .input(appIdInput)
      .query(({ ctx, input }) => launchInstalledApp(ctx.user.id, input.appId)),
  }),
  publisher: router({
    list: protectedProcedure.query(({ ctx }) => listPublisherApps(ctx.user.id)),
    create: protectedProcedure
      .input(
        htmlAppInput.extend({
          name: z.string().trim().min(2).max(96),
          description: z.string().trim().min(8).max(2_000),
          icon: z.string().trim().min(1).max(32),
        })
      )
      .mutation(({ ctx, input }) =>
        publishApp({ publisherId: ctx.user.id, ...input })
      ),
    publishVersion: protectedProcedure
      .input(appIdInput.merge(htmlAppInput))
      .mutation(({ ctx, input }) =>
        publishVersion({ publisherId: ctx.user.id, ...input })
      ),
    setStatus: protectedProcedure
      .input(appIdInput.extend({ status: z.enum(APP_STATUSES) }))
      .mutation(({ ctx, input }) =>
        setAppStatus(ctx.user.id, input.appId, input.status)
      ),
  }),
});
