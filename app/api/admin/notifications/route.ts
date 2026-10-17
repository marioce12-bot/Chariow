import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_RECIPIENTS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const { admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const { data, error } = await createAdminClient().from("user_notifications")
    .select("id,user_id,type,title,body,action_url,read_at,created_at,metadata,profiles(email,full_name)")
    .eq("type", "admin").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const message = typeof (body?.message ?? body?.body) === "string" ? String(body.message ?? body.body).trim() : "";
  if (body?.audience !== "all" && body?.audience !== "selected") return NextResponse.json({ error: "Choisis les destinataires." }, { status: 400 });
  const audience = body.audience as "all" | "selected";
  const rawIds = body.user_ids;
  if (audience === "selected" && (!Array.isArray(rawIds) || rawIds.some((id: unknown) => typeof id !== "string" || !UUID.test(id)))) return NextResponse.json({ error: "Sélection d’utilisateurs invalide." }, { status: 400 });
  const userIds = Array.isArray(rawIds) ? [...new Set<string>(rawIds)] : [];
  const actionUrl = typeof body.action_url === "string" ? body.action_url.trim() : "";
  if (actionUrl && (!actionUrl.startsWith("/") || actionUrl.startsWith("//") || /[\\\s\u0000-\u001f]/.test(actionUrl) || actionUrl.length > 300)) return NextResponse.json({ error: "Le lien doit être un chemin interne valide (ex. /dashboard)." }, { status: 400 });
  if (!title || title.length > 160) return NextResponse.json({ error: "Le titre doit contenir entre 1 et 160 caractères." }, { status: 400 });
  if (!message || message.length > 4000) return NextResponse.json({ error: "Le message doit contenir entre 1 et 4 000 caractères." }, { status: 400 });
  if (audience === "selected" && !userIds.length) return NextResponse.json({ error: "Sélectionne au moins un utilisateur." }, { status: 400 });
  if (userIds.length > MAX_RECIPIENTS) return NextResponse.json({ error: `Limite de ${MAX_RECIPIENTS} destinataires par envoi.` }, { status: 400 });
  const service = createAdminClient();
  let recipients: string[] = [];
  if (audience === "all") {
    const { count, error } = await service.from("profiles").select("id", { count: "exact", head: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((count ?? 0) > MAX_RECIPIENTS) return NextResponse.json({ error: `Plus de ${MAX_RECIPIENTS} utilisateurs : sélectionne un groupe de destinataires.` }, { status: 400 });
    // Supabase caps each response at 1,000 rows. Never silently truncate a broadcast.
    for (let offset = 0; offset < (count ?? 0); offset += 500) {
      const { data, error: pageError } = await service.from("profiles").select("id").order("id").range(offset, offset + 499);
      if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
      recipients.push(...(data ?? []).map((item) => item.id));
    }
  } else {
    for (let offset = 0; offset < userIds.length; offset += 200) {
      const { data, error } = await service.from("profiles").select("id").in("id", userIds.slice(offset, offset + 200));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      recipients.push(...(data ?? []).map((item) => item.id));
    }
    if (recipients.length !== userIds.length) return NextResponse.json({ error: "Certains utilisateurs sélectionnés n’existent plus. Actualise la sélection." }, { status: 400 });
  }
  if (!recipients.length) return NextResponse.json({ error: "Aucun destinataire disponible." }, { status: 400 });
  const broadcastId = randomUUID();
  const rows = recipients.map((user_id) => ({ user_id, type: "admin", title, body: message, action_url: actionUrl || null, metadata: { audience, sent_by: admin.id, broadcast_id: broadcastId } }));
  const { error } = await service.from("user_notifications").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (admin.id !== "password-admin") await writeAdminAudit(supabase, admin.id, "notification_sent", "user_notifications", null, { audience, recipient_count: recipients.length, title, broadcast_id: broadcastId });
  return NextResponse.json({ sent: recipients.length });
}

export async function DELETE(request: Request) {
  const { supabase, admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ error: "Notification invalide." }, { status: 400 });
  const service = createAdminClient();
  const { data: item, error: lookupError } = await service.from("user_notifications").select("id,metadata").eq("id", body.id).eq("type", "admin").maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Cette notification n’existe plus." }, { status: 404 });
  const broadcastId = item.metadata?.broadcast_id;
  let deletion = service.from("user_notifications").delete({ count: "exact" }).eq("type", "admin");
  if (body.all_recipients === true && typeof broadcastId === "string" && UUID.test(broadcastId)) deletion = deletion.eq("metadata->>broadcast_id", broadcastId);
  else deletion = deletion.eq("id", item.id);
  const { error, count } = await deletion;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (admin.id !== "password-admin") await writeAdminAudit(supabase, admin.id, "notification_deleted", "user_notifications", item.id, { deleted: count, broadcast_id: broadcastId ?? null });
  return NextResponse.json({ deleted: count ?? 0 });
}
