import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeUserNotifications } from "./realtime";

describe("subscribeUserNotifications", () => {
  it("uses a distinct channel per subscriber and registers callbacks before subscribing", () => {
    const topics: string[] = [];
    const on = vi.fn();
    const subscribe = vi.fn();
    const client = {
      channel: vi.fn((topic: string) => {
        topics.push(topic);
        let subscribed = false;
        const channel: any = {
          on: (...args: unknown[]) => {
            if (subscribed) throw new Error("callback registered after subscribe");
            on(...args);
            return channel;
          },
          subscribe: () => {
            subscribed = true;
            subscribe();
            return channel;
          },
        };
        return channel;
      }),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as SupabaseClient;

    const stopHeader = subscribeUserNotifications(client, "user-123", vi.fn());
    const stopPage = subscribeUserNotifications(client, "user-123", vi.fn());

    expect(topics).toHaveLength(2);
    expect(new Set(topics).size).toBe(2);
    expect(topics.every((topic) => topic.startsWith("user-notifications:user-123:"))).toBe(true);
    expect(on).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledTimes(2);

    stopHeader();
    stopPage();
    expect(client.removeChannel).toHaveBeenCalledTimes(2);
  });
});
