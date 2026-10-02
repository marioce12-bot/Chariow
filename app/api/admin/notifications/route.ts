import { NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_RECIPIENTS = 5000;

export async function GET() {
  const { admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const service = createAdminClient();
  const { data, error } = await service
    .from("user_notifications")
    .select("id,user_id,type,title,body,action_url,read_at,created_at,profiles(email,full_name)")
    .eq("type", "admin")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const body = await request.json().catch(() => null) as {
    title?: string;
    message?: string;
    body?: string;
    action_url?: string;
    audience?: "all" | "selected";
    user_ids?: string[];
  } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const message = typeof (body?.message ?? body?.body) === "string" ? String(body?.message ?? body?.body).trim() : "";
  const audience = body?.audience === "selected" ? "selected" : "all";
  const userIds = Array.isArray(body?.user_ids) ? [...new Set(body.user_ids.filter((id): id is string => typeof id === "string" && id.length > 10))] : [];
  const actionUrl = typeof body?.action_url === "string" && body.action_url.startsWith("/") ? body.action_url.slice(0, 300) : null;
  if (title.length < 1 || title.length > 160) return NextResponse.json({ error: "Le titre doit contenir entre 1 et 160 caractères." }, { status: 400 });
  if (message.length < 1 || message.length > 4000) return NextResponse.json({ error: "Le message doit contenir entre 1 et 4 000 caractères." }, { status: 400 });
  if (audience === "selected" && !userIds.length) return NextResponse.json({ error: "Sélectionne au moins un utilisateur." }, { status: 400 });
  const service = createAdminClient();
  let recipients: string[] = userIds;
  if (audience === "all") {
    const { data, error } = await service.from("profiles").select("id").limit(MAX_RECIPIENTS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    recipients = (data ?? []).map((item) => item.id);
  }
  if (recipients.length > MAX_RECIPIENTS) return NextResponse.json({ error: `Limite de ${MAX_RECIPIENTS} destinataires par envoi.` }, { status: 400 });
  const rows = recipients.map((user_id) => ({ user_id, type: "admin", title, body: message, action_url: actionUrl, metadata: { audience, sent_by: admin.id } }));
  if (rows.length) {
    const { error } = await service.from("user_notifications").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (admin.id !== "password-admin") await writeAdminAudit(supabase, admin.id, "notification_sent", "user_notifications", null, { audience, recipient_count: recipients.length, title });
  return NextResponse.json({ sent: recipients.length });
}
