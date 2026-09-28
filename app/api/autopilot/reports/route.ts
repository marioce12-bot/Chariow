import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// Rapports du pilotage automatique pour l'utilisateur courant, du plus récent
// au plus ancien. Chaque rapport relie la dépense pub aux ventes réelles et à la
// décision prise (laisser tourner / mettre en pause / en apprentissage).
export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: reports, error } = await supabase
    .from("ad_campaign_autopilot_reports")
    .select("id,campaign_id,platform,period_from,period_to,spend,gross_revenue,net_revenue,completed_sales,impressions,clicks,roas,cac,decision,reasons,metrics,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Impossible de charger les rapports de pilotage" }, { status: 500 });

  const campaignIds = [...new Set((reports ?? []).map((report: { campaign_id: string }) => report.campaign_id))];
  let titles = new Map<string, string>();
  if (campaignIds.length) {
    const { data: campaigns } = await supabase.from("ad_campaigns").select("id,title,product_name").in("id", campaignIds);
    titles = new Map((campaigns ?? []).map((campaign: { id: string; title: string | null; product_name: string | null }) => [campaign.id, campaign.title || campaign.product_name || "Campagne"]));
  }

  const enriched = (reports ?? []).map((report: Record<string, unknown>) => ({
    ...report,
    campaign_title: titles.get(String(report.campaign_id)) ?? "Campagne",
  }));
  return NextResponse.json({ reports: enriched });
}
