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
vi.mock("@/lib/studio/slideshow-plan", () => ({ MIN_SLIDESHOW_IMAGES: 5, MAX_SLIDESHOW_IMAGES: 5 }));

import { POST as render } from "@/app/api/studio/slideshow/render/route";
import { POST as remix } from "@/app/api/studio/slideshow/remix/route";

const uid1 = "11111111-1111-4111-8111-111111111111";
const uid2 = "22222222-2222-4222-8222-222222222222";
const fiveIds = [uid1, uid2, "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
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
    expect((await render(request({ generationIds: fiveIds, duration: 5, musicId: "" }))).status).toBe(401);
    expect((await remix(request({ generationId: uid1, musicId: "" }))).status).toBe(401);
    expect(isPreviewEnabled).not.toHaveBeenCalled();
    expect(renderSlideshow).not.toHaveBeenCalled();
    expect(remixSlideshow).not.toHaveBeenCalled();
  });

  it("locks render and remix when the slideshow environment is disabled", async () => {
    isPreviewEnabled.mockReturnValue(false);
    for (const response of [
      await render(request({ generationIds: fiveIds, duration: 5, musicId: "" })),
      await remix(request({ generationId: uid1, musicId: "" })),
    ]) expect(response.status).toBe(404);
    expect(renderSlideshow).not.toHaveBeenCalled();
    expect(remixSlideshow).not.toHaveBeenCalled();
  });

  it("accepts no-music rendering and passes only the authenticated owner id", async () => {
    const response = await render(request({ generationIds: fiveIds, duration: 5, musicId: "" }));
    expect(response.status).toBe(200);
    expect(renderSlideshow).toHaveBeenCalledWith("user-A", fiveIds, 5, "");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts five images and rejects six before invoking the implementation", async () => {
    const five = [uid1, uid2, "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
    expect((await render(request({ generationIds: five, duration: 5, musicId: "" }))).status).toBe(200);
    expect(renderSlideshow).toHaveBeenCalledWith("user-A", five, 5, "");
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ user: { id: "user-A" } }); rateLimit.mockReturnValue(false); isPreviewEnabled.mockReturnValue(true);
    const six = [...five, "66666666-6666-4666-8666-666666666666"];
    expect((await render(request({ generationIds: six, duration: 5, musicId: "" }))).status).toBe(400);
    expect(renderSlideshow).not.toHaveBeenCalled();
  });

  it("routes remix only to audio-remix implementation; never invokes render/generation", async () => {
    const response = await remix(request({ generationId: uid1, musicId: "track_1" }));
    expect(response.status).toBe(200);
    expect(remixSlideshow).toHaveBeenCalledWith("user-A", uid1, "track_1");
    expect(renderSlideshow).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([0,1,2,3,4,6])("rejects %i images before invoking implementation", async (count) => {
    expect((await render(request({ generationIds: Array.from({length:count}, (_,i) => `${i+1}`.repeat(8)+"-1111-4111-8111-111111111111"), duration: 5, musicId: "" }))).status).toBe(400);
    expect((await remix(request({ generationId: "../other-user", musicId: "" }))).status).toBe(400);
    expect(renderSlideshow).not.toHaveBeenCalled();
    expect(remixSlideshow).not.toHaveBeenCalled();
  });
});
