import { describe, expect, it } from "vitest";
import { shouldShowExpiredChariowNotice } from "./ChariowStatusNotice";

describe("ChariowStatusNotice", () => {
  it("does not show an expired notice when a Chariow store is connected", () => {
    expect(shouldShowExpiredChariowNotice([
      { id: "store-1", platform: "chariow", connection_status: "connected" },
    ])).toBe(false);
  });

  it("does not show an expired notice when another Chariow store remains connected", () => {
    expect(shouldShowExpiredChariowNotice([
      { id: "store-1", platform: "chariow", connection_status: "expired" },
      { id: "store-2", platform: "chariow", connection_status: "connected" },
    ])).toBe(false);
  });

  it("shows an expired notice when the account has Chariow stores but none is connected", () => {
    expect(shouldShowExpiredChariowNotice([
      { id: "store-1", platform: "chariow", connection_status: "expired" },
    ])).toBe(true);
  });

  it("does not show a stale Chariow notice when no Chariow store exists", () => {
    expect(shouldShowExpiredChariowNotice([
      { id: "store-1", platform: "shopify", connection_status: "connected" },
    ])).toBe(false);
  });
});
