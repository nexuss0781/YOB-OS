import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel entrypoint", () => {
  it("exports the Express app from the supported root entry", () => {
    const root = resolve(process.cwd());
    const packagePath = resolve(root, "package.json");
    const rootEntryPath = resolve(root, "server.ts");
    const apiDirectoryPath = resolve(root, "api");
    const vercelConfigPath = resolve(root, "vercel.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      main?: string;
    };
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf8")) as {
      framework?: string | null;
      outputDirectory?: string;
    };

    expect(manifest.main).toBeUndefined();
    expect(existsSync(rootEntryPath)).toBe(true);
    expect(readFileSync(rootEntryPath, "utf8")).toContain(
      "export default createApp();",
    );
    expect(existsSync(apiDirectoryPath)).toBe(false);
    expect(vercelConfig.framework).toBeUndefined();
    expect(vercelConfig.outputDirectory).toBeUndefined();
  });
});
