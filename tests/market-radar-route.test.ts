import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/market-radar", () => ({ buildMarketRadar: vi.fn() }));

import { requireUser } from "@/lib/auth";
import { buildMarketRadar } from "@/lib/market-radar";
import { POST } from "@/app/api/market/radar/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "test-user" }, response: new Response(null, { status: 401 }) } as never);
  vi.mocked(buildMarketRadar).mockResolvedValue({ score: null } as never);
});

function request(body: unknown) {
  return new Request("http://localhost/api/market/radar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/market/radar", () => {
  it("accepts an idea without a country and ignores legacy country selections", async () => {
    const response = await POST(request({
      idea: "Guide budget mobile money",
      audience: "entrepreneurs",
      audiences: ["entrepreneurs"],
      format: "ebook",
      locale: "fr",
      country: "BJ",
      countries: ["BJ", "CI"],
    }));
    expect(response.status).toBe(200);
    const input = vi.mocked(buildMarketRadar).mock.calls[0][0];
    expect(input).toMatchObject({ idea: "Guide budget mobile money", audiences: ["entrepreneurs"], format: "ebook", locale: "fr" });
    expect(input).not.toHaveProperty("country");
    expect(input).not.toHaveProperty("countries");
  });

  it("rejects short ideas and audience arrays beyond the bounded limit", async () => {
    const short = await POST(request({ idea: "ebook", format: "ebook" }));
    expect(short.status).toBe(400);
    const tooManyAudiences = await POST(request({ idea: "Guide budget mobile money", audiences: ["a", "b", "c", "d", "e", "f"], format: "ebook" }));
    expect(tooManyAudiences.status).toBe(400);
    expect(buildMarketRadar).not.toHaveBeenCalled();
  });

  it("returns the authentication response before running analysis", async () => {
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: null, response: new Response("Unauthorized", { status: 401 }) } as never);
    const response = await POST(request({ idea: "Guide budget mobile money" }));
    expect(response.status).toBe(401);
    expect(buildMarketRadar).not.toHaveBeenCalled();
  });
});
