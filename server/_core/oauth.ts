import { randomUUID } from "node:crypto";
import {
  COOKIE_NAME,
  ONE_YEAR_MS,
  OAUTH_STATE_COOKIE,
  decodeOAuthState,
  encodeOAuthState,
} from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

const NATIVE_REDIRECT_COOKIE = "yob_native_redirect";
const NATIVE_REDIRECT_SCHEME = "yobos://oauth";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/native-auth/start", (req: Request, res: Response) => {
    const requestedRedirect = getQueryParam(req, "redirect");
    if (
      requestedRedirect !== NATIVE_REDIRECT_SCHEME ||
      !ENV.oAuthPortalUrl ||
      !ENV.appId
    ) {
      res.status(400).json({ error: "invalid native authentication request" });
      return;
    }

    const protocol =
      (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ||
      req.protocol;
    const callbackUrl = `${protocol}://${req.get("host")}/api/native-auth/callback`;
    const nonce = randomUUID();
    const state = encodeOAuthState({ redirectUri: callbackUrl, nonce });
    res.cookie(OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      path: "/",
      maxAge: 10 * 60 * 1000,
      sameSite: "none",
      secure: true,
    });
    res.cookie(NATIVE_REDIRECT_COOKIE, NATIVE_REDIRECT_SCHEME, {
      httpOnly: true,
      path: "/",
      maxAge: 10 * 60 * 1000,
      sameSite: "none",
      secure: true,
    });

    const authorizeUrl = new URL(
      "app-auth",
      `${ENV.oAuthPortalUrl.replace(/\/+$/, "")}/`
    );
    authorizeUrl.searchParams.set("appId", ENV.appId);
    authorizeUrl.searchParams.set("redirectUri", callbackUrl);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("type", "signIn");
    res.redirect(302, authorizeUrl.toString());
  });

  app.get("/api/native-auth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const redirectTarget = cookies[NATIVE_REDIRECT_COOKIE];
    const { nonce } = state ? decodeOAuthState(state) : {};
    if (
      !code ||
      !state ||
      !nonce ||
      nonce !== cookies[OAUTH_STATE_COOKIE] ||
      redirectTarget !== NATIVE_REDIRECT_SCHEME
    ) {
      res.status(403).json({ error: "invalid native oauth state" });
      return;
    }

    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: "/",
      secure: true,
      sameSite: "none",
    });
    res.clearCookie(NATIVE_REDIRECT_COOKIE, {
      path: "/",
      secure: true,
      sameSite: "none",
    });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const appRedirect = new URL(NATIVE_REDIRECT_SCHEME);
      appRedirect.searchParams.set("session", sessionToken);
      res.redirect(302, appRedirect.toString());
    } catch (error) {
      console.error("[OAuth] Native callback failed", error);
      res.status(500).json({ error: "native OAuth callback failed" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[
      OAUTH_STATE_COOKIE
    ];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: "/",
      secure: true,
      sameSite: "none",
    });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
