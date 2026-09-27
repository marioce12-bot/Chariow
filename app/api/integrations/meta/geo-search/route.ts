import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { searchMetaGeoLocations } from "@/lib/meta/api";

/**
 * Backend du widget de recherche d'audience (étape 3 du wizard "Lancer une
 * pub") : renvoie les régions/villes Meta correspondant à `q`. Les pays sont
 * cherchés localement côté client (lib/geo/countries.ts) — cette route ne
 * couvre donc que région/ville, et seulement pour Meta (TikTok ne partage pas
 * les mêmes identifiants de lieu et reste limité au ciblage par pays).
 *
 * Si aucun compte Meta actif n'est connecté, ou si Meta échoue/est lent, on
 * renvoie simplement une liste vide plutôt qu'une erreur : le widget se rabat
 * alors sur les seules suggestions de pays, sans bloquer la recherche.
 */
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const accountId = url.searchParams.get("account_id");
  if (q.length < 2) return NextResponse.json({ results: [] });

  const query = supabase.from("meta_ad_accounts").select("id,access_token_encrypted").eq("user_id", user.id).eq("is_active", true);
  const { data: account } = await (accountId ? query.eq("id", accountId).maybeSingle() : query.limit(1).maybeSingle());
  if (!account) return NextResponse.json({ results: [] });

  try {
    const results = await searchMetaGeoLocations(q, decryptSecret(account.access_token_encrypted));
    return NextResponse.json({ results });
  } catch {
    // Voir commentaire ci-dessus : on ne fait pas échouer la recherche pour autant.
    return NextResponse.json({ results: [] });
  }
}
