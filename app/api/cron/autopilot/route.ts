import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { computeAutopilotDecision } from "@/lib/autopilot";
import { pauseMetaCampaign } from "@/lib/meta/campaigns";
import { pauseTikTokCampaign } from "@/lib/tiktok/campaigns";
import { fetchTikTokCampaignReport } from "@/lib/tiktok/report";
import { computeCampaignDiagnostics, type Anomaly, type DiagnosticAttributedSale, type DiagnosticInsightRow } from "@/lib/meta/diagnostic";
import { refineAutopilotVerdictWithAI } from "@/lib/ai/autopilot-verdict";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function sumSales(sales: Array<Record<string, unknown>> | null | undefined) {
  let gross = 0;
  let net = 0;
  for (const sale of sales ?? []) {
    gross += num(sale.amount);
    net += num(sale.net_amount);
  }
  return { gross, net, completed: (sales ?? []).length };
}

// Attribution des ventes réelles Chariow à une campagne.
// - Meta : via meta_campaign_mappings (meta_campaign_id -> chariow_campaign_id).
// - TikTok : via tiktok_campaign_mappings (tiktok_campaign_id -> chariow_campaign_id)
//   quand il existe, sinon repli sur le produit (product_id).
async function attributedSales(supabase: any, campaign: any) {
  const from = new Date(campaign.created_at).toISOString();
  const to = new Date().toISOString();

  const mappingTable = campaign.platform === "meta" ? "meta_campaign_mappings" : "tiktok_campaign_mappings";
  const externalIdField = campaign.platform === "meta" ? "meta_campaign_id" : "tiktok_campaign_id";

  const { data: mappings } = await supabase
    .from(mappingTable)
    .select("chariow_campaign_id")
    .eq("user_id", campaign.user_id)
    .eq("store_id", campaign.store_id)
    .eq(externalIdField, campaign.external_campaign_id)
    .eq("status", "active");
  const campaignIds = (mappings ?? []).map((m: { chariow_campaign_id: string }) => m.chariow_campaign_id);

  if (campaignIds.length) {
    const { data: sales } = await supabase
      .from("chariow_sales")
      .select("amount,net_amount,status")
      .eq("store_id", campaign.store_id)
      .in("chariow_campaign_id", campaignIds)
      .eq("status", "completed")
      .gte("occurred_at", from)
      .lte("occurred_at", to);
    return sumSales(sales as Array<Record<string, unknown>> | null);
  }

  // Repli : la campagne promeut un seul produit — on attribue les ventes de ce
  // produit sur la fenêtre active de la campagne (utilisé en l'absence de mapping).
  const { data: sales } = await supabase
    .from("chariow_sales")
    .select("amount,net_amount,status")
    .eq("store_id", campaign.store_id)
    .eq("product_id", campaign.product_id)
    .eq("status", "completed")
    .gte("occurred_at", from)
    .lte("occurred_at", to);
  return sumSales(sales as Array<Record<string, unknown>> | null);
}

// Devise du compte publicitaire de la campagne (pour un rapport lisible).
async function campaignCurrency(supabase: any, campaign: any) {
  if (campaign.platform === "meta") {
    const { data } = await supabase
      .from("meta_ad_accounts")
      .select("currency")
      .eq("id", campaign.meta_ad_account_id)
      .maybeSingle();
    return data?.currency || "XOF";
  }
  const { data } = await supabase
    .from("tiktok_ad_accounts")
    .select("currency")
    .eq("id", campaign.tiktok_ad_account_id)
    .maybeSingle();
  return data?.currency || "XOF";
}

// Dépense + volumes pour une campagne, depuis son lancement.
async function campaignSpend(supabase: any, campaign: any) {
  const from = isoDay(new Date(campaign.created_at));
  const to = isoDay(new Date());

  if (campaign.platform === "meta") {
    const { data } = await supabase
      .from("meta_insights_daily")
      .select("spend,impressions,clicks")
      .eq("ad_account_id", campaign.meta_ad_account_id)
      .eq("level", "campaign")
      .eq("entity_id", campaign.external_campaign_id)
      .gte("date_start", from)
      .lte("date_start", to);
    return (data ?? []).reduce(
      (acc: { spend: number; impressions: number; clicks: number }, row: Record<string, unknown>) => ({ spend: acc.spend + num(row.spend), impressions: acc.impressions + num(row.impressions), clicks: acc.clicks + num(row.clicks) }),
      { spend: 0, impressions: 0, clicks: 0 },
    );
  }

  // TikTok : pas de synchro quotidienne persistée, on interroge le rapport en direct.
  const { data: account } = await supabase
    .from("tiktok_ad_accounts")
    .select("tiktok_advertiser_id,tiktok_integration_id")
    .eq("id", campaign.tiktok_ad_account_id)
    .eq("user_id", campaign.user_id)
    .maybeSingle();
  if (!account) return { spend: 0, impressions: 0, clicks: 0 };
  const { data: integration } = await supabase
    .from("tiktok_integrations")
    .select("access_token_encrypted")
    .eq("id", account.tiktok_integration_id)
    .eq("user_id", campaign.user_id)
    .maybeSingle();
  if (!integration) return { spend: 0, impressions: 0, clicks: 0 };
  try {
    const accessToken = decryptSecret(integration.access_token_encrypted);
    const campaigns = await fetchTikTokCampaignReport(account.tiktok_advertiser_id, accessToken, from, to);
    const row = campaigns.find((c) => c.id === campaign.external_campaign_id);
    return { spend: row?.spend ?? 0, impressions: row?.impressions ?? 0, clicks: row?.clicks ?? 0 };
  } catch (error) {
    console.error("autopilot: TikTok report failed", error instanceof Error ? error.message : error);
    return { spend: 0, impressions: 0, clicks: 0 };
  }
}

