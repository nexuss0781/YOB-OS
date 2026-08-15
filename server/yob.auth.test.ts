import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("YOB-OS protected lifecycle procedures", () => {
  it("requires authentication before reading a personal home snapshot", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.yob.home.snapshot()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("requires authentication before publishing an HTML application", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(
      caller.yob.publisher.create({
        name: "Orbit",
        description: "A focused HTML application for test coverage.",
        icon: "◈",
        version: "1.0.0",
        htmlBase64: Buffer.from(
          "<!doctype html><html><body>Orbit</body></html>"
        ).toString("base64"),
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires authentication before installing, updating, or uninstalling", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    const appId = "00000000-0000-0000-0000-000000000000";

    await expect(caller.yob.store.install({ appId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.yob.home.update({ appId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.yob.home.uninstall({ appId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
