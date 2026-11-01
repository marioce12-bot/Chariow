import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  packagedVideoProbe: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/studio/video-probe-runtime", () => ({ packagedVideoProbe: mocks.packagedVideoProbe }));
vi.mock("workflow/api", () => ({ start: mocks.start }));

import { GET, POST } from "@/app/api/studio/video/route";

const originalVercelEnv = process.env.VERCEL_ENV;
const originalServerFlag = process.env.STUDIO_VIDEO_RENDER_ENABLED;
const originalPublicFlag = process.env.NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED;

function setEnv(name: "VERCEL_ENV" | "STUDIO_VIDEO_RENDER_ENABLED" | "NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const environmentCases = [
  { name: "Preview", vercelEnv: "preview", enabled: true },
  { name: "Production", vercelEnv: "production", enabled: true },
  { name: "development", vercelEnv: "development", enabled: false },
  { name: "local", vercelEnv: "local", enabled: false },
  { name: "unknown", vercelEnv: "test", enabled: false },
  { name: "unset", vercelEnv: undefined, enabled: false },
];

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
  it.each(environmentCases)("GET: $name environment follows the gate", async ({ vercelEnv, enabled }) => {
    setEnv("VERCEL_ENV", vercelEnv);

    const response = await GET();

    if (enabled) {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ready: true, binaries: { ffprobe: true } });
      expect(mocks.packagedVideoProbe).toHaveBeenCalledOnce();
    } else {
      expect(response.status).toBe(423);
      expect(await response.json()).toMatchObject({ ready: false, locked: true, code: "STUDIO_VIDEO_LOCKED" });
      expect(mocks.packagedVideoProbe).not.toHaveBeenCalled();
    }
  });

  it.each(environmentCases)("POST: $name environment follows the gate and cannot start a render in this test", async ({ vercelEnv, enabled }) => {
    setEnv("VERCEL_ENV", vercelEnv);

    const response = await POST(new Request("https://preview.example/api/studio/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Invalid ID proves the allowed request reaches ordinary validation and stops before credits/providers.
      body: JSON.stringify({ id: "not-a-uuid" }),
    }));

    if (enabled) {
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("Identifiant");
    } else {
      expect(response.status).toBe(423);
      expect((await response.json()).code).toBe("STUDIO_VIDEO_LOCKED");
    }
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
