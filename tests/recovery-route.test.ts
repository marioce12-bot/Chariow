import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { GET, POST } from "@/app/api/recovery/route";
const storeId = "11111111-1111-4111-8111-111111111111";
let q: any;
function post(body: any) {
  return new Request("http://localhost/api/recovery", {
    method: "POST",
    body: JSON.stringify({ storeId, ...body }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    in: vi.fn(() => q),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(() => q),
    update: vi.fn(() => q),
    neq: vi.fn(() => q),
    or: vi.fn(() => q),
    gt: vi.fn(() => q),
    gte: vi.fn(() => q),
    lte: vi.fn(() => q),
    range: vi.fn(() => q),
  };
  mocks.from.mockReturnValue(q);
  mocks.admin.mockReturnValue({ from: mocks.from });
  mocks.requireUser.mockResolvedValue({
    user: { id: "owner" },
    supabase: { from: mocks.from },
  });
  q.maybeSingle.mockResolvedValue({
    data: { id: storeId, store_name: "Shop" },
    error: null,
  });
  q.limit.mockResolvedValue({ data: [], error: null });
});
describe("Recovery API safeguards", () => {
  it("requires authentication on reads and writes", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response("Unauthorized", { status: 401 }),
    });
    expect(
      (
        await GET(
          new Request(`http://localhost/api/recovery?store_id=${storeId}`),
        )
      ).status,
    ).toBe(401);
    expect((await POST(post({ action: "create" }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("checks store ownership", async () => {
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(
      (
        await GET(
          new Request(`http://localhost/api/recovery?store_id=${storeId}`),
        )
      ).status,
    ).toBe(404);
    expect(mocks.from).toHaveBeenCalledWith("stores");
    expect(q.eq).toHaveBeenCalledWith("user_id", "owner");
  });
  it("rejects a create request without explicit consent", async () => {
    const r = await POST(
      post({
        action: "create",
        phone: "+221770000000",
        consent: false,
        consentSource: "checkout box",
        abandonedAt: "2026-10-01T00:00:00Z",
        paymentUrl: "https://pay.example/x",
      }),
    );
    expect(r.status).toBe(400);
    expect(q.insert).not.toHaveBeenCalled();
  });
  it("blocks creating a case for a previously opted-out phone", async () => {
    q.limit.mockResolvedValue({ data: [{ id: "optout" }], error: null });
    const r = await POST(
      post({
        action: "create",
        phone: "+221770000000",
        consent: true,
        consentAt: "2026-10-01T00:00:00Z",
        consentSource: "checkout checkbox",
        abandonedAt: "2026-10-01T00:00:00Z",
        paymentUrl: "https://pay.example/x",
      }),
    );
    expect(r.status).toBe(403);
    expect(q.insert).not.toHaveBeenCalled();
  });
});

describe("Recovery delivery and source safeguards", () => {
  const caseId = "22222222-2222-4222-8222-222222222222";
  const row = {
    id: caseId,
    store_id: storeId,
    phone: "+221770000000",
    status: "open",
    consent_at: "2026-10-01T00:00:00Z",
    consent_source: "checkout",
    payment_url: "https://pay.example/x",
    customer_name: null,
    product_name: null,
  };
  const postCase = (action: string) => POST(post({ action, id: caseId }));
  it("rejects prepare/sent before prepared state (link opening is not proof of sending)", async () => {
    q.maybeSingle
      .mockResolvedValueOnce({
        data: { id: storeId, store_name: "Shop" },
        error: null,
      })
      .mockResolvedValueOnce({ data: row, error: null });
    expect((await postCase("sent")).status).toBe(409);
    expect(q.update).not.toHaveBeenCalled();
  });
  it("prepares manually, then confirms sent only from prepared state", async () => {
    q.maybeSingle
      .mockResolvedValueOnce({
        data: { id: storeId, store_name: "Shop" },
        error: null,
      })
      .mockResolvedValueOnce({ data: row, error: null });
    q.limit.mockResolvedValue({ data: [], error: null });
    const prepared = await postCase("prepare");
    expect(prepared.status).toBe(200);
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "prepared" }),
    );
    vi.clearAllMocks();
    q.maybeSingle
      .mockResolvedValueOnce({
        data: { id: storeId, store_name: "Shop" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ...row, status: "prepared" },
        error: null,
      });
    q.limit.mockResolvedValue({ data: [], error: null });
    q.single.mockResolvedValue({
      data: { ...row, status: "sent" },
      error: null,
    });
    expect((await postCase("sent")).status).toBe(200);
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent" }),
    );
  });
  it("records opt-out and refuses subsequent prepare", async () => {
    q.maybeSingle
      .mockResolvedValueOnce({
        data: { id: storeId, store_name: "Shop" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ...row, status: "sent" }, error: null });
    q.single.mockResolvedValue({
      data: { ...row, status: "opted_out" },
      error: null,
    });
    expect((await postCase("opt_out")).status).toBe(200);
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "opted_out",
        opt_out_at: expect.any(String),
      }),
    );
    vi.clearAllMocks();
    q.maybeSingle
      .mockResolvedValueOnce({
        data: { id: storeId, store_name: "Shop" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ...row, status: "opted_out", opt_out_at: "2026-10-01" },
        error: null,
      });
    expect((await postCase("prepare")).status).toBe(409);
    expect(q.update).not.toHaveBeenCalled();
  });
  it("rejects duplicate source sale for this owner/store", async () => {
    q.maybeSingle
      .mockResolvedValueOnce({
        data: { id: storeId, store_name: "Shop" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          chariow_sale_id: "sale-1",
          status: "abandoned",
          amount: 0,
          currency: "XOF",
          raw_payload: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: "existing" }, error: null });
    const r = await POST(
      post({
        action: "create",
        sourceSaleId: "sale-1",
        phone: "+221770000000",
        consent: true,
        consentAt: "2026-10-01T00:00:00Z",
        consentSource: "checkout",
        abandonedAt: "2026-10-01T00:00:00Z",
        paymentUrl: "https://pay.example/x",
        amount: 0,
        currency: "XOF",
      }),
    );
    expect(r.status).toBe(409);
    expect(q.insert).not.toHaveBeenCalled();
  });
});

