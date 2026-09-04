import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { exchangeTikTokAuthCode, fetchTikTokAdvertiserInfo } from "@/lib/tiktok/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const redirect = (status: string) => NextResponse.redirect(new URL(`/dashboard?tiktok=${status}`, request.url));
  const state = url.searchParams.get("state") ?? "";
  const { data: stateRows } = await supabase.from("tiktok_oauth_states").select("id,state_hash,expires_at").eq("user_id", user.id);
  const stateRow = (stateRows ?? []).find((row) => {
    try { return decryptSecret(row.state_hash) === state && new Date(row.expires_at).getTime() > Date.now(); } catch { return false; }
  });
  if (!stateRow) return redirect("failed");
  await supabase.from("tiktok_oauth_states").delete().eq("id", stateRow.id);
  // TikTok renvoie "auth_code" (parfois documenté "code" selon les endpoints legacy) — on gère les deux.
  const authCode = url.searchParams.get("auth_code") ?? url.searchParams.get("code");
  if (!authCode) return redirect("failed");

  try {
    const token = await exchangeTikTokAuthCode(authCode);
    if (!token?.access_token) return redirect("failed");
    const integration = await supabase.from("tiktok_integrations").upsert({
      user_id: user.id,
      access_token_encrypted: encryptSecret(token.access_token),
      scope: (token.scope ?? []).map(String),
      is_active: true,
      last_error: null,
    }, { onConflict: "user_id" }).select("id").single();
    if (integration.error || !integration.data) return redirect("failed");
    const advertiserIds = token.advertiser_ids ?? [];
    if (advertiserIds.length) {
      const infos = await fetchTikTokAdvertiserInfo(advertiserIds, token.access_token);
      for (const info of infos) {
        const row = info as Record<string, unknown>;
        const advertiserId = String(row.advertiser_id ?? "");
        if (!advertiserId) continue;
        await supabase.from("tiktok_ad_accounts").upsert({
          user_id: user.id,
          tiktok_integration_id: integration.data.id,
          tiktok_advertiser_id: advertiserId,
          name: typeof row.name === "string" ? row.name : `Compte ${advertiserId}`,
          currency: typeof row.currency === "string" ? row.currency : "XOF",
          status: typeof row.status === "string" ? row.status : null,
          is_active: true,
        }, { onConflict: "user_id,tiktok_advertiser_id" });
      }
    }
    return redirect("connected");
  } catch (error) {
    console.error("TikTok OAuth callback failed", error instanceof Error ? error.message : error);
    return redirect("failed");
  }
}