// Diagnostic déterministe (audience / créative / attribution) pour une campagne
// Meta — cf. lib/meta/diagnostic.ts. Non disponible pour TikTok (pas de synchro
// quotidienne persistée type meta_insights_daily à ce jour) : retourne [] dans
// ce cas, ce qui désactive simplement le raffinement IA sans casser le cron.
async function metaDiagnosticAnomalies(supabase: any, campaign: any): Promise<Anomaly[]> {
  if (campaign.platform !== "meta" || !campaign.meta_ad_account_id || !campaign.external_campaign_id) return [];

  const to = isoDay(new Date());
  const from = isoDay(new Date(Date.now() - 14 * 86400000));

  const { data: insightRows } = await supabase
    .from("meta_insights_daily")
    .select("level,entity_id,entity_name,date_start,impressions,reach,clicks,spend,conversion_value")
    .eq("ad_account_id", campaign.meta_ad_account_id)
    .eq("level", "campaign")
    .eq("entity_id", campaign.external_campaign_id)
    .gte("date_start", from)
    .lte("date_start", to)
    .order("date_start", { ascending: true });

  // Ventes réelles rattachées à cette campagne via meta_attributions (attribution
  // au niveau de la vente, plus fine que meta_campaign_mappings) — c'est la source
  // que le moteur de diagnostic attend pour comparer ROAS Meta vs ROAS réel.
  const { data: attributionRows } = await supabase
    .from("meta_attributions")
    .select("chariow_sale_id")
    .eq("user_id", campaign.user_id)
    .eq("meta_campaign_id", campaign.external_campaign_id)
    .gte("attributed_at", `${from}T00:00:00Z`)
    .lte("attributed_at", `${to}T23:59:59Z`);
  const saleIds = [...new Set((attributionRows ?? []).map((r: { chariow_sale_id: string | null }) => r.chariow_sale_id).filter(Boolean))] as string[];

  let attributedSalesForDiagnostic: DiagnosticAttributedSale[] = [];
  if (saleIds.length) {
    const { data: saleRows } = await supabase.from("chariow_sales").select("status,amount").in("chariow_sale_id", saleIds);
    attributedSalesForDiagnostic = (saleRows ?? []).map((s: { status: string | null; amount: number | null }) => ({ meta_campaign_id: campaign.external_campaign_id as string, status: s.status, amount: s.amount }));
  }

  const reports = computeCampaignDiagnostics((insightRows ?? []) as DiagnosticInsightRow[], attributedSalesForDiagnostic, { from, to });
  return reports.find((r) => r.campaignId === campaign.external_campaign_id)?.anomalies ?? [];
}

