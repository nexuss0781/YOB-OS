import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "./localAuth";

describe("first-party password authentication", () => {
  it("stores a salted password hash and verifies only the matching password", async () => {
    const hash = await hashPassword("YobOsAccount2026");

    expect(hash).toMatch(/^scrypt\$[^$]+\$[^$]+$/);
    await expect(verifyPassword("YobOsAccount2026", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("requires a password with sufficient length and character variety", () => {
    expect(validatePassword("short123")).toBeTruthy();
    expect(validatePassword("alllettersbutlong")).toBeTruthy();
    expect(validatePassword("YobOsAccount2026")).toBeNull();
  });
});
