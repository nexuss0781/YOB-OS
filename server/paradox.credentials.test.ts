import { describe, expect, it } from "vitest";

const resolverUrl = "https://paradox-domain.onrender.com/active-domain.json";
const runLiveValidation = process.env.PARADOX_LIVE_TESTS === "true";

async function resolveGatewayUrl() {
  if (process.env.PARADOX_GATEWAY_URL) {
    return process.env.PARADOX_GATEWAY_URL.replace(/\/+$/, "");
  }

  const response = await fetch(resolverUrl);
  expect(response.status, "Paradox gateway resolver must succeed").toBe(200);
  const payload = (await response.json()) as { gatewayUrl?: string };
  expect(
    payload.gatewayUrl,
    "Paradox resolver must return a gateway URL"
  ).toBeTruthy();
  return `${payload.gatewayUrl!.replace(/\/+$/, "")}/v1`;
}

describe.skipIf(!runLiveValidation)(
  "Paradox default gateway credentials",
  () => {
    it("accepts the generated API key", async () => {
      const gatewayUrl = await resolveGatewayUrl();
      const apiKey = process.env.PARADOX_API_KEY;
      const passphrase = process.env.PARADOX_PASSPHRASE;

      expect(apiKey, "PARADOX_API_KEY must be configured").toBeTruthy();
      expect(passphrase, "PARADOX_PASSPHRASE must be configured").toBeTruthy();

      const response = await fetch(`${gatewayUrl}/auth/me`, {
        headers: { "X-API-Key": apiKey! },
      });

      expect(response.status, "Paradox gateway token must be accepted").toBe(
        200
      );
    }, 20_000);
  }
);
