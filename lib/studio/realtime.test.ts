// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { watchStudioGeneration } from "./realtime";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: mocks.createClient }));

let channel: any;
let client: any;
let rowChange: (() => void) | null;

function makeClient() {
  rowChange = null;
  channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: () => void) => {
      rowChange = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      callback("SUBSCRIBED");
      return channel;
    }),
  };
  client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
  };
  mocks.createClient.mockReturnValue(client);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("watchStudioGeneration", () => {
  it("rejoint un channel privé et réconcilie après l’abonnement et un changement simulé", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    makeClient();
    const onChange = vi.fn();

    const stop = watchStudioGeneration({
      filter: "user_id=eq.user-123",
      onChange,
    });

    expect(client.channel).toHaveBeenCalledWith(
      "studio-generation:user_id=eq.user-123",
      { config: { private: true } },
    );
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ event: "UPDATE", table: "studio_generations", filter: "user_id=eq.user-123" }),
      expect.any(Function),
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(onChange).toHaveBeenCalledTimes(1);

    rowChange?.();
    await vi.advanceTimersByTimeAsync(200);
    expect(onChange).toHaveBeenCalledTimes(2);

    stop();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
