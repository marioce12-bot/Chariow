import { afterEach, describe, expect, it } from "vitest";
import { isStudioVideoRenderEnabledForPreview } from "@/lib/studio/video-feature";

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
});
