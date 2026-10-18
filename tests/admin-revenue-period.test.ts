import { describe, expect, it } from "vitest";
import { readRevenue, type RevenueRow } from "@/lib/admin-revenue";
import { resolveRevenuePeriod, type RevenuePeriod } from "@/lib/admin-revenue-period";

const asOf = new Date("2026-10-18T20:00:00.000Z");
const payment = (id: string, transaction_id: string, created_at: string, amount_xof = 2000, extra: Partial<RevenueRow> = {}): RevenueRow => ({
  id, provider: "saspay", transaction_id, plan: "starter", status: "approved", metadata: { amount_xof, currency: "XOF" }, created_at, ...extra,
});
const credit = (id: string, external_id: string, created_at: string, amount_xof = 500, extra: Partial<RevenueRow> = {}): RevenueRow => ({
  id, kind: "purchase", operation: "credit_purchase", external_id, status: "completed", metadata: { provider: "saspay", amount_xof, currency: "XOF" }, created_at, ...extra,
});
const period = (start: string | null, end: string, timeZone = "UTC", preset = start ? "custom" : "all"): RevenuePeriod => ({
  preset, start, end, timeZone,
  startAt: start ? new Date(`${start}T00:00:00.000Z`).toISOString() : null,
  endAt: new Date(`${end}T23:59:59.999Z`).toISOString(),
});

/** Supabase-like thenable query with real inclusive lte, stable sort, range and in filtering. */
function mockService(tables: Record<string, RevenueRow[]>, onQuery?: (table: string, method: string, args: unknown[]) => void) {
  return {
    from(table: string) {
      let ceiling = "";
      let kindFilter: string[] | null = null;
      const q: any = {};
      q.select = (...args: unknown[]) => { onQuery?.(table, "select", args); return q; };
      q.lte = (column: string, value: string) => { onQuery?.(table, "lte", [column, value]); ceiling = value; return q; };
      q.order = (column: string, options: unknown) => { onQuery?.(table, "order", [column, options]); return q; };
      q.in = (column: string, values: string[]) => { onQuery?.(table, "in", [column, values]); kindFilter = values; return q; };
      q.range = async (start: number, end: number) => {
        onQuery?.(table, "range", [start, end]);
        const filtered = (tables[table] ?? []).filter(row => Date.parse(row.created_at) <= Date.parse(ceiling) && (!kindFilter || kindFilter.includes(String(row.kind))));
        filtered.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        return { data: filtered.slice(start, end + 1), error: null };
      };
      return q;
    },
  };
}

function resolve(query: string, when = asOf) {
  return resolveRevenuePeriod(new URLSearchParams(query), when);
}

describe("admin revenue civil period resolution", () => {
  it.each([
    ["7d", "2026-10-12"], ["30d", "2026-09-19"], ["90d", "2026-07-21"], ["all", null],
  ])("resolves %s with inclusive civil start/end and ISO bounds", (preset, start) => {
    const p = resolve(`period=${preset}&timeZone=UTC`);
    expect(p).toMatchObject({ preset, start, end: "2026-10-18", timeZone: "UTC", startAt: start ? `${start}T00:00:00.000Z` : null, endAt: asOf.toISOString() });
  });

  it("keeps custom civil dates and includes both boundaries", () => {
    expect(resolve("period=custom&start=2026-10-01&end=2026-10-03&timeZone=UTC")).toMatchObject({
      start: "2026-10-01", end: "2026-10-03", startAt: "2026-10-01T00:00:00.000Z", endAt: "2026-10-03T23:59:59.999Z",
    });
  });

  it.each([
    ["2026-03-08", "2026-03-08", "2026-03-09T03:59:59.999Z"],
    ["2026-11-01", "2026-11-01", "2026-11-02T04:59:59.999Z"],
  ])("uses actual local-day duration across DST (%s)", (day, end, expectedEnd) => {
    const p = resolve(`period=custom&start=${day}&end=${end}&timeZone=America%2FNew_York`, new Date("2026-12-01T12:00:00Z"));
    expect(p).toMatchObject({ startAt: `${day === "2026-03-08" ? "2026-03-08T05:00:00.000Z" : "2026-11-01T04:00:00.000Z"}`, endAt: expectedEnd, end });
  });

  it.each([
    "period=custom&start=2026-02-30&end=2026-03-01",
    "period=custom&start=2026-03-02&end=2026-03-01",
    "period=custom&start=2026-10-19&end=2026-10-19&timeZone=UTC",
    "period=7d&timeZone=Not%2FA_Real_Zone",
    "period=bogus",
  ])("rejects invalid period input: %s", input => expect(resolve(input)).toBeNull());

  it("allows the as-of civil day and clips its end rather than creating future time", () => {
    expect(resolve("period=custom&start=2026-10-18&end=2026-10-18&timeZone=UTC")).toMatchObject({ end: "2026-10-18", endAt: asOf.toISOString() });
  });
});

