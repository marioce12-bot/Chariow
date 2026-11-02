import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyChariowSignature } from "./attribution-server";

const fixtureSecret = "local-test-fixture-not-a-live-secret";
const body = JSON.stringify({ id: "event-fixture", type: "successful.sale" });
const signature = crypto.createHmac("sha256", fixtureSecret).update(body).digest("hex");

describe("Chariow webhook HMAC", () => {
  it("accepts a valid raw or sha256-prefixed signature", () => {
    expect(verifyChariowSignature(body, signature, fixtureSecret)).toBe(true);
    expect(verifyChariowSignature(body, `sha256=${signature}`, fixtureSecret)).toBe(true);
  });
  it("rejects missing credentials or a modified body", () => {
    expect(verifyChariowSignature(body, null, fixtureSecret)).toBe(false);
    expect(verifyChariowSignature(body, signature, undefined)).toBe(false);
    expect(verifyChariowSignature(`${body} `, signature, fixtureSecret)).toBe(false);
  });
  it.each(["", "invalid", "g".repeat(64), "é".repeat(64), "😀".repeat(32)])("rejects malformed headers without throwing", value => {
    expect(() => verifyChariowSignature(body, value, fixtureSecret)).not.toThrow();
    expect(verifyChariowSignature(body, value, fixtureSecret)).toBe(false);
  });
});
