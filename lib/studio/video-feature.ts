import { createAdminClient } from "@/lib/supabase/admin";

const FEATURE_KEY = "studio_video_enabled";
const CACHE_MS = 30_000;
let cached: { enabled: boolean; expiresAt: number } | null = null;

/** Preview stays locked; Production is additionally controlled by a runtime Supabase flag. */
export function isStudioVideoRenderEnabledForPreview() {
  return process.env.VERCEL_ENV === "production";
}

export async function isStudioVideoEnabled() {
  if (!isStudioVideoRenderEnabledForPreview()) return false;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.enabled;
  try {
    const { data, error } = await createAdminClient()
      .from("feature_flags")
      .select("enabled")
      .eq("key", FEATURE_KEY)
      .maybeSingle();
    const enabled = !error && data?.enabled === true;
    cached = { enabled, expiresAt: now + CACHE_MS };
    return enabled;
  } catch {
    cached = { enabled: false, expiresAt: now + CACHE_MS };
    return false;
  }
}

export function resetStudioVideoFlagCacheForTests() {
  cached = null;
}
