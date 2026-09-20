import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { signedStudioUrl } from "@/lib/studio/media";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const cursor = url.searchParams.get("cursor");
  let query = supabase.from("studio_generations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
  if (kind === "image" || kind === "video") query = query.eq("kind", kind);
  if (cursor) query = query.lt("created_at", cursor);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = await Promise.all((data ?? []).map(async (item) => ({ ...item, mediaUrl: item.storage_path ? await signedStudioUrl(item.storage_path).catch(() => null) : null })));
  return NextResponse.json({ items, nextCursor: items.length === 20 ? items[items.length - 1].created_at : null });
}
