import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackBrevoEvent, upsertBrevoContact } from "@/lib/email";

// Synchronise le contact et l'événement d'inscription dans Brevo.
// L'événement démarre l'automatisation; les emails de confirmation restent gérés par Supabase Auth.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; fullName?: string } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Email requis" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("full_name").eq("email", email).maybeSingle();

  const name = data?.full_name || body?.fullName?.trim() || "Utilisateur";
  await upsertBrevoContact(email, { FULL_NAME: name, CHARIOW_CONNECTED: false });
  await trackBrevoEvent("vendeo_signup", email, { full_name: name });

  return NextResponse.json({ ok: true });
}
