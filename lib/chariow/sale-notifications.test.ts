import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as any[], profile: null as any, push: vi.fn(), insertError: null as any, calls: [] as any[] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => ({
  select: (fields: string) => {
    const filters: [string, unknown][] = [];
    const query: any = { eq: (key: string, value: unknown) => { filters.push([key, value]); return query; }, maybeSingle: async () => {
      state.calls.push(["select", table, fields, ...filters]);
      if (table === "profiles") return { data: state.profile, error: null };
      return { data: state.rows.find((r) => filters.every(([k, v]) => k === "user_id" ? r.user_id === v : k === "dedupe_key" ? r.dedupe_key === v : true)) ?? null, error: null };
    } };
    return query;
  },
  insert: (values: any) => ({ select: () => ({ maybeSingle: async () => {
    state.calls.push(["insert", values]);
    if (state.insertError) return { data: null, error: state.insertError };
    if (state.rows.some((row) => row.dedupe_key === values.dedupe_key && row.user_id === values.user_id)) return { data: null, error: { code: "23505" } };
    const row = { id: `n${state.rows.length + 1}`, ...values };
    state.rows.push(row);
    return { data: { id: row.id }, error: null };
  } }) }),
  update: (values: any) => {
    const filters: [string, unknown][] = [];
    const query: any = { eq: (key: string, value: unknown) => { filters.push([key, value]); return query; } };
    query.select = () => ({ maybeSingle: async () => {
      const row = state.rows.find((candidate) => filters.some(([k, v]) => k === "id" && candidate.id === v));
      const expected = filters.find(([k]) => k === "metadata->>push_state")?.[1];
      state.calls.push(["claim", filters]);
      if (!row || row.metadata.push_state !== expected) return { data: null, error: null };
      row.metadata = values.metadata;
      return { data: { id: row.id }, error: null };
    } });
    query.then = (resolve: any, reject: any) => Promise.resolve().then(() => {
      const row = state.rows.find((candidate) => filters.some(([k, v]) => k === "id" && candidate.id === v));
      if (row) row.metadata = values.metadata;
      return { data: null, error: null };
    }).then(resolve, reject);
    return query;
  },
}) }) }));
vi.mock("@/lib/push/server", () => ({ sendPushToUsers: state.push }));

import { notifyChariowSales, saleNotificationCopy, SALE_NOTIFICATIONS_START_AT } from "./sale-notifications";
const store = { id: "s1", user_id: "u1" };
const valid = (overrides: any = {}) => ({ id: "sale1", status: "paid", created_at: new Date().toISOString(), product: { name: "Cours" }, amount: { value: 1250, currency: "XOF" }, ...overrides });
const wrapper = (sale: any) => ({ data: [sale] });
beforeEach(() => {
  state.rows = []; state.profile = { preferred_locale: "fr" }; state.insertError = null; state.calls = [];
  state.push.mockReset().mockResolvedValue({ accepted: 1, failed: 0, unsubscribedUsers: 0 });
});

describe("saleNotificationCopy", () => {
  it("renders French and English copy and caps the product at 160 characters", () => {
    const fr = saleNotificationCopy({ sale: valid(), locale: "fr" });
    const en = saleNotificationCopy({ sale: valid({ product: { title: "Book" }, amount: { value: 12.5, currency: "USD" } }), locale: "en" });
    expect(fr).toEqual({ title: "🎉 oh, le génie 🤑", body: "Nouvelle vente : Cours — 1\u202f250 F CFA." });
    expect(en).toEqual({ title: "🎉 Oh, you genius 🤑", body: "New sale: Book — $12.50." });
    expect(saleNotificationCopy({ sale: valid({ product: { name: "é".repeat(200) } }) }).body).toContain("é".repeat(160));
  });
  it("defaults missing locale to French and supports zero/missing amounts", () => {
    expect(saleNotificationCopy({ sale: valid({ amount: { value: 0, currency: "EUR" } }) }).body).toBe("Nouvelle vente : Cours — 0,00 €.");
    expect(saleNotificationCopy({ sale: { product_name: "Test" } }).body).toBe("Nouvelle vente : Test.");
  });
});

