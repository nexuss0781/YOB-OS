import { describe, expect, it } from "vitest";

describe("Vercel access token", () => {
  it("authenticates against the Vercel user endpoint", async () => {
    const token = process.env.VERCEL_TOKEN;
    expect(token, "VERCEL_TOKEN must be configured").toBeTruthy();

    const response = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${token!}` },
    });

    expect(response.status, "Vercel access token must be accepted").toBe(200);
  }, 20_000);
});
