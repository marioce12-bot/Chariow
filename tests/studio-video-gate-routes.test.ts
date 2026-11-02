import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  packagedVideoProbe: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/studio/video-probe-runtime", () => ({ packagedVideoProbe: mocks.packagedVideoProbe }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));

import { GET, POST } from "@/app/api/studio/video/route";

const originalVercelEnv = process.env.VERCEL_ENV;
const originalServerFlag = process.env.STUDIO_VIDEO_RENDER_ENABLED;
const originalPublicFlag = process.env.NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED;

function setEnv(name: "VERCEL_ENV" | "STUDIO_VIDEO_RENDER_ENABLED" | "NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERCEL_ENV = "preview";
  process.env.STUDIO_VIDEO_RENDER_ENABLED = "true";
  process.env.NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED = "true";
  mocks.requireUser.mockResolvedValue({ user: { id: "test-user" }, response: null, supabase: {} });
  mocks.packagedVideoProbe.mockReturnValue("/mock/ffprobe");
});

afterEach(() => {
  setEnv("VERCEL_ENV", originalVercelEnv);
  setEnv("STUDIO_VIDEO_RENDER_ENABLED", originalServerFlag);
  setEnv("NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED", originalPublicFlag);
});

describe("Studio video render route gate", () => {
  it("reports ready in Production without either legacy flag", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.STUDIO_VIDEO_RENDER_ENABLED;
    delete process.env.NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED;

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ready: true, binaries: { ffprobe: true } });
    expect(mocks.packagedVideoProbe).toHaveBeenCalledOnce();
  });

  it("locks readiness on every Preview even when both legacy flags are true", async () => {
    const response = await GET();

    expect(response.status).toBe(423);
    expect(await response.json()).toMatchObject({ ready: false, locked: true, code: "STUDIO_VIDEO_LOCKED" });
    expect(mocks.packagedVideoProbe).not.toHaveBeenCalled();
  });

  it("rejects Preview POST before reading request data or touching credits/providers", async () => {
    const response = await POST(new Request("https://preview.example/api/studio/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
    }));

    expect(response.status).toBe(423);
    expect((await response.json()).code).toBe("STUDIO_VIDEO_LOCKED");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.packagedVideoProbe).not.toHaveBeenCalled();
  });

  it("lets Production reach normal POST validation instead of returning the Preview lock", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await POST(new Request("https://www.vendeo-studio.site/api/studio/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "not-a-uuid" }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Identifiant");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
