import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { readStudioHistory } from "@/lib/studio/history";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  try {
    const result = await readStudioHistory(supabase, user.id, url.searchParams.get("kind"), url.searchParams.get("cursor"));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historique temporairement indisponible.";
    return NextResponse.json({ error: message }, { status: message.includes("Curseur") ? 400 : 500 });
  }
}
