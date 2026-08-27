import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null, response: NextResponse.json({ error: "Authentification requise" }, { status: 401 }) };
  return { supabase, user, response: null };
}
