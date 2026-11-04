import { NextResponse } from "next/server";

// Endpoint conservé pour le webhook Supabase existant. Aucune notification
// administrateur n'est envoyée lors de la création d'un compte.
export async function POST(request: Request) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (secret) {
    const authorization = request.headers.get("authorization") ?? "";
    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  return NextResponse.json({ received: true });
}
