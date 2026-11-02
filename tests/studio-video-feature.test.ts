import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStudioVideoEnabled, isStudioVideoRenderEnabledForPreview, resetStudioVideoFlagCacheForTests } from "@/lib/studio/video-feature";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const mockedCreateAdminClient = vi.mocked(createAdminClient);

const originalEnv = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  STUDIO_VIDEO_RENDER_ENABLED: process.env.STUDIO_VIDEO_RENDER_ENABLED,
  NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED: process.env.NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED,
};

function setEnv(key: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  resetStudioVideoFlagCacheForTests();
  mockedCreateAdminClient.mockReset();
  for (const [key, value] of Object.entries(originalEnv)) {
    setEnv(key as keyof typeof originalEnv, value);
  }
});

describe("Studio video render gate", () => {
  it.each([
    {
      name: "Production is enabled without either legacy flag",
      vercelEnv: "production",
      serverFlag: undefined,
      publicFlag: undefined,
      enabled: true,
    },
    {
      name: "Production remains enabled regardless of stale flag values",
      vercelEnv: "production",
      serverFlag: "false",
      publicFlag: "false",
      enabled: true,
    },
    {
      name: "Preview stays locked even when both legacy flags are true",
      vercelEnv: "preview",
      serverFlag: "true",
      publicFlag: "true",
      enabled: false,
    },
    {
      name: "Preview stays locked when no flags are set",
      vercelEnv: "preview",
      serverFlag: undefined,
      publicFlag: undefined,
      enabled: false,
    },
    {
      name: "local and unknown environments fail closed",
      vercelEnv: undefined,
      serverFlag: "true",
      publicFlag: "true",
      enabled: false,
    },
  ])("$name", ({ vercelEnv, serverFlag, publicFlag, enabled }) => {
    setEnv("VERCEL_ENV", vercelEnv);
    setEnv("STUDIO_VIDEO_RENDER_ENABLED", serverFlag);
    setEnv("NEXT_PUBLIC_STUDIO_VIDEO_RENDER_ENABLED", publicFlag);

    expect(isStudioVideoRenderEnabledForPreview()).toBe(enabled);
  });

  it("reads the production flag and caches it", async () => {
    setEnv("VERCEL_ENV", "production");
    const maybeSingle = vi.fn().mockResolvedValue({ data: { enabled: true }, error: null });
    mockedCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    } as never);

    await expect(isStudioVideoEnabled()).resolves.toBe(true);
    await expect(isStudioVideoEnabled()).resolves.toBe(true);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the runtime flag cannot be read", async () => {
    setEnv("VERCEL_ENV", "production");
    mockedCreateAdminClient.mockImplementation(() => { throw new Error("missing table"); });
    await expect(isStudioVideoEnabled()).resolves.toBe(false);
  });
});
