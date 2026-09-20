import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { admin, response } = await requireAdmin(["super_admin"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès super administrateur requis" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.user_id === "string" ? body.user_id : "";
    const credits = Number(body?.credits);
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) : null;
    const grantId = typeof body?.grant_id === "string" && body.grant_id ? body.grant_id : crypto.randomUUID();
    if (!/^[0-9a-fA-F-]{36}$/.test(userId)) return NextResponse.json({ error: "Identifiant utilisateur invalide." }, { status: 400 });
    if (!Number.isInteger(credits) || credits < 1 || credits > 100000) return NextResponse.json({ error: "La quantité doit être comprise entre 1 et 100 000 crédits." }, { status: 400 });
    const service = createAdminClient();
    const result = await service.rpc("admin_grant_credits", { target_user_id: userId, amount: credits, grant_id: grantId, reason });
    if (result.error) {
      if (result.error.message.includes("user_not_found")) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
      throw result.error;
    }
    const payload = result.data as { ok?: boolean; balance?: number };
    await service.rpc("write_platform_audit", { target_user_id: null, action_name: "admin_credits_granted", resource_name: "credit_account", resource_key: userId, metadata_value: { credits, reason, grant_id: grantId } });
    return NextResponse.json({ ok: true, balance: payload.balance ?? 0 });
  } catch (error) {
    console.error("Admin credit grant error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Impossible d'offrir les crédits." }, { status: 500 });
  }
}
