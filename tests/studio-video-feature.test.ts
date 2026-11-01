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
      name: "Preview is enabled without legacy flags",
      vercelEnv: "preview",
      serverFlag: undefined,
      publicFlag: undefined,
      enabled: true,
    },
    {
      name: "Preview stays enabled when legacy flags are false",
      vercelEnv: "preview",
      serverFlag: "false",
      publicFlag: "false",
      enabled: true,
    },
    {
      name: "Production is enabled without legacy flags",
      vercelEnv: "production",
      serverFlag: undefined,
      publicFlag: undefined,
      enabled: true,
    },
    {
      name: "Production stays enabled regardless of stale flag values",
      vercelEnv: "production",
      serverFlag: "false",
      publicFlag: "false",
      enabled: true,
    },
    {
      name: "development fails closed even when legacy flags are true",
      vercelEnv: "development",
      serverFlag: "true",
      publicFlag: "true",
      enabled: false,
    },
    {
      name: "local fails closed even when legacy flags are true",
      vercelEnv: "local",
      serverFlag: "true",
      publicFlag: "true",
      enabled: false,
    },
    {
      name: "unknown environments fail closed",
      vercelEnv: "test",
      serverFlag: "true",
      publicFlag: "true",
      enabled: false,
    },
    {
      name: "an unset Vercel environment fails closed",
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
