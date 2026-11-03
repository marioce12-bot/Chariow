import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

const NOTIFICATION_COLUMNS = "id,type,title,body,action_url,category,replies_enabled,metadata,read_at,created_at";

export async function GET() {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const { data, error } = await supabase
    .from("user_notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [], unreadCount: (data ?? []).filter((item) => !item.read_at).length });
}

export async function PATCH(request: Request) {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const body = await request.json().catch(() => null) as { id?: string; read?: boolean; all?: boolean } | null;
  if (body?.all) {
    const { error } = await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: true });
  }
  if (typeof body?.id !== "string" || body.id.length < 10) return NextResponse.json({ error: "Notification invalide" }, { status: 400 });
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: body.read === false ? null : new Date().toISOString() })
    .eq("id", body.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const body = await request.json().catch(() => null) as { notification_id?: string; body?: string } | null;
  const notificationId = typeof body?.notification_id === "string" ? body.notification_id : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (notificationId.length < 10 || !text || text.length > 2000) return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });
  const { data: notification, error: lookupError } = await supabase.from("user_notifications")
    .select("id,replies_enabled").eq("id", notificationId).eq("user_id", user.id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!notification) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!notification.replies_enabled) return NextResponse.json({ error: "Les réponses sont désactivées pour ce message." }, { status: 403 });
  const { error } = await supabase.from("user_notification_replies").insert({ notification_id: notification.id, user_id: user.id, body: text });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sent: true });
}
