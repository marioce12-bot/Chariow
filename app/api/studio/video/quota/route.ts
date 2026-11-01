import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await createAdminClient().rpc("get_studio_generation_quota", {
    p_user_id: user.id,
    p_generation_kind: "video",
  });
  if (error || !data) {
    return NextResponse.json(
      { error: "Le quota vidéo n'est pas encore disponible." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json({
    quota_date: data.quota_date,
    used: data.used,
    daily_video_limit: data.daily_limit,
    reset_at: data.reset_at,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
