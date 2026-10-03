import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const isRecovery = url.searchParams.get("next") === "/reset-password" || type === "recovery";

  let failed = false;
  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
  }

  const response = NextResponse.redirect(
    new URL(isRecovery ? (failed ? "/forgot-password" : "/reset-password") : "/dashboard", request.url),
  );
  response.cookies.delete("vendeo_pw_reset");
  return response;
}
