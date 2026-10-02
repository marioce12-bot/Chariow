// Rattachement automatique « campagne Chariow » -> « campagne pub (Meta/TikTok) ».
//
// Chaque vente Chariow porte (quand elle vient d'une campagne trackée) un
// chariow_campaign_id / chariow_campaign_name. Le pilotage automatique a besoin
// de savoir à quelle campagne pub rattacher ces ventes (tables
// meta_campaign_mappings / tiktok_campaign_mappings), sinon il retombe sur
// « toutes les ventes du produit », ce qui gonfle le ROAS.
//
// Règle volontairement CONSERVATRICE (un faux rattachement est pire que pas de
// rattachement) : on ne mappe que si
//  - l'ID de la campagne pub (Meta/TikTok) apparaît dans l'id ou le nom de la
//    campagne Chariow (ex. utm_campaign={campaign.id}), ou
//  - le nom de la campagne Chariow est strictement égal (casse ignorée) au titre
//    de la campagne pub, avec au moins 4 caractères.
// Tout le reste se fait manuellement via /api/campaign-mappings.

type SaleCampaign = { chariow_campaign_id?: string | null; chariow_campaign_name?: string | null };

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const TABLES = {
  meta: { table: "meta_campaign_mappings", externalField: "meta_campaign_id", nameField: "meta_campaign_name" },
  tiktok: { table: "tiktok_campaign_mappings", externalField: "tiktok_campaign_id", nameField: "tiktok_campaign_name" },
} as const;

function matches(chariow: { id: string; name: string | null }, ad: { external_campaign_id: string; title: string | null }) {
  const external = ad.external_campaign_id;
  if (external && (chariow.id.includes(external) || norm(chariow.name).includes(external))) return true;
  const title = norm(ad.title);
  return title.length >= 4 && norm(chariow.name) === title;
}

export async function autoMapChariowCampaigns(supabase: any, store: { id: string; user_id: string }, sales: SaleCampaign[]) {
  const seen = new Map<string, { id: string; name: string | null }>();
  for (const sale of sales) {
    const id = sale.chariow_campaign_id;
    if (id && !seen.has(id)) seen.set(id, { id, name: sale.chariow_campaign_name ?? null });
  }
  if (!seen.size) return 0;

  const { data: adCampaigns } = await supabase
    .from("ad_campaigns")
    .select("platform,external_campaign_id,title,product_name")
    .eq("user_id", store.user_id)
    .eq("store_id", store.id)
    .in("platform", ["meta", "tiktok"])
    .not("external_campaign_id", "is", null);

  let mapped = 0;
  for (const chariow of seen.values()) {
    for (const ad of (adCampaigns ?? []) as Array<{ platform: "meta" | "tiktok"; external_campaign_id: string; title: string | null; product_name: string | null }>) {
      if (!matches(chariow, ad)) continue;
      const cfg = TABLES[ad.platform];
      const { error } = await supabase.from(cfg.table).upsert(
        {
          user_id: store.user_id,
          store_id: store.id,
          [cfg.externalField]: ad.external_campaign_id,
          [cfg.nameField]: ad.title || ad.product_name || null,
          chariow_campaign_id: chariow.id,
          chariow_campaign_name: chariow.name,
          mapping_level: "campaign",
          status: "active",
        },
        { onConflict: `user_id,store_id,${cfg.externalField},chariow_campaign_id,mapping_level`, ignoreDuplicates: true },
      );
      if (error) console.error("auto-map: upsert failed", cfg.table, error.message);
      else mapped += 1;
    }
  }
  return mapped;
}