describe("recovery reconciliation", () => {
  const caseId = "33333333-3333-4333-8333-333333333333";
  const row = {
    id: caseId,
    store_id: storeId,
    status: "sent",
    sent_at: "2026-10-10T00:01:00Z",
    source_sale_id: "source",
    phone: "+221770000000",
    sale_id: null,
  };
  const postReconcile = () => POST(post({ action: "reconcile", id: caseId }));
  it("queries post-send synced sales and confirms a source sale created before sending but paid after", async () => {
    q.maybeSingle
      .mockResolvedValueOnce({
        data: { id: storeId, store_name: "Shop" },
        error: null,
      })
      .mockResolvedValueOnce({ data: row, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    q.range.mockResolvedValueOnce({
      data: [
        {
          chariow_sale_id: "source",
          status: "completed",
          amount: 100,
          currency: "XOF",
          occurred_at: "2026-10-09T00:00:00Z",
          updated_at: "2026-10-11T00:00:00Z",
          raw_payload: { completed_at: "2026-10-11T00:00:00Z" },
        },
      ],
      error: null,
    });
    q.single.mockResolvedValueOnce({
      data: { ...row, status: "recovered" },
      error: null,
    });
    const response = await postReconcile();
    expect(response.status).toBe(200);
    expect(q.gte).toHaveBeenCalledWith("updated_at", row.sent_at);
    expect(q.lte).toHaveBeenCalledWith("updated_at", expect.any(String));
    expect(q.select).toHaveBeenCalledWith(
      "chariow_sale_id,status,amount,currency,occurred_at,updated_at,raw_payload",
    );
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "recovered",
        sale_id: "source",
        attribution: "confirmed",
      }),
    );
  });
});
