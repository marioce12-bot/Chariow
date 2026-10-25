import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetaGraphError, fetchMetaGraph, isMetaAuthenticationError, META_GRAPH_TIMEOUT_MS } from "./graph";

afterEach(() => vi.unstubAllGlobals());

describe("Meta Graph request safety", () => {
  it("classifies explicit invalid-token errors without treating permission failures as auth", () => {
    const invalidToken = createMetaGraphError({ code: 190, message: "Invalid OAuth access token." }, 400, "fallback");
    const oauthSession = createMetaGraphError({ code: 102, type: "OAuthException", message: "Session expired." }, 400, "fallback");
    const permission = createMetaGraphError({ code: 200, type: "OAuthException", message: "Permission denied." }, 403, "fallback");
    const httpError = createMetaGraphError({}, 503, "Temporary Graph failure");

    expect(isMetaAuthenticationError(invalidToken)).toBe(true);
    expect(isMetaAuthenticationError(oauthSession)).toBe(true);
    expect(isMetaAuthenticationError(permission)).toBe(false);
    expect(isMetaAuthenticationError(httpError)).toBe(false);
    expect(httpError.message).toBe("Temporary Graph failure");
  });

  it("applies a bounded timeout and preserves the request method", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await fetchMetaGraph("https://graph.facebook.com/v23.0/test", { method: "POST", body: "x=1" });

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(META_GRAPH_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(META_GRAPH_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
