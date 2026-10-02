import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// Rattachement manuel campagne pub (Meta/TikTok) <-> campagne Chariow, utilisé
// par le pilotage automatique pour attribuer les ventes réelles à la bonne
// campagne (sinon repli sur « toutes les ventes du produit »).

const CONFIG = {
  meta: { table: "meta_campaign_mappings", externalField: "meta_campaign_id", nameField: "meta_campaign_name" },
  tiktok: { table: "tiktok_campaign_mappings", externalField: "tiktok_campaign_id", nameField: "tiktok_campaign_name" },
} as const;

type Platform = keyof typeof CONFIG;
const isPlatform = (value: unknown): value is Platform => value === "meta" || value === "tiktok";

// Liste les rattachements de l'utilisateur + les campagnes Chariow vues dans ses
// ventes (pour proposer un choix dans l'interface).
export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const [meta, tiktok, stores] = await Promise.all([
    supabase.from(CONFIG.meta.table).select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from(CONFIG.tiktok.table).select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("stores").select("id").eq("user_id", user.id),
  ]);
  if (meta.error || tiktok.error) return NextResponse.json({ error: "Impossible de charger les rattachements" }, { status: 500 });

  const storeIds = (stores.data ?? []).map((s: { id: string }) => s.id);
  const chariowCampaigns = new Map<string, { id: string; name: string | null }>();
  if (storeIds.length) {
    const { data: sales } = await supabase
      .from("chariow_sales")
      .select("chariow_campaign_id,chariow_campaign_name")
      .in("store_id", storeIds)
      .not("chariow_campaign_id", "is", null)
      .limit(1000);
    for (const sale of (sales ?? []) as Array<{ chariow_campaign_id: string; chariow_campaign_name: string | null }>) {
      if (!chariowCampaigns.has(sale.chariow_campaign_id)) chariowCampaigns.set(sale.chariow_campaign_id, { id: sale.chariow_campaign_id, name: sale.chariow_campaign_name });
    }
  }

  return NextResponse.json({
    mappings: [
      ...(meta.data ?? []).map((m: Record<string, unknown>) => ({ ...m, platform: "meta" })),
      ...(tiktok.data ?? []).map((m: Record<string, unknown>) => ({ ...m, platform: "tiktok" })),
    ],
    chariow_campaigns: [...chariowCampaigns.values()],
  });
}

// Body : { campaign_id: <ad_campaigns.id>, chariow_campaign_id: string, chariow_campaign_name?: string }
export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.campaign_id !== "string" || typeof body.chariow_campaign_id !== "string" || !body.chariow_campaign_id.trim()) {
    return NextResponse.json({ error: "campaign_id et chariow_campaign_id sont requis" }, { status: 400 });
  }

  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("platform,store_id,external_campaign_id,title,product_name")
    .eq("id", body.campaign_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!campaign || !isPlatform(campaign.platform)) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  if (!campaign.external_campaign_id || !campaign.store_id) {
    return NextResponse.json({ error: "Cette campagne n'a pas encore été lancée côté plateforme publicitaire" }, { status: 409 });
  }

  const cfg = CONFIG[campaign.platform as Platform];
  const { data, error } = await supabase
    .from(cfg.table)
    .upsert(
      {
        user_id: user.id,
        store_id: campaign.store_id,
        [cfg.externalField]: campaign.external_campaign_id,
        [cfg.nameField]: campaign.title || campaign.product_name || null,
        chariow_campaign_id: body.chariow_campaign_id.trim(),
        chariow_campaign_name: typeof body.chariow_campaign_name === "string" ? body.chariow_campaign_name.trim() || null : null,
        mapping_level: "campaign",
        status: "active",
      },
      { onConflict: `user_id,store_id,${cfg.externalField},chariow_campaign_id,mapping_level` },
    )
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "Impossible d'enregistrer le rattachement" }, { status: 500 });
  return NextResponse.json({ mapping: { id: data.id, platform: campaign.platform } }, { status: 201 });
}

// ?platform=meta|tiktok&id=<mapping id>
export async function DELETE(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const platform = params.get("platform");
  const id = params.get("id");
  if (!isPlatform(platform) || !id) return NextResponse.json({ error: "platform et id requis" }, { status: 400 });
  const { error } = await supabase.from(CONFIG[platform].table).delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Impossible de supprimer le rattachement" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