describe("notifyChariowSales", () => {
  it("uses profiles id, persists copy identical to push, and preserves action_url", async () => {
    await notifyChariowSales(store, wrapper(valid()));
    expect(state.calls).toContainEqual(["select", "profiles", "preferred_locale", ["id", "u1"]]);
    expect(state.rows[0]).toMatchObject({ user_id: "u1", type: "system", title: "🎉 oh, le génie 🤑", body: "Nouvelle vente : Cours — 1\u202f250 F CFA.", action_url: "/dashboard", metadata: { push_state: "sent" } });
    expect(state.push).toHaveBeenCalledWith(["u1"], expect.objectContaining({ title: state.rows[0].title, body: state.rows[0].body, url: "/dashboard" }));
  });
  it("real concurrent duplicate invocation sends exactly one push", async () => {
    await Promise.all([notifyChariowSales(store, wrapper(valid())), notifyChariowSales(store, wrapper(valid()))]);
    expect(state.rows).toHaveLength(1); expect(state.push).toHaveBeenCalledTimes(1);
  });
  it("retries a failed duplicate with persisted title/body, without new in-app row", async () => {
    await notifyChariowSales(store, wrapper(valid()));
    state.rows[0].metadata.push_state = "failed";
    state.rows[0].title = "Saved title"; state.rows[0].body = "Saved body";
    await notifyChariowSales(store, wrapper(valid()));
    expect(state.rows).toHaveLength(1); expect(state.push).toHaveBeenCalledTimes(2);
    expect(state.push.mock.calls[1][1]).toMatchObject({ title: "Saved title", body: "Saved body" });
  });
  it("does not resend accepted notifications or ambiguous sending notifications", async () => {
    await notifyChariowSales(store, wrapper(valid()));
    await notifyChariowSales(store, wrapper(valid()));
    expect(state.push).toHaveBeenCalledTimes(1);
    for (const status of ["sending", "sent", "unsubscribed"]) {
      state.rows[0].metadata.push_state = status;
      await notifyChariowSales(store, wrapper(valid()));
    }
    expect(state.push).toHaveBeenCalledTimes(1);
  });
  it("keeps failed state and throws on transport rejection; retry succeeds", async () => {
    state.push.mockRejectedValueOnce(new Error("network"));
    await expect(notifyChariowSales(store, wrapper(valid()))).rejects.toThrow("network");
    expect(state.rows).toHaveLength(1); expect(state.rows[0].metadata.push_state).toBe("failed");
    await notifyChariowSales(store, wrapper(valid()));
    expect(state.rows).toHaveLength(1); expect(state.push).toHaveBeenCalledTimes(2);
  });
  it("requests retry when transport reports failures without throwing", async () => {
    state.push.mockResolvedValueOnce({ accepted: 0, failed: 1, unsubscribedUsers: 0 });
    await expect(notifyChariowSales(store, wrapper(valid()))).rejects.toThrow("preserved for retry");
    expect(state.rows[0].metadata.push_state).toBe("failed");
    await notifyChariowSales(store, wrapper(valid()));
    expect(state.rows).toHaveLength(1); expect(state.push).toHaveBeenCalledTimes(2);
    expect(state.rows[0].metadata.push_state).toBe("sent");
  });
  it("skips nonretryable duplicate on unique violation", async () => {
    state.rows.push({ id: "prior", user_id: "u1", dedupe_key: "chariow-sale:s1:sale1", title: "x", body: "y", metadata: { push_state: "sent" } });
    state.insertError = { code: "23505" };
    await notifyChariowSales(store, wrapper(valid()));
    expect(state.rows).toHaveLength(1); expect(state.push).not.toHaveBeenCalled();
  });
  it("filters invalid and out-of-window sales", async () => {
    await notifyChariowSales(store, { sales: [valid({ id: "old", created_at: "2020-01-01" }), valid({ id: "future", created_at: "2999-01-01" }), valid({ id: "pending", status: "pending" }), valid({ id: "good", settled_at: new Date().toISOString() })] });
    expect(state.rows.map((row) => row.dedupe_key)).toEqual(["chariow-sale:s1:good"]);
    expect(SALE_NOTIFICATIONS_START_AT).toBe("2026-10-21T23:22:30.000Z");
  });
  it("handles Unicode payloads under 3500 bytes", async () => {
    const sale = valid({ product_name: "界🙂é".repeat(100) });
    await notifyChariowSales(store, wrapper(sale));
    const serialized = JSON.stringify(state.push.mock.calls[0][1]);
    expect(new TextEncoder().encode(serialized).length).toBeLessThan(3500);
  });
});
