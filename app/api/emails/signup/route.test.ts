import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  upsertBrevoContact: vi.fn(),
  trackBrevoEvent: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/email", () => ({
  upsertBrevoContact: mocks.upsertBrevoContact,
  trackBrevoEvent: mocks.trackBrevoEvent,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: { full_name: "Test User" }, error: null }),
  };
  mocks.createAdminClient.mockReturnValue({ from: () => query });
  mocks.upsertBrevoContact.mockResolvedValue(true);
  mocks.trackBrevoEvent.mockResolvedValue(true);
});

async function postSignup() {
  return POST(new Request("https://vendeo.example/api/emails/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "Test.User@example.com", fullName: "Test User" }),
  }));
}

describe("signup Brevo synchronization", () => {
  it("returns ok and both outcomes when Brevo operations fail independently", async () => {
    mocks.upsertBrevoContact.mockResolvedValue(false);
    mocks.trackBrevoEvent.mockRejectedValue(new Error("Brevo unavailable"));

    const response = await postSignup();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, brevo: { contact: false, event: false } });
    expect(mocks.upsertBrevoContact).toHaveBeenCalledWith("test.user@example.com", {
      FULL_NAME: "Test User",
      CHARIOW_CONNECTED: false,
    });
    expect(mocks.trackBrevoEvent).toHaveBeenCalledWith("vendeo_signup", "test.user@example.com", { full_name: "Test User" });
  });

  it("still tracks the event when contact upsert rejects", async () => {
    mocks.upsertBrevoContact.mockRejectedValue(new Error("Contact API unavailable"));
    mocks.trackBrevoEvent.mockResolvedValue(true);

    const response = await postSignup();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, brevo: { contact: false, event: true } });
    expect(mocks.trackBrevoEvent).toHaveBeenCalledTimes(1);
  });
});
