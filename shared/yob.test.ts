import { describe, expect, it } from "vitest";
import { MAX_HTML_APP_BYTES, decodeAndValidateHtml, makeAppSlug } from "./yob";

function encodeHtml(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

describe("HTML application package validation", () => {
  it("accepts a complete standalone HTML document and produces a stable checksum", () => {
    const html =
      "<!doctype html><html><head><title>Orbit</title></head><body><main>Ready</main></body></html>";
    const result = decodeAndValidateHtml(encodeHtml(html));

    expect(result.size).toBe(Buffer.byteLength(html));
    expect(result.checksum).toHaveLength(64);
    expect(result.bytes.toString("utf8")).toBe(html);
  });

  it("rejects documents that can alter their own base URL or auto-redirect", () => {
    expect(() =>
      decodeAndValidateHtml(
        encodeHtml(
          "<!doctype html><html><head><base href='https://unsafe.example'></head></html>"
        )
      )
    ).toThrow("base element");
    expect(() =>
      decodeAndValidateHtml(
        encodeHtml(
          "<!doctype html><html><head><meta http-equiv='refresh' content='0'></head></html>"
        )
      )
    ).toThrow("automatic page refresh");
  });

  it("rejects malformed and oversized packages", () => {
    expect(() =>
      decodeAndValidateHtml(encodeHtml("<main>not a document</main>"))
    ).toThrow("complete standalone HTML");
    expect(() => decodeAndValidateHtml("not-base64-!")).toThrow("Base64");
    const largeHtml = `<!doctype html><html><body>${"x".repeat(MAX_HTML_APP_BYTES)}</body></html>`;
    expect(() => decodeAndValidateHtml(encodeHtml(largeHtml))).toThrow("1 MiB");
  });

  it("generates readable, collision-resistant listing slugs", () => {
    const first = makeAppSlug("  Orbit Runner!  ");
    const second = makeAppSlug("  Orbit Runner!  ");

    expect(first).toMatch(/^orbit-runner-[a-f0-9]{8}$/);
    expect(second).toMatch(/^orbit-runner-[a-f0-9]{8}$/);
    expect(first).not.toBe(second);
  });
});
