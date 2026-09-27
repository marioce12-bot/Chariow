import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

// Renvoie une conversation précise et ses messages, pour la reprise dans l'historique.
export async function GET(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, role, content, attachments, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 });

  return NextResponse.json({ conversation, messages });
}
