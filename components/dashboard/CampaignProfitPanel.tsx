"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { dashboardCopy } from "@/lib/i18n/dashboard-copy";
import { localizeFinancialMessage } from "@/lib/i18n/system-messages";

type Campaign = { id: string; name: string; currency: string; sales: number; refunds: number; gross: number | null; net: number | null; fees: number | null; unitCosts: number | null; spend: number | null; profit: number | null; margin: number | null; cpa: number | null; cpaThreshold: number | null; estimated: boolean; recommendationReason: string; recommendation: "continue" | "reduce" | "increase" | "unknown"; reasons: string[] };
const money = (v: number | null, currency: string, locale: string) => v == null ? dashboardCopy[locale as "fr" | "en"]["dashboardExtra.unknown"] : `${v.toLocaleString(locale, { maximumFractionDigits: 2 })} ${currency}`;
export default function CampaignProfitPanel({ storeId, period = 30 }: { storeId: string; period?: 7 | 30 | 90 }) {
  const { locale , t } = useI18n();
  const copy = dashboardCopy[locale];
  const en = locale === "en";
  const translateMessage = (message: string) => localizeFinancialMessage(message, locale);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setCampaigns([]);
    setReasons([]);
    fetch(`/api/campaign-profit?storeId=${encodeURIComponent(storeId)}&period=${period}`).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || (en ? "Unable to load" : "Chargement impossible"));
      if (alive) { setCampaigns(data.campaigns ?? []); setReasons(data.reasons ?? []); }
    }).catch((e) => {
      if (alive) { setCampaigns([]); setReasons([e.message]); }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [storeId, period]);
  return <section className="app-card" style={{ marginTop: 24 }} aria-label={copy["dashboardExtra.campaignProfit"]}>
    <header className="mb-4"><h2 className="text-lg font-semibold">{copy["dashboardExtra.campaignProfit"]}</h2><p className="text-sm text-gray-500">{copy["dashboardExtra.campaignPeriod"].replace("{period}", String(period))}</p></header>
    {loading ? <p className="text-sm text-gray-500">{en ? "Loading…" : "Chargement…"}</p> : campaigns.length === 0 ? <p className="text-sm text-amber-800">{en ? "Calculation pending: " : "Calcul en attente : "}{(reasons.length ? reasons : [t("sweep2.text142")]).map(translateMessage).join(" ")}</p> : <div className="space-y-3">{campaigns.map((c) => <article key={c.id} className="app-card" style={{ marginTop: 12 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-medium">{c.name}</h3><span className="text-sm font-medium">{c.recommendation === "unknown" ? copy["dashboardExtra.pending"] : c.recommendation === "continue" ? copy["dashboardExtra.continue"] : c.recommendation === "reduce" ? copy["dashboardExtra.reduce"] : copy["dashboardExtra.increase"]}</span></div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, fontSize: 13, marginTop: 14 }}>
        <div>{en ? "Attributed sales / refunds: " : "Ventes attribuées / remboursements :"} {c.sales} / {c.refunds}</div>
        <div>{en ? "Attributed gross: " : "Brut attribué :"} {money(c.gross, c.currency, locale)}</div>
        <div>{en ? "Attributed net " : "Net attribué "}{c.estimated ? (en ? "estimated" : "estimé") : (en ? "received" : "reçu")}: {money(c.net, c.currency, locale)}</div>
        <div>{en ? "Fees on attributed sales: " : "Frais des ventes attribuées :"} {money(c.fees, c.currency, locale)}</div>
        <div>{en ? "Unit costs: " : "Coûts unitaires :"} {money(c.unitCosts, c.currency, locale)}</div>
        <div>{en ? "Observed spend: " : "Dépenses observées :"} {money(c.spend, c.currency, locale)}</div>
        <div>{en ? "Profit after advertising: " : "Bénéfice après publicité :"} {money(c.profit, c.currency, locale)}</div>
        <div>{en ? "Margin: " : "Marge : "}{c.margin == null ? (en ? "Unknown" : "Inconnue") : `${c.margin}%`}</div>
        <div>CPA : {money(c.cpa, c.currency, locale)}</div>
        <div>{en ? "CPA threshold: " : "Seuil CPA :"} {money(c.cpaThreshold, c.currency, locale)}</div>
      </dl>
      <p style={{ fontSize: 13, marginTop: 12 }}>{translateMessage(c.recommendationReason)}</p>
      {c.reasons.length > 0 && <p className="mt-3 text-sm text-amber-800">{en ? "To calculate profit: " : "Pour calculer le bénéfice : "}{c.reasons.map(translateMessage).join(" ")}</p>}
    </article>)}</div>}
  </section>;
}
