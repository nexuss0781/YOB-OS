import { describe, expect, it } from "vitest";
import { createApp } from "./app";

type ExpressLayer = {
  regexp?: RegExp;
  route?: { path?: string };
};

describe("createApp", () => {
  it("registers the dynamic routes required by the cloud client", () => {
    const app = createApp();
    const stack = (app as unknown as { _router: { stack: ExpressLayer[] } })
      ._router.stack;
    const routePaths = stack
      .map(layer => layer.route?.path)
      .filter((path): path is string => Boolean(path));
    const middlewarePatterns = stack.map(layer => String(layer.regexp));

    expect(routePaths).toEqual(
      expect.arrayContaining([
        "/api/oauth/callback",
        "/api/native-auth/start",
        "/api/native-auth/callback",
        "/manus-storage/*",
      ])
    );
    expect(
      middlewarePatterns.some(pattern => pattern.includes("api\\/trpc"))
    ).toBe(true);
  });
});
