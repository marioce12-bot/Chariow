import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, rateLimit, isPreviewEnabled, renderSlideshow, remixSlideshow } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rateLimit: vi.fn(),
  isPreviewEnabled: vi.fn(),
  renderSlideshow: vi.fn(),
  remixSlideshow: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/shop/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/studio/slideshow-server", () => ({ isPreviewEnabled, renderSlideshow, remixSlideshow }));

import { POST as render } from "@/app/api/studio/slideshow/render/route";
import { POST as remix } from "@/app/api/studio/slideshow/remix/route";

const uid1 = "11111111-1111-4111-8111-111111111111";
const uid2 = "22222222-2222-4222-8222-222222222222";
const request = (body: unknown) => new Request("https://preview.example/api/studio/slideshow", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ user: { id: "user-A" } });
  rateLimit.mockReturnValue(false);
  isPreviewEnabled.mockReturnValue(true);
  renderSlideshow.mockResolvedValue({ generationId: uid2, videoUrl: "/signed/video", attribution: "credit", creditsCost: 0 });
  remixSlideshow.mockResolvedValue({ generationId: uid1, videoUrl: "/signed/remix", attribution: "credit", creditsCost: 0 });
});

describe("slideshow HTTP guards (all implementation dependencies mocked)", () => {
  it("requires an authenticated user before either operation", async () => {
    requireUser.mockResolvedValue({ user: null, response: new Response("unauthorized", { status: 401 }) });
    expect((await render(request({ generationIds: [uid1, uid2], duration: 5, musicId: "" }))).status).toBe(401);
    expect((await remix(request({ generationId: uid1, musicId: "" }))).status).toBe(401);
    expect(isPreviewEnabled).not.toHaveBeenCalled();
    expect(renderSlideshow).not.toHaveBeenCalled();
    expect(remixSlideshow).not.toHaveBeenCalled();
  });

  it("locks render and remix outside Vercel Preview (including Production)", async () => {
    isPreviewEnabled.mockReturnValue(false);
    for (const response of [
      await render(request({ generationIds: [uid1, uid2], duration: 5, musicId: "" })),
      await remix(request({ generationId: uid1, musicId: "" })),
    ]) expect(response.status).toBe(404);
    expect(renderSlideshow).not.toHaveBeenCalled();
    expect(remixSlideshow).not.toHaveBeenCalled();
  });

  it("accepts no-music rendering and passes only the authenticated owner id", async () => {
    const response = await render(request({ generationIds: [uid1, uid2], duration: 5, musicId: "" }));
    expect(response.status).toBe(200);
    expect(renderSlideshow).toHaveBeenCalledWith("user-A", [uid1, uid2], 5, "");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("routes remix only to audio-remix implementation; never invokes render/generation", async () => {
    const response = await remix(request({ generationId: uid1, musicId: "track_1" }));
    expect(response.status).toBe(200);
    expect(remixSlideshow).toHaveBeenCalledWith("user-A", uid1, "track_1");
    expect(renderSlideshow).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects invalid payloads before invoking implementation", async () => {
    expect((await render(request({ generationIds: [uid1], duration: 5, musicId: "" }))).status).toBe(400);
    expect((await remix(request({ generationId: "../other-user", musicId: "" }))).status).toBe(400);
    expect(renderSlideshow).not.toHaveBeenCalled();
    expect(remixSlideshow).not.toHaveBeenCalled();
  });
});
