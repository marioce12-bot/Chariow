import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeChariowSales } from "./useChariowSalesRealtime";

describe("subscribeChariowSales", () => {
  it("rejoint un channel privé et n’accepte qu’un événement du magasin et de l’utilisateur attendus", () => {
    const channel: any = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as SupabaseClient;
    const onSale = vi.fn();

    const stop = subscribeChariowSales(client, "store-123", "user-456", onSale);

    expect(client.channel).toHaveBeenCalledWith("sales-events:store-123", {
      config: { private: true },
    });
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ event: "INSERT", table: "sales_events", filter: "store_id=eq.store-123" }),
      expect.any(Function),
    );
    const callback = channel.on.mock.calls[0][2] as (payload: { new: Record<string, unknown> }) => void;
    callback({ new: { store_id: "store-123", user_id: "user-456", event_id: "sale-1" } });
    callback({ new: { store_id: "store-123", user_id: "other-user", event_id: "sale-2" } });
    callback({ new: { store_id: "store-123", user_id: "user-456", event_id: "sale-1" } });
    expect(onSale).toHaveBeenCalledTimes(1);

    stop();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
