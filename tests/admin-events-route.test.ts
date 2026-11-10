import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/events/route";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

type BroadcastCallback = (payload: unknown) => void;
let broadcastCallback: BroadcastCallback | null = null;
let channel: {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};
let client: {
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
};

function makeClient() {
  broadcastCallback = null;
  channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: BroadcastCallback) => {
      broadcastCallback = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      callback("SUBSCRIBED");
      return channel;
    }),
  };
  client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue("ok"),
  };
  mocks.createAdminClient.mockReturnValue(client);
}

beforeEach(() => {
  vi.clearAllMocks();
  makeClient();
  mocks.requireAdmin.mockResolvedValue({
    admin: { id: "password-admin", role: "super_admin" },
    response: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/events", () => {
  it("requires an admin session and subscribes to a private channel", async () => {
    const response = await GET(new Request("https://vendeo.test/api/admin/events"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(client.channel).toHaveBeenCalledWith("vendeo:admin:invalidate", {
      config: { private: true },
    });
    expect(channel.on).toHaveBeenCalledWith(
      "broadcast",
      { event: "admin_data_changed" },
      expect.any(Function),
    );

    const reader = response.body!.getReader();
    const connected = await reader.read();
    expect(new TextDecoder().decode(connected.value)).toContain(": connected\n\n");
    const ready = await reader.read();
    expect(new TextDecoder().decode(ready.value)).toContain("event: ready\ndata: {}\n\n");

    broadcastCallback?.({ event: "admin_data_changed", payload: { scope: "not-allowed", email: "private@example.test" } });
    broadcastCallback?.({ event: "admin_data_changed", payload: { scope: "billing", email: "private@example.test", amount: 999 } });
    const signal = await reader.read();
    const text = new TextDecoder().decode(signal.value);
    expect(text).toContain('event: admin-data-changed\ndata: {"scope":"billing"}\n\n');
    expect(text).not.toContain("private@example.test");
    expect(text).not.toContain("999");
    await reader.cancel();
  });

  it("does not create a Realtime client without admin authorization", async () => {
    const denied = new Response(JSON.stringify({ error: "Accès administrateur requis" }), { status: 403 });
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: denied });

    const response = await GET(new Request("https://vendeo.test/api/admin/events"));
    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
