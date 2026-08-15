import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel entrypoint", () => {
  it("keeps the UI static and bundles tRPC into an API function", () => {
    const root = resolve(process.cwd());
    const packagePath = resolve(root, "package.json");
    const rootEntryPath = resolve(root, "server.ts");
    const trpcSourcePath = resolve(root, "server/vercel-trpc.ts");
    const apiDirectoryPath = resolve(root, "api");
    const vercelConfigPath = resolve(root, "vercel.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      main?: string;
      scripts?: { "vercel-build"?: string };
    };
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf8")) as {
      framework?: string | null;
      outputDirectory?: string;
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(manifest.main).toBe("server.ts");
    expect(manifest.scripts?.["vercel-build"]).toContain(
      "--outfile=api/trpc.js",
    );
    expect(existsSync(rootEntryPath)).toBe(true);
    expect(existsSync(trpcSourcePath)).toBe(true);
    expect(existsSync(apiDirectoryPath)).toBe(false);
    expect(readFileSync(trpcSourcePath, "utf8")).toContain(
      "trpcPath",
    );
    expect(vercelConfig.framework).toBeNull();
    expect(vercelConfig.outputDirectory).toBe("public");
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/api/trpc/:trpcPath*",
      destination: "/api/trpc?trpcPath=:trpcPath*",
    });
  });
});