async function pauseCampaign(supabase: any, campaign: any) {
  if (campaign.platform === "meta") {
    const { data: account } = await supabase
      .from("meta_ad_accounts")
      .select("access_token_encrypted")
      .eq("id", campaign.meta_ad_account_id)
      .eq("user_id", campaign.user_id)
      .maybeSingle();
    if (!account || !campaign.external_adset_id || !campaign.external_ad_id) throw new Error("Compte Meta ou entités externes manquants");
    const accessToken = decryptSecret(account.access_token_encrypted);
    await pauseMetaCampaign({ campaignId: campaign.external_campaign_id, adSetId: campaign.external_adset_id, adId: campaign.external_ad_id, accessToken });
    return;
  }
  const { data: account } = await supabase
    .from("tiktok_ad_accounts")
    .select("tiktok_advertiser_id,tiktok_integration_id")
    .eq("id", campaign.tiktok_ad_account_id)
    .eq("user_id", campaign.user_id)
    .maybeSingle();
  if (!account || !campaign.external_adset_id || !campaign.external_ad_id) throw new Error("Compte TikTok ou entités externes manquants");
  const { data: integration } = await supabase
    .from("tiktok_integrations")
    .select("access_token_encrypted")
    .eq("id", account.tiktok_integration_id)
    .eq("user_id", campaign.user_id)
    .maybeSingle();
  if (!integration) throw new Error("Intégration TikTok introuvable");
  const accessToken = decryptSecret(integration.access_token_encrypted);
  await pauseTikTokCampaign({ advertiserId: account.tiktok_advertiser_id, accessToken, campaignId: campaign.external_campaign_id, adGroupId: campaign.external_adset_id, adId: campaign.external_ad_id });
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();

  const { data: campaigns, error } = await supabase
    .from("ad_campaigns")
    .select("id,user_id,store_id,product_id,platform,status,objective,daily_budget,created_at,external_campaign_id,external_adset_id,external_ad_id,meta_ad_account_id,tiktok_ad_account_id,title,product_name")
    .eq("autopilot_enabled", true)
    .in("status", ["active", "review"])
    .not("external_campaign_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const campaign of (campaigns ?? []) as Array<Record<string, unknown> & { id: string; user_id: string; platform: "meta" | "tiktok"; daily_budget: number; created_at: string }>) {
    try {
      const spendData = await campaignSpend(supabase, campaign);
      const sales = await attributedSales(supabase, campaign);
      const currency = await campaignCurrency(supabase, campaign);
      const daysSinceLaunch = Math.max(0, (Date.now() - new Date(campaign.created_at).getTime()) / 86400000);
      const baseDecision = computeAutopilotDecision({
        spend: spendData.spend,
        netRevenue: sales.net,
        grossRevenue: sales.gross,
        completedSales: sales.completed,
        daysSinceLaunch,
        dailyBudget: num(campaign.daily_budget),
      });

      // Diagnostic déterministe (Meta uniquement) puis raffinement du motif par
      // Imole — cf. lib/ai/autopilot-verdict.ts pour les garde-fous exacts.
      const anomalies = await metaDiagnosticAnomalies(supabase, campaign).catch((diagError) => {
        console.error("autopilot: diagnostic failed", campaign.id, diagError instanceof Error ? diagError.message : diagError);
        return [] as Anomaly[];
      });
      const decision = await refineAutopilotVerdictWithAI(
        { spend: spendData.spend, netRevenue: sales.net, grossRevenue: sales.gross, completedSales: sales.completed, daysSinceLaunch, dailyBudget: num(campaign.daily_budget) },
        baseDecision,
        anomalies,
        { campaignTitle: String(campaign.title || campaign.product_name || "Campagne"), currency, platform: campaign.platform },
      );

      const report = {
        campaign_id: campaign.id,
        user_id: campaign.user_id,
        platform: campaign.platform,
        period_from: isoDay(new Date(campaign.created_at)),
        period_to: isoDay(new Date()),
        spend: spendData.spend,
        gross_revenue: sales.gross,
        net_revenue: sales.net,
        completed_sales: sales.completed,
        impressions: spendData.impressions,
        clicks: spendData.clicks,
        currency,
        roas: decision.roas,
        cac: sales.completed > 0 ? spendData.spend / sales.completed : null,
        decision: decision.decision,
        reasons: decision.reasons,
        metrics: { daily_budget: num(campaign.daily_budget), days_since_launch: Math.round(daysSinceLaunch * 10) / 10, anomalies },
      };
      await supabase.from("ad_campaign_autopilot_reports").insert(report);

      if (decision.decision === "pause") {
        await pauseCampaign(supabase, campaign);
        await supabase
          .from("ad_campaigns")
          .update({ status: "paused", autopilot_paused_at: new Date().toISOString(), autopilot_pause_reason: decision.reasons.join(" ") })
          .eq("id", campaign.id);
        const title = String(campaign.title || campaign.product_name || "Campagne");
        await supabase.from("vendeo_alerts").upsert(
          {
            user_id: campaign.user_id,
            store_id: campaign.store_id,
            alert_key: "autopilot_pause",
            severity: "warning",
            title: `Campagne ${campaign.platform === "meta" ? "Meta" : "TikTok"} mise en pause automatiquement`,
            description: `« ${title} » : ${decision.reasons.join(" ")}`,
            status: "open",
            dedupe_key: `autopilot_pause_${campaign.id}_${isoDay(new Date())}`,
            metadata: { campaign_id: campaign.id, platform: campaign.platform, roas: decision.roas, reason: decision.reasons },
          },
          { onConflict: "user_id,dedupe_key" },
        );
        await supabase.from("user_notifications").upsert(
          {
            user_id: campaign.user_id,
            type: "autopilot",
            title: `Le pilote IA a mis en pause ta campagne ${campaign.platform === "meta" ? "Meta" : "TikTok"}`,
            body: `« ${title} » a été mise en pause automatiquement. ${decision.reasons.join(" ")}`,
            action_url: "/dashboard",
            dedupe_key: `autopilot_pause_${campaign.id}_${isoDay(new Date())}`,
            metadata: { campaign_id: campaign.id, platform: campaign.platform, roas: decision.roas, reason: decision.reasons },
          },
          { onConflict: "user_id,dedupe_key" },
        );
      }

      results.push({ campaign_id: campaign.id, platform: campaign.platform, decision: decision.decision, spend: spendData.spend, sales: sales.completed, roas: decision.roas, anomalies: anomalies.map((a) => a.stage) });
    } catch (campaignError) {
      console.error("autopilot: campaign evaluation failed", campaign.id, campaignError instanceof Error ? campaignError.message : campaignError);
      results.push({ campaign_id: campaign.id, error: campaignError instanceof Error ? campaignError.message : "unknown error" });
    }
  }

  return NextResponse.json({ evaluated: results.length, results });
}