describe("readRevenue period aggregation", () => {
  it("includes exactly the selected interval's paid SasPay subscriptions and top-ups; excludes free, manual and failed rows", async () => {
    const tables = {
      payment_events: [
        payment("p0", "before", "2026-09-30T23:59:59.999Z"),
        payment("p1", "sub", "2026-10-01T00:00:00.000Z"),
        payment("p3", "failed", "2026-10-02T02:00:00Z", 999, { status: "failed" }),
        payment("p4", "end", "2026-10-03T23:59:59.999Z", 3000),
        payment("p5", "future", "2026-10-04T00:00:00Z"),
      ],
      credit_transactions: [
        credit("welcome", "free", "2026-10-02T01:00:00Z", 999, { operation: "welcome_credits" }),
        credit("c1", "paid", "2026-10-02T10:00:00Z", 500),
        credit("c2", "admin", "2026-10-02T11:00:00Z", 9000, { operation: "admin_grant", metadata: { provider: "admin_grant", amount_xof: 9000 } }),
        credit("c3", "bad", "2026-10-02T12:00:00Z", 8000, { status: "failed" }),
      ],
    };
    const result = await readRevenue(mockService(tables), asOf.toISOString(), period("2026-10-01", "2026-10-03"));
    expect(result).toMatchObject({ complete: true, subscriptions: 5000, studio: 500, total: 5500, subscriptionPayments: 2, studioPayments: 1 });
    expect(result.period).toMatchObject({ start: "2026-10-01", end: "2026-10-03" });
  });

  it("paginates beyond 1000 rows, applies the ceiling before pagination, and keeps aggregate/series/breakdown consistent", async () => {
    const rows = Array.from({ length: 1003 }, (_, i) => credit(`c${String(i).padStart(4, "0")}`, `tx${i}`, "2026-10-02T10:00:00Z", 2));
    rows.push(credit("future", "future", "2026-10-04T00:00:00Z", 100000));
    const ranges: unknown[][] = [];
    const calls: unknown[][] = [];
    const result = await readRevenue(mockService({ payment_events: [], credit_transactions: rows }, (table, method, args) => {
      if (method === "range") ranges.push([table, ...args]);
      if (method === "lte") calls.push([table, ...args]);
    }), asOf.toISOString(), period("2026-10-01", "2026-10-03"));
    expect(ranges).toContainEqual(["credit_transactions", 1000, 1999]);
    expect(calls).toContainEqual(["credit_transactions", "created_at", "2026-10-03T23:59:59.999Z"]);
    expect(result).toMatchObject({ complete: true, studio: 2006, total: 2006, studioPayments: 1003 });
    expect(result.series?.reduce((n, day) => n + day.total, 0)).toBe(result.total);
    expect(result.series?.reduce((n, day) => n + day.studio, 0)).toBe(result.studio);
    expect(result.series?.map(x => x.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("deduplicates same-range cross-day redelivery and does not count a transaction originally before start", async () => {
    const result = await readRevenue(mockService({
      payment_events: [
        payment("original-before", "pre-range", "2026-09-30T23:00:00Z", 700),
        payment("redelivery-inside", "pre-range", "2026-10-02T08:00:00Z", 700),
        payment("first", "one-tx", "2026-10-01T08:00:00Z", 1000),
        payment("redelivery", "one-tx", "2026-10-02T08:00:00Z", 1000),
      ], credit_transactions: [],
    }), asOf.toISOString(), period("2026-10-01", "2026-10-03"));
    expect(result).toMatchObject({ complete: true, subscriptions: 1000, total: 1000, subscriptionPayments: 1 });
    expect(result.series?.reduce((n, x) => n + x.total, 0)).toBe(result.total);
  });

  it.each(["amount", "refund"] as const)("fails closed globally on out-of-range %s evidence, even though filtered events appear valid", async kind => {
    const bad = kind === "amount"
      ? payment("bad", "mismatch", "2026-09-30T12:00:00Z", 400, { metadata: {} })
      : credit("refund", "refund-id", "2026-09-30T12:00:00Z", 500, { kind: "refund", operation: "credit_refund" });
    const result = await readRevenue(mockService({
      payment_events: [payment("good", "good", "2026-10-02T12:00:00Z", 1000), ...(kind === "amount" ? [bad] : [])],
      credit_transactions: kind === "refund" ? [bad] : [],
    }), asOf.toISOString(), period("2026-10-01", "2026-10-03"));
    expect(result).toMatchObject({ complete: false, total: null, subscriptions: null, studio: null });
    expect(result.series).toBeUndefined();
  });

  it("returns zero totals and all covered zero days for a successful empty scan", async () => {
    const result = await readRevenue(mockService({ payment_events: [], credit_transactions: [] }), asOf.toISOString(), period("2026-10-16", "2026-10-18"));
    expect(result).toMatchObject({ complete: true, total: 0, subscriptions: 0, studio: 0, firstRecordedAt: null, subscriptionPayments: 0, studioPayments: 0 });
    expect(result.series).toEqual([
      { date: "2026-10-16", subscriptions: 0, studio: 0, total: 0 },
      { date: "2026-10-17", subscriptions: 0, studio: 0, total: 0 },
      { date: "2026-10-18", subscriptions: 0, studio: 0, total: 0 },
    ]);
  });
});
