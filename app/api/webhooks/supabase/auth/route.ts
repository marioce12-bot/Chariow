import { NextResponse } from "next/server";
import { notifyAdmin } from "@/lib/email";

// Reçoit les hooks d'authentification Supabase (Authentication → Hooks).
// On utilise ici l'événement "Nouvel utilisateur" (user.created) pour notifier
// les administrateurs à chaque inscription. L'URL doit être configurée dans le
// dashboard Supabase avec l'en-tête Authorization : Bearer <SUPABASE_AUTH_HOOK_SECRET>.

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

  const hook = (await request.json().catch(() => null)) as SupabaseAuthHook | null;
  if (!hook || hook.type !== "user.created" || !hook.user?.email) {
    return NextResponse.json({ received: true });
  }

  const name = hook.user.user_metadata?.full_name ?? hook.user.user_metadata?.name ?? "Utilisateur";
  await notifyAdmin(
    "Nouvelle inscription",
    `<p><strong>${name}</strong> vient de créer un compte avec l'email <strong>${hook.user.email}</strong>.</p>`
  );

  return NextResponse.json({ received: true });
}
