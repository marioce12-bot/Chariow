import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/market-radar", () => ({ buildMarketRadar: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/studio/credit-rpc", () => ({ confirmCreditTransition: vi.fn() }));

import { requireUser } from "@/lib/auth";
import { buildMarketRadar } from "@/lib/market-radar";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmCreditTransition } from "@/lib/studio/credit-rpc";
import { POST } from "@/app/api/market/radar/route";

const adminRpc = vi.fn();
const admin = { rpc: adminRpc };

beforeEach(() => {
  vi.clearAllMocks();
  adminRpc.mockResolvedValue({ data: { ok: true, balance: 100, reserved: 5, transaction_id: "tx-radar-1" }, error: null });
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  vi.mocked(confirmCreditTransition).mockResolvedValue(true);
  vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "test-user" }, response: new Response(null, { status: 401 }) } as never);
  vi.mocked(buildMarketRadar).mockResolvedValue({ status: "qualitative", score: 82 } as never);
});

function request(body: unknown) {
  return new Request("http://localhost/api/market/radar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/market/radar", () => {
  it("reserves and charges exactly 5 credits for one completed analysis", async () => {
    const response = await POST(request({ idea: "Guide budget mobile money", format: "ebook", locale: "fr" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.creditsCharged).toBe(5);
    const [input, supabase, userId] = vi.mocked(buildMarketRadar).mock.calls[0];
    expect(input).toEqual({ idea: "Guide budget mobile money", product: null, format: "ebook", locale: "fr" });
    expect(input).not.toHaveProperty("audience");
    expect(input).not.toHaveProperty("countries");
    expect(supabase).toEqual({});
    expect(userId).toBe("test-user");
    expect(adminRpc).toHaveBeenCalledTimes(1);
    expect(adminRpc).toHaveBeenCalledWith("reserve_credits", expect.objectContaining({
      target_user_id: "test-user", amount: 5, operation_name: "market_radar", provider_amount: 0,
    }));
    expect(confirmCreditTransition).toHaveBeenCalledTimes(1);
    expect(confirmCreditTransition).toHaveBeenCalledWith(admin, "complete_credit_debit", "tx-radar-1", { userId: "test-user", amount: 5 });
  });

  it("accepts a selected product even when its name is shorter than the free-text minimum", async () => {
    const response = await POST(request({
      idea: "",
      product: { name: "Ebook", description: "Un guide pratique de budget", price: "4500", currency: "XOF", category: "Finance" },
      format: "ebook",
      locale: "fr",
    }));
    expect(response.status).toBe(200);
    const [input] = vi.mocked(buildMarketRadar).mock.calls[0];
    expect(input).toMatchObject({ idea: "Ebook", product: { name: "Ebook", description: "Un guide pratique de budget", price: "4500", currency: "XOF", category: "Finance" } });
  });

  it("blocks before analysis or providers when fewer than 5 credits are available", async () => {
    adminRpc.mockResolvedValue({ data: { ok: false, balance: 9, reserved: 5, required: 5 }, error: null });
    const response = await POST(request({ idea: "Guide budget mobile money" }));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload).toMatchObject({ code: "INSUFFICIENT_CREDITS", required: 5, balance: 4 });
    expect(buildMarketRadar).not.toHaveBeenCalled();
    expect(confirmCreditTransition).not.toHaveBeenCalled();
  });

  it("refunds the reservation when the AI analysis is unavailable", async () => {
    vi.mocked(buildMarketRadar).mockResolvedValue({ status: "ai_unavailable", score: null } as never);
    const response = await POST(request({ idea: "Guide budget mobile money" }));

    expect(response.status).toBe(200);
    expect(confirmCreditTransition).toHaveBeenCalledWith(admin, "refund_credit_debit", "tx-radar-1", { userId: "test-user", amount: 5 });
  });

  it("refunds the reservation when analysis throws", async () => {
    vi.mocked(buildMarketRadar).mockRejectedValue(new Error("private provider failure"));
    const response = await POST(request({ idea: "Guide budget mobile money" }));

    expect(response.status).toBe(502);
    expect(confirmCreditTransition).toHaveBeenCalledWith(admin, "refund_credit_debit", "tx-radar-1", { userId: "test-user", amount: 5 });
  });

  it("rejects short ideas without a product and ideas longer than the limit", async () => {
    const short = await POST(request({ idea: "ebook", format: "ebook" }));
    const tooLong = await POST(request({ idea: "x".repeat(181), format: "ebook" }));
    expect(short.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(buildMarketRadar).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("returns the authentication response before reserving credits or running analysis", async () => {
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: null, response: new Response("Unauthorized", { status: 401 }) } as never);
    const response = await POST(request({ idea: "Guide budget mobile money" }));
    expect(response.status).toBe(401);
    expect(buildMarketRadar).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });
});
