import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdmin } from "@/lib/email";

// Notifie les administrateurs d'une nouvelle inscription. Appelé par le client
// juste après supabase.auth.signUp. On vérifie que l'utilisateur existe bien en
// base (profiles) avant d'envoyer, pour éviter les notifications abusives.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; fullName?: string } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Email requis" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("full_name").eq("email", email).maybeSingle();

  const name = data?.full_name || body?.fullName?.trim() || "Utilisateur";
  await notifyAdmin(
    "Nouvelle inscription",
    `<p><strong>${name}</strong> vient de créer un compte avec l'email <strong>${email}</strong>.</p>`
  );

  return NextResponse.json({ ok: true });
}
