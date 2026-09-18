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
    // Les pages sont ce dont le wizard a le plus besoin (choix de la page Facebook) :
    // si seul l'appel "compte" échoue (ex. champ restreint, permission manquante), on
    // ne bloque plus tout — les pages restent utilisables, et le statut du compte
    // retombe simplement sur la valeur déjà connue en base plutôt que sur une erreur.
    if (!Object.keys(resources.account).length && resources.pagesError) {
      // Les deux appels ont échoué : là, il n'y a vraiment rien à afficher.
      return NextResponse.json({ error: resources.accountError || resources.pagesError }, { status: 502 });
    }
    const status = Number((resources.account as Record<string, unknown>).account_status ?? account.account_status ?? 0);
    return NextResponse.json({
      account: { id: account.id, status, restricted: resources.accountError ? null : status !== 1 },
      account_error: resources.accountError,
      account_quality_url: "https://www.facebook.com/accountquality",
      pages: resources.pages.map((page) => {
        const item = page as Record<string, unknown>;
        return { id: item.id, name: item.name, instagram_business_account: item.instagram_business_account ?? null };
      }),
      pages_error: resources.pagesError,
      pixels: resources.pixels.map((pixel) => {
        const item = pixel as Record<string, unknown>;
        return { id: item.id, name: item.name };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ressources Meta indisponibles" }, { status: 502 });
  }
}
