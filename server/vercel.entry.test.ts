import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel entrypoint", () => {
  it("keeps the Node handler under API routes instead of the static root", () => {
    const root = resolve(process.cwd());
    const packagePath = resolve(root, "package.json");
    const apiEntryPath = resolve(root, "api/index.ts");
    const apiCatchAllPath = resolve(root, "api/[...path].ts");
    const rootEntryPath = resolve(root, "server.ts");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      main?: string;
    };

    expect(manifest.main).toBeUndefined();
    expect(existsSync(rootEntryPath)).toBe(false);
    expect(readFileSync(apiEntryPath, "utf8")).toContain(
      "export default createApp();",
    );
    expect(readFileSync(apiCatchAllPath, "utf8")).toContain(
      "export default createApp();",
    );
  });
});
