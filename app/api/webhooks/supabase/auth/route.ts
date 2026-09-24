import { NextResponse } from "next/server";
import { notifyAdmin } from "@/lib/email";

// Reçoit le webhook de base de données Supabase déclenché à chaque insertion
// dans la table `profiles` (créée par le trigger handle_new_user à l'inscription).
// Configuration : Supabase → Database → Webhooks → table `profiles`, event INSERT.
// Accepte aussi l'ancien format de hook Auth (user.created) par compatibilité.

type SupabaseDbWebhook = {
  type?: string;
  table?: string;
  schema?: string;
  record?: {
    id?: string;
    email?: string;
    full_name?: string;
  };
};

type SupabaseAuthHook = {
  type?: string;
  user?: {
    id?: string;
    email?: string;
    user_metadata?: { full_name?: string; name?: string };
  };
};

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (secret) {
    const authorization = request.headers.get("authorization") ?? "";
    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  const payload = (await request.json().catch(() => null)) as (SupabaseDbWebhook | SupabaseAuthHook) | null;
  if (!payload) return NextResponse.json({ received: true });

  let email: string | undefined;
  let name = "Utilisateur";

  if ("record" in payload && payload.record?.email) {
    // Format Database Webhook (insertion dans `profiles`)
    email = payload.record.email;
    name = payload.record.full_name || name;
  } else if ("user" in payload && payload.user?.email && payload.type === "user.created") {
    // Format Auth Hook (user.created)
    email = payload.user.email;
    name = payload.user.user_metadata?.full_name ?? payload.user.user_metadata?.name ?? name;
  }

  if (!email) return NextResponse.json({ received: true });

  await notifyAdmin(
    "Nouvelle inscription",
    `<p><strong>${name}</strong> vient de créer un compte avec l'email <strong>${email}</strong>.</p>`
  );

  return NextResponse.json({ received: true });
}
