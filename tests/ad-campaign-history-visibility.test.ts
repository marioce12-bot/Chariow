import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { getMetaCampaignLifecycle } from "@/lib/meta/status";
const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
import { GET } from "@/app/api/ad-campaigns/route";

describe("campaign history is hidden without deleting campaign records", () => {
  beforeEach(() => vi.clearAllMocks());
  function database(rows: any[], error: unknown = null) {
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(async () => ({ data: rows, error })), delete: vi.fn(), update: vi.fn() };
    const from = vi.fn(() => query);
    requireUser.mockResolvedValue({ user: { id: "owner" }, supabase: { from } });
    return { query, from };
  }
  it("does not return the 36 history rows even to a legacy client, while retaining all stored rows", async () => {
    const current = ["active", "paused", "review", "draft", "completed", "rejected", "autopilot_paused"].map((status) => Object.freeze({ id: status, status, external_error: null }));
    const history = Array.from({ length: 36 }, (_, i) => Object.freeze({ id: `history-${i}`, status: i % 2 ? "deleted" : "archived", external_error: null }));
    const rows = Object.freeze([...current, ...history]);
    const { query } = database(rows as unknown as any[]);
    const response = await GET(new Request("https://app.example/api/ad-campaigns"));
    const body = await response.json();
    expect(body.campaigns).toEqual(current);
    // This is the grouping used by the previous production client: no drawer can render.
    expect(body.campaigns.filter((row: any) => ["archived", "deleted"].includes(getMetaCampaignLifecycle(row.status, row.external_error) ?? ""))).toHaveLength(0);
    expect(rows).toHaveLength(43);
    expect(rows.filter((row) => row.id.startsWith("history-"))).toHaveLength(36);
    expect(query.delete).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("also excludes legacy archived/deleted markers but keeps ambiguous unavailable campaigns", async () => {
    const hidden = [
      { status: "paused", external_error: "META_ARCHIVED:historique conservé" },
      { status: "paused", external_error: "META_DELETED:historique conservé" },
      { status: "paused", external_error: "META_PAUSED:The campaign is archived." },
      { status: "paused", external_error: "La publicité a été supprimée." },
      { status: "CAMPAIGN_ARCHIVED", external_error: null },
    ];
    const visible = [{ status: "paused", external_error: "META_UNAVAILABLE:état indisponible" }, { status: "active", external_error: "not archived" }];
    database([...hidden, ...visible]);
    expect(await (await GET(new Request("https://app.example/api/ad-campaigns"))).json()).toEqual({ campaigns: visible });
  });
  it("returns an empty current list when every campaign is historical", async () => {
    database([{ status: "deleted", external_error: null }]);
    expect(await (await GET(new Request("https://app.example/api/ad-campaigns"))).json()).toEqual({ campaigns: [] });
  });
  it("supports an owner-scoped store filter for recommendation settings", async () => {
    const { query } = database([{ id: "campaign-1", status: "active", external_error: null }]);
    const response = await GET(new Request("https://app.example/api/ad-campaigns?store_id=store-1"));
    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(query.eq).toHaveBeenCalledWith("store_id", "store-1");
  });
  it("preserves authentication and database error handling", async () => {
    requireUser.mockResolvedValue({ user: null, response: new Response("Unauthorized", { status: 401 }) });
    expect((await GET(new Request("https://app.example/api/ad-campaigns"))).status).toBe(401);
    database([], { message: "unavailable" });
    expect((await GET(new Request("https://app.example/api/ad-campaigns"))).status).toBe(500);
  });
  it("has no history JSX and defensively hides an older history tree", () => {
    const component = readFileSync("components/vendeo/AdCampaignsList.tsx", "utf8");
    const css = readFileSync("components/vendeo/ad-campaigns-list.css", "utf8");
    expect(component).not.toContain('t("adsExtra.history"');
    expect(component).not.toContain('className="ad-campaign-history"');
    expect(css).toMatch(/\.ad-campaign-history\s*\{[^}]*display:\s*none\s*!important/);
  });
  it("uses the same new shell cache in the page and worker and purges only old Vendeo shell caches", async () => {
    const worker = readFileSync("public/sw.js", "utf8");
    const register = readFileSync("app/PwaRegister.tsx", "utf8");
    const name = worker.match(/const CACHE_NAME = "([^"]+)"/)![1];
    expect(name).toBe("vendeo-shell-v6");
    expect(register).toContain(`const CACHE_NAME = "${name}"`);
    const handlers: Record<string, (event: any) => void> = {};
    const remove = vi.fn(async () => true);
    const claim = vi.fn(async () => undefined);
    runInNewContext(worker, { self: { addEventListener: (key: string, handler: any) => { handlers[key] = handler; }, clients: { claim } }, caches: { keys: async () => ["vendeo-shell-v5", "vendeo-shell-v6", "unrelated-cache"], delete: remove }, URL, Set });
    let pending: Promise<unknown> | undefined;
    handlers.activate({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("vendeo-shell-v5");
    expect(claim).toHaveBeenCalledOnce();
  });
});
