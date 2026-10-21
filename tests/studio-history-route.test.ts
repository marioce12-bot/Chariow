import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireUser, readStudioHistory } = vi.hoisted(() => ({ requireUser: vi.fn(), readStudioHistory: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/studio/history", () => ({ readStudioHistory }));
import { GET } from "@/app/api/studio/history/route";

describe("studio history HTTP contract", () => {
  const supabase = {};
  beforeEach(() => { vi.clearAllMocks(); requireUser.mockResolvedValue({ supabase, user: { id: "owner" } }); });
  it("requires authentication before reading creations", async () => {
    requireUser.mockResolvedValue({ user: null, response: new Response("unauthorized", { status: 401 }) });
    expect((await GET(new Request("https://example.test/api/studio/history"))).status).toBe(401);
    expect(readStudioHistory).not.toHaveBeenCalled();
  });
  it("uses the authenticated owner and does not cache expiring playback URLs", async () => {
    const result = { items: [{ id: "final", kind: "video", mediaUrl: "signed:final.mp4" }], nextCursor: null };
    readStudioHistory.mockResolvedValue(result);
    const response = await GET(new Request("https://example.test/api/studio/history?kind=video&cursor=page&user_id=attacker"));
    expect(readStudioHistory).toHaveBeenCalledWith(supabase, "owner", "video", "page");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
  });
  it("returns a client error for an invalid cursor", async () => {
    readStudioHistory.mockRejectedValue(new Error("Curseur d’historique invalide."));
    expect((await GET(new Request("https://example.test/api/studio/history?cursor=bad"))).status).toBe(400);
  });
  it("reports an unavailable history without invoking any generation", async () => {
    readStudioHistory.mockRejectedValue(new Error("Unavailable"));
    expect((await GET(new Request("https://example.test/api/studio/history"))).status).toBe(500);
    expect(readStudioHistory).toHaveBeenCalledTimes(1);
  });
});
