import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchMetaResources } from "@/lib/meta/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const accountId = new URL(request.url).searchParams.get("account_id");
  const query = supabase.from("meta_ad_accounts").select("id,meta_account_id,access_token_encrypted,account_status").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error } = await (accountId ? query.eq("id", accountId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: "Impossible de charger le compte Meta" }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte Meta connecté" }, { status: 404 });
  try {
    const resources = await fetchMetaResources(`act_${account.meta_account_id}`, decryptSecret(account.access_token_encrypted));
    const status = Number(resources.account.account_status ?? account.account_status ?? 0);
    return NextResponse.json({ account: { id: account.id, status, restricted: status !== 1 }, account_quality_url: "https://www.facebook.com/accountquality", pages: resources.pages.map((page: Record<string, unknown>) => ({ id: page.id, name: page.name, instagram_business_account: page.instagram_business_account ?? null })), pixels: resources.pixels.map((pixel: Record<string, unknown>) => ({ id: pixel.id, name: pixel.name })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ressources Meta indisponibles" }, { status: 502 });
  }
}
