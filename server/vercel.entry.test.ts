import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel entrypoint", () => {
  it("exports the Express app and keeps static output explicit", () => {
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
      rewrites?: unknown[];
    };

    expect(manifest.main).toBe("server.ts");
    expect(existsSync(rootEntryPath)).toBe(true);
    expect(existsSync(apiDirectoryPath)).toBe(false);
    expect(readFileSync(rootEntryPath, "utf8")).toContain(
      "export default createApp();",
    );
    expect(vercelConfig.framework).toBeNull();
    expect(vercelConfig.outputDirectory).toBe("public");
    expect(vercelConfig.rewrites).toBeUndefined();
  });
});
