import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { searchMetaInterests } from "@/lib/meta/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const accountId = url.searchParams.get("account_id");
  if (query.length < 2) return NextResponse.json({ results: [] });

  let accountsQuery = supabase.from("meta_ad_accounts")
    .select("id,access_token_encrypted")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (accountId) accountsQuery = accountsQuery.eq("id", accountId);
  const { data: account } = await accountsQuery.limit(1).maybeSingle();
  if (!account) return NextResponse.json({ results: [] });

  try {
    const results = await searchMetaInterests(query, decryptSecret(account.access_token_encrypted));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
