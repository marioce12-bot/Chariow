import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/market-radar", () => ({ buildMarketRadar: vi.fn() }));

import { requireUser } from "@/lib/auth";
import { buildMarketRadar } from "@/lib/market-radar";
import { POST } from "@/app/api/market/radar/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "test-user" }, response: new Response(null, { status: 401 }) } as never);
  vi.mocked(buildMarketRadar).mockResolvedValue({ score: 82 } as never);
});

function request(body: unknown) {
  return new Request("http://localhost/api/market/radar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/market/radar", () => {
  it("accepts an idea, ignores legacy audience/country choices, and sends no audience field to the algorithm", async () => {
    const response = await POST(request({
      idea: "Guide budget mobile money",
      audience: "entrepreneurs",
      audiences: ["a", "b", "c", "d", "e", "f"],
      format: "ebook",
      locale: "fr",
      country: "BJ",
      countries: ["BJ", "CI"],
    }));
    expect(response.status).toBe(200);
    const [input, supabase, userId] = vi.mocked(buildMarketRadar).mock.calls[0];
    expect(input).toEqual({ idea: "Guide budget mobile money", product: null, format: "ebook", locale: "fr" });
    expect(input).not.toHaveProperty("audience");
    expect(input).not.toHaveProperty("audiences");
    expect(input).not.toHaveProperty("country");
    expect(input).not.toHaveProperty("countries");
    expect(supabase).toEqual({});
    expect(userId).toBe("test-user");
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

  it("rejects short ideas without a product and ideas longer than the limit", async () => {
    const short = await POST(request({ idea: "ebook", format: "ebook" }));
    const tooLong = await POST(request({ idea: "x".repeat(181), format: "ebook" }));
    expect(short.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(buildMarketRadar).not.toHaveBeenCalled();
  });

  it("returns the authentication response before running analysis", async () => {
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: null, response: new Response("Unauthorized", { status: 401 }) } as never);
    const response = await POST(request({ idea: "Guide budget mobile money" }));
    expect(response.status).toBe(401);
    expect(buildMarketRadar).not.toHaveBeenCalled();
  });
});
