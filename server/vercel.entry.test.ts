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
    const trpcArtifactPath = resolve(root, "api/trpc.js");
    const vercelConfigPath = resolve(root, "vercel.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      main?: string;
      scripts?: { "vercel-build"?: string };
      dependencies?: Record<string, string>;
    };
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf8")) as {
      framework?: string | null;
      outputDirectory?: string;
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(manifest.main).toBe("server.ts");
    expect(manifest.dependencies?.["sql.js"]).toBe("1.14.2");
    expect(manifest.scripts?.["vercel-build"]).toContain(
      "--outfile=api/trpc.js",
    );
    expect(manifest.scripts?.["vercel-build"]).toContain(
      "--alias:sql.js=sql.js/dist/sql-asm.js",
    );
    expect(manifest.scripts?.["vercel-build"]).toContain(
      "--external:express",
    );
    expect(manifest.scripts?.["vercel-build"]).toContain(
      "--external:sql.js/dist/sql-asm.js",
    );
    expect(existsSync(rootEntryPath)).toBe(true);
    expect(existsSync(trpcSourcePath)).toBe(true);
    expect(existsSync(apiDirectoryPath)).toBe(true);
    expect(existsSync(trpcArtifactPath)).toBe(true);
    expect(readFileSync(trpcSourcePath, "utf8")).toContain(
      "trpcPath",
    );
    expect(vercelConfig.framework).toBeNull();
    expect(vercelConfig.outputDirectory).toBe("public");
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/api/trpc/:trpcPath*",
      destination: "/api/trpc?trpcPath=:trpcPath*",
    });
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/manus-storage/:storagePath*",
      destination: "/api/trpc?storagePath=:storagePath*",
    });
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
  });
});
