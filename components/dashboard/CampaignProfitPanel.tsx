"use client";
import { useEffect, useState } from "react";

type Campaign = { id: string; name: string; currency: string; sales: number; refunds: number; gross: number | null; net: number | null; fees: number | null; unitCosts: number | null; spend: number | null; profit: number | null; margin: number | null; cpa: number | null; cpaThreshold: number | null; estimated: boolean; recommendationReason: string; recommendation: "continue" | "reduce" | "increase" | "unknown"; reasons: string[] };
const money = (v: number | null, currency: string) => v == null ? "Inconnu" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency}`;
export default function CampaignProfitPanel({ storeId, period = 30 }: { storeId: string; period?: 7 | 30 | 90 }) {
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
      if (!r.ok) throw new Error(data.error || "Chargement impossible");
      if (alive) { setCampaigns(data.campaigns ?? []); setReasons(data.reasons ?? []); }
    }).catch((e) => {
      if (alive) { setCampaigns([]); setReasons([e.message]); }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [storeId, period]);
  return <section className="app-card" style={{ marginTop: 24 }} aria-label="Rentabilité des campagnes">
    <header className="mb-4"><h2 className="text-lg font-semibold">Rentabilité des campagnes</h2><p className="text-sm text-gray-500">Période : {period} jours · aucun budget n’est modifié ici.</p></header>
    {loading ? <p className="text-sm text-gray-500">Chargement…</p> : campaigns.length === 0 ? <p className="text-sm text-amber-800">Calcul en attente : {reasons.join(" ") || "aucune dépense de campagne confirmée sur cette période."}</p> : <div className="space-y-3">{campaigns.map((c) => <article key={c.id} className="app-card" style={{ marginTop: 12 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-medium">{c.name}</h3><span className="text-sm font-medium">{c.recommendation === "unknown" ? "Calcul en attente" : c.recommendation === "continue" ? "Continuer" : c.recommendation === "reduce" ? "Réduire" : "Augmenter"}</span></div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, fontSize: 13, marginTop: 14 }}>
        <div>Ventes attribuées / remboursements : {c.sales} / {c.refunds}</div>
        <div>Brut attribué : {money(c.gross, c.currency)}</div>
        <div>Net attribué {c.estimated ? "estimé" : "reçu"} : {money(c.net, c.currency)}</div>
        <div>Frais des ventes attribuées : {money(c.fees, c.currency)}</div>
        <div>Coûts unitaires : {money(c.unitCosts, c.currency)}</div>
        <div>Dépenses observées : {money(c.spend, c.currency)}</div>
        <div>Bénéfice après publicité : {money(c.profit, c.currency)}</div>
        <div>Marge : {c.margin == null ? "Inconnue" : `${c.margin}%`}</div>
        <div>CPA : {money(c.cpa, c.currency)}</div>
        <div>Seuil CPA : {money(c.cpaThreshold, c.currency)}</div>
      </dl>
      <p style={{ fontSize: 13, marginTop: 12 }}>{c.recommendationReason}</p>
      {c.reasons.length > 0 && <p className="mt-3 text-sm text-amber-800">Pour calculer le bénéfice : {c.reasons.join(" ")}</p>}
    </article>)}</div>}
  </section>;
}
