import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  stores: [] as Array<Record<string, unknown>>,
  updateUser: vi.fn(),
  user: null as any,
  authResponse: null as any,
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
import { GET, POST } from "@/app/api/onboarding/route";

const KEY = "vendeo_onboarding_v1";

function makeSupabase() {
  return {
    from: (table: string) => {
      expect(table).toBe("stores");
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select: (_columns: string) => builder,
        eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
        then: (resolve: any, reject: any) => {
          const rows = mocks.stores.filter((row) =>
            Object.entries(filters).every(([key, value]) => key === "user_id" || row[key] === value),
          );
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
    auth: { updateUser: mocks.updateUser },
  };
}
function setup(options: { user?: any; stores?: Array<Record<string, unknown>> } = {}) {
  mocks.stores = options.stores ?? [];
  mocks.user = options.user === undefined ? { id: "u1", user_metadata: {} } : options.user;
  mocks.authResponse = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  mocks.updateUser.mockResolvedValue({ data: { user: mocks.user }, error: null });
  mocks.requireUser.mockResolvedValue({
    supabase: makeSupabase(), user: mocks.user, response: mocks.authResponse,
  });
}
const request = (value: unknown) => new Request("http://localhost/api/onboarding", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
});
const json = (response: Response) => response.json();

beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("/api/onboarding", () => {
  it("GET marks legacy accounts with inactive store history done", async () => {
    setup({ stores: [{ id: "s1", connection_status: "disconnected" }] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ phase: "done", eligible: false });
  });

  it("GET marks an account with no stores eligible", async () => {
    const response = await GET();
    expect(await json(response)).toEqual({ eligible: true });
  });

  it.each(["welcome", "tour"] as const)("GET returns persisted %s metadata", async (phase) => {
    setup({ user: { id: "u1", user_metadata: { theme: "dark", [KEY]: { phase } } } });
    expect(await json(await GET())).toEqual({ phase });
  });

  it.each([null, {}, { phase: 1 }, { phase: "unknown" }, [], "welcome"])("POST rejects invalid payload %j", async (payload) => {
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Phase d’onboarding invalide" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("returns requireUser response when unauthenticated", async () => {
    setup({ user: null });
    expect(await GET()).toBe(mocks.authResponse);
    expect(await POST(request({ phase: "pending" }))).toBe(mocks.authResponse);
  });

  it("does not write pending for an account with historical stores", async () => {
    setup({ stores: [{ id: "s1", connection_status: "disconnected" }] });
    expect(await json(await POST(request({ phase: "pending" })))).toEqual({ phase: "done", eligible: false });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("excludes pending when a later onboarding phase is already stored", async () => {
    setup({ user: { id: "u1", user_metadata: { [KEY]: { phase: "welcome" } } } });
    expect(await json(await POST(request({ phase: "pending" })))).toEqual({ phase: "welcome", eligible: false });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("requires a connected store before moving from pending to welcome", async () => {
    setup({
      user: { id: "u1", user_metadata: { locale: "fr", [KEY]: { phase: "pending" } } },
      stores: [{ id: "s1", connection_status: "disconnected" }],
    });
    expect(await json(await POST(request({ phase: "welcome" })))).toEqual({ phase: "pending", eligible: false });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("creates pending for a new account and merges existing metadata", async () => {
    setup({ user: { id: "u1", user_metadata: { locale: "fr", [KEY]: { source: "signup" } } } });
    expect(await json(await POST(request({ phase: "pending" })))).toEqual({ phase: "pending" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { locale: "fr", [KEY]: { source: "signup", phase: "pending" } } });
  });

  it("transitions pending to welcome only with a connected store", async () => {
    setup({
      user: { id: "u1", user_metadata: { [KEY]: { phase: "pending" } } },
      stores: [{ id: "s1", connection_status: "connected" }],
    });
    expect(await json(await POST(request({ phase: "welcome" })))).toEqual({ phase: "welcome" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { [KEY]: { phase: "welcome" } } });
  });

  it("transitions welcome to tour and tour to done", async () => {
    setup({ user: { id: "u1", user_metadata: { [KEY]: { phase: "welcome" } } } });
    expect(await json(await POST(request({ phase: "tour" })))).toEqual({ phase: "tour" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { [KEY]: { phase: "tour" } } });
    setup({ user: { id: "u1", user_metadata: { [KEY]: { phase: "tour" } } } });
    expect(await json(await POST(request({ phase: "done" })))).toEqual({ phase: "done" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { [KEY]: { phase: "done" } } });
  });

  it.each([
    ["pending", "welcome"],
    ["welcome", "tour"],
    ["tour", "done"],
    ["done", "done"],
  ] as const)("allows/idempotently preserves %s -> %s", async (current, requested) => {
    setup({ user: { id: "u1", user_metadata: { [KEY]: { phase: current } } }, stores: requested === "welcome" ? [{ id: "s1", connection_status: "connected" }] : [] });
    const response = await POST(request({ phase: requested }));
    expect(await json(response)).toEqual({ phase: requested });
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite same pending marker", async () => {
    setup({ user: { id: "u1", user_metadata: { [KEY]: { phase: "pending" } } } });
    expect(await json(await POST(request({ phase: "pending" })))).toEqual({ phase: "pending" });
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
  });
});
