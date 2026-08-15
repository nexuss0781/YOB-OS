import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import * as db from "./db";
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from "./localAuth";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { yobRouter } from "./routers/yob";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(80),
          email: z.string().trim().email().max(320),
          password: z.string().min(1).max(256),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const passwordIssue = validatePassword(input.password);
        if (passwordIssue) {
          throw new TRPCError({ code: "BAD_REQUEST", message: passwordIssue });
        }
        const email = normalizeEmail(input.email);
        try {
          const user = await db.createLocalUser({
            name: input.name.trim(),
            email,
            passwordHash: await hashPassword(input.password),
          });
          const sessionToken = await sdk.createSessionToken(user.openId, {
            name: user.name || email,
          });
          ctx.res.cookie(COOKIE_NAME, sessionToken, {
            ...getSessionCookieOptions(ctx.req),
            maxAge: 1000 * 60 * 60 * 24 * 365,
          });
          return user;
        } catch (error) {
          if (error instanceof Error && error.message === "EMAIL_IN_USE") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "An account already exists for this email.",
            });
          }
          throw error;
        }
      }),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email().max(320),
          password: z.string().min(1).max(256),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const account = await db.getLocalUserCredentials(
          normalizeEmail(input.email)
        );
        if (
          !account ||
          !(await verifyPassword(input.password, account.passwordHash))
        ) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Email or password is incorrect.",
          });
        }
        await db.recordLocalSignIn(account.user.openId);
        const sessionToken = await sdk.createSessionToken(account.user.openId, {
          name: account.user.name || account.user.email || "YOB user",
        });
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: 1000 * 60 * 60 * 24 * 365,
        });
        return account.user;
      }),
    mobileRegister: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(80),
          email: z.string().trim().email().max(320),
          password: z.string().min(1).max(256),
        })
      )
      .mutation(async ({ input }) => {
        const passwordIssue = validatePassword(input.password);
        if (passwordIssue) {
          throw new TRPCError({ code: "BAD_REQUEST", message: passwordIssue });
        }
        const email = normalizeEmail(input.email);
        try {
          const user = await db.createLocalUser({
            name: input.name.trim(),
            email,
            passwordHash: await hashPassword(input.password),
          });
          return {
            user,
            sessionToken: await sdk.createSessionToken(user.openId, {
              name: user.name || email,
            }),
          };
        } catch (error) {
          if (error instanceof Error && error.message === "EMAIL_IN_USE") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "An account already exists for this email.",
            });
          }
          throw error;
        }
      }),
    mobileLogin: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email().max(320),
          password: z.string().min(1).max(256),
        })
      )
      .mutation(async ({ input }) => {
        const account = await db.getLocalUserCredentials(
          normalizeEmail(input.email)
        );
        if (
          !account ||
          !(await verifyPassword(input.password, account.passwordHash))
        ) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Email or password is incorrect.",
          });
        }
        await db.recordLocalSignIn(account.user.openId);
        return {
          user: account.user,
          sessionToken: await sdk.createSessionToken(account.user.openId, {
            name: account.user.name || account.user.email || "YOB user",
          }),
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  yob: yobRouter,
});

export type AppRouter = typeof appRouter;
