import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackBrevoEvent } from "./email";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("BREVO_API_KEY", "test-secret-api-key");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("trackBrevoEvent", () => {
  it("sends the Brevo event schema with email_id, ISO event_date, and only simple properties", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(trackBrevoEvent("vendeo_signup", "alice@example.com", {
      full_name: "Alice",
      account_age: 2,
      verified: false,
      nested: { role: "seller" },
      list: ["one"],
      nothing: null,
      "invalid key": "ignored",
    })).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/events");
    const payload = JSON.parse(String(request.body));
    expect(payload.identifiers).toEqual({ email_id: "alice@example.com" });
    expect(payload.identifiers).not.toHaveProperty("email");
    expect(payload.event_name).toBe("vendeo_signup");
    expect(new Date(payload.event_date).toISOString()).toBe(payload.event_date);
    expect(payload.event_properties).toEqual({ full_name: "Alice", account_age: 2, verified: false });
  });

  it("logs a rejected response body with status while masking email and API key, and resolves false", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      code: "invalid_parameter",
      message: "Bad event for alice@example.com; key test-secret-api-key",
    }), { status: 400, headers: { "Content-Type": "application/json" } }));

    await expect(trackBrevoEvent("vendeo_signup", "alice@example.com")).resolves.toBe(false);

    expect(console.error).toHaveBeenCalledWith("Brevo event rejected with status", 400, {
      email: "a***@example.com",
      body: expect.stringContaining("Bad event for a***@example.com"),
    });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("alice@example.com");
    expect(logged).not.toContain("test-secret-api-key");
  });

  it("rejects invalid event names without calling Brevo", async () => {
    await expect(trackBrevoEvent("bad event name", "alice@example.com")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
