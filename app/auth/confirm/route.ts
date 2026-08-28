import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const next = url.searchParams.get("next");
  return NextResponse.redirect(new URL(next === "/reset-password" ? "/reset-password" : "/dashboard", request.url));
}
