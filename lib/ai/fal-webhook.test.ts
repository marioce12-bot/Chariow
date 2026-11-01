import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { resetFalWebhookKeyCacheForTests, verifyFalWebhook } from "./fal-webhook";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwk = publicKey.export({ format: "jwk" });
const requestId = "fal-request-test-123";
const userId = "user-test-456";
const body = Buffer.from('{"request_id":"fal-request-test-123","status":"OK"}');

function headersFor(rawBody: Buffer, timestamp = Math.floor(Date.now() / 1000).toString()) {
  const hash = createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from(`${requestId}\n${userId}\n${timestamp}\n${hash}`, "utf8");
  const signature = sign(null, message, privateKey).toString("hex");
  return new Headers({
    "x-fal-webhook-request-id": requestId,
    "x-fal-webhook-user-id": userId,
    "x-fal-webhook-timestamp": timestamp,
    "x-fal-webhook-signature": signature,
  });
}

describe("fal.ai webhook signature verification", () => {
  beforeEach(() => {
    resetFalWebhookKeyCacheForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" },
    })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetFalWebhookKeyCacheForTests();
  });

  it("accepts a valid Ed25519 signature for the exact raw body", async () => {
    expect(await verifyFalWebhook(headersFor(body), body)).toBe(true);
  });

  it("rejects an altered body", async () => {
    expect(await verifyFalWebhook(headersFor(body), Buffer.from(`${body.toString()} `))).toBe(false);
  });

  it("rejects an expired timestamp before fetching keys", async () => {
    const fetchMock = vi.mocked(fetch);
    const stale = (Math.floor(Date.now() / 1000) - 301).toString();
    expect(await verifyFalWebhook(headersFor(body, stale), body)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing headers", async () => {
    expect(await verifyFalWebhook(new Headers(), body)).toBe(false);
  });
});
