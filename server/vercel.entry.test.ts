import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel Node entrypoint", () => {
  it("declares the exported Express server as the package entry module", () => {
    const packagePath = resolve(process.cwd(), "package.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      main?: string;
    };

    expect(manifest.main).toBe("server.ts");
  });
});
