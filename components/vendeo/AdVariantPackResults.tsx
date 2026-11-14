"use client";
import { useEffect, useState } from "react";
import { Layers, PauseCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { recommendPackAction, type VariantPerformance } from "@/lib/ad-variant-pack";
const PACKS_KEY = "vendeo_ad_variant_packs_v1";
type PackRecord = { id: string; status: string; storeId: string; accountId: string; productName: string; createdAt: string; variants: { id: string; angle: string; format: string; campaignId: string }[] };
type Campaign = { id: string; status: string; platform?: string; external_campaign_id?: string | null; external_adset_id?: string | null; external_ad_id?: string | null; external_error?: string | null };
type Performance = { id: string; impressions: number; clicks: number; spend: number; realSales: number | null; attributionReliable: boolean };
const statusLabels: Record<string, { fr: string; en: string }> = {
  active: { fr: "Active", en: "Active" }, draft: { fr: "Brouillon", en: "Draft" },
  preparing: { fr: "Préparation", en: "Preparing" }, review: { fr: "En examen", en: "In review" },
  paused: { fr: "En pause", en: "Paused" }, autopilot_paused: { fr: "En pause", en: "Paused" },
  error: { fr: "Erreur", en: "Error" }, rejected: { fr: "Refusée", en: "Rejected" }, unknown: { fr: "À vérifier", en: "Check status" },
};
const pauseEligible = (campaign?: Campaign) => Boolean(campaign?.platform === "meta" && campaign.external_campaign_id && campaign.external_adset_id && campaign.external_ad_id && ["active", "review", "preparing", "unknown"].includes(campaign.status));
export function AdVariantPackResults({ storeId, onActionComplete }: { storeId: string | null; onActionComplete?: () => void }) {
  const { locale } = useI18n(); const en = locale === "en";
  const [packs, setPacks] = useState<PackRecord[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(false);
  const [pauseBusy, setPauseBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    let saved: PackRecord[] = [];
    try { const all = JSON.parse(localStorage.getItem(PACKS_KEY) || "[]"); saved = Array.isArray(all) ? all.filter((p) => p.status === "done" && (!storeId || p.storeId === storeId)) : []; } catch { saved = []; }
    setPacks(saved); setPerformance([]);
    if (!storeId || !saved.length) return () => { cancelled = true; };
    setLoading(true);
    const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    void Promise.all([
      fetch(`/api/ad-campaigns?store_id=${encodeURIComponent(storeId)}`, { cache: "no-store" }).then((r) => r.json()),
      ...[...new Set(saved.map((p) => p.accountId).filter(Boolean))].map((accountId) => fetch(`/api/meta/performance?account_id=${encodeURIComponent(accountId)}&store_id=${encodeURIComponent(storeId)}&from=${from}&to=${to}`, { cache: "no-store" }).then((r) => r.json())),
    ]).then((responses) => {
      if (cancelled) return;
      const [campaignData, ...performanceData] = responses;
      setCampaigns(Array.isArray(campaignData.campaigns) ? campaignData.campaigns : []);
      setPerformance(performanceData.flatMap((result) => Array.isArray(result.performances) ? result.performances : []));
    }).catch(() => { if (!cancelled) { setCampaigns([]); setPerformance([]); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storeId]);

  const pauseCampaign = async (campaign: Campaign, angle: string) => {
    if (pauseBusy || !campaign.external_campaign_id) return;
    setPauseBusy(campaign.id); setActionError(""); setActionMessage("");
    try {
      const preparedResponse = await fetch("/api/chat/campaign-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "prepare", action: "pause", campaignId: campaign.id }) });
      const prepared = await preparedResponse.json().catch(() => null) as { error?: string; token?: string; preview?: { name?: string; warning?: string } } | null;
      if (!preparedResponse.ok || !prepared?.token || !prepared.preview) throw new Error(prepared?.error ?? (en ? "Could not verify this campaign with Meta." : "Impossible de vérifier cette campagne auprès de Meta."));
      const confirmation = `${prepared.preview.name ?? angle}\n\n${prepared.preview.warning ?? ""}\n\n${en ? "Confirm pausing this Meta campaign? No ad will be deleted." : "Confirmer la mise en pause de cette campagne Meta ? Aucune publicité ne sera supprimée."}`;
      if (!window.confirm(confirmation)) return;
      const response = await fetch("/api/chat/campaign-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "execute", action: "pause", campaignId: campaign.id, token: prepared.token, confirmed: true }) });
      const result = await response.json().catch(() => null) as { error?: string; campaign?: Partial<Campaign> } | null;
      if (!response.ok) throw new Error(result?.error ?? (en ? "Meta did not confirm the pause." : "Meta n’a pas confirmé la pause."));
      setCampaigns((current) => current.map((row) => row.id === campaign.id ? { ...row, ...(result?.campaign ?? {}), status: "paused" } : row));
      setActionMessage(en ? `“${angle}” is paused.` : `« ${angle} » est en pause.`);
      onActionComplete?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : (en ? "The result could not be verified. Check Meta before retrying." : "Le résultat n’a pas pu être vérifié. Vérifie Meta avant de réessayer."));
    } finally { setPauseBusy(null); }
  };

  if (!packs.length) return null;
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const performanceById = new Map(performance.map((row) => [row.id, row]));
  return <section className="app-card" aria-labelledby="variant-packs-heading">
    <div className="card-head"><div><span className="eyebrow">META ADS</span><h2 id="variant-packs-heading" className="flex items-center gap-2"><Layers size={18}/>{en ? "Variant packs" : "Packs de variantes"}</h2><p className="hint-line">{en ? "Packs are distinct from single campaigns; each variant has its own Meta status and results." : "Les packs sont séparés des campagnes simples; chaque variante garde son statut et ses résultats Meta."}</p></div></div>
    {actionError ? <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{actionError}</p> : null}
    {actionMessage ? <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{actionMessage}</p> : null}
    <div className="grid gap-3">{packs.map((pack) => {
      const rows = pack.variants.map((variant) => {
        const campaign = campaignById.get(variant.campaignId);
        const stats = campaign?.external_campaign_id ? performanceById.get(campaign.external_campaign_id) : undefined;
        return { variant, campaign, stats };
      });
      const proof: VariantPerformance[] = rows.filter((row) => row.stats?.attributionReliable && row.stats.realSales !== null).map(({ variant, stats }) => ({ id: variant.id, impressions: stats!.impressions, clicks: stats!.clicks, purchases: stats!.realSales!, spend: stats!.spend }));
      const verdict = proof.length === rows.length ? recommendPackAction(proof) : { kind: "insufficient_data" as const, keep: [] as [], pause: [] as [] };
      const pauseIds = new Set(verdict.pause);
      return <article key={pack.id} className="rounded-xl border border-gray-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{pack.productName}</strong><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800">{en ? "Variant pack" : "Pack de variantes"}</span></div>
        <div className="mt-3 grid gap-2">{rows.map(({ variant, campaign, stats }) => <div key={variant.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{variant.angle}</strong><small className="ml-2 uppercase text-gray-500">{variant.format}</small></span><span className="text-xs text-gray-600">{campaign ? (statusLabels[campaign.status]?.[en ? "en" : "fr"] ?? campaign.status) : (en ? "Status not synchronized yet" : "Statut pas encore synchronisé")}</span></div>{stats && <p className="mt-1 text-xs text-gray-600">{stats.impressions.toLocaleString()} impressions · {stats.clicks.toLocaleString()} clics · {stats.realSales === null ? (en ? "Purchases not reliably attributed" : "Achats non attribués de façon fiable") : `${stats.realSales} achats attribués à la boutique`}</p>}{pauseIds.has(variant.id) && pauseEligible(campaign) ? <button type="button" disabled={pauseBusy !== null} onClick={() => void pauseCampaign(campaign!, variant.angle)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50"><PauseCircle size={14}/>{pauseBusy === campaign?.id ? (en ? "Preparing…" : "Vérification…") : (en ? "Prepare pause" : "Préparer la mise en pause")}</button> : null}</div>)}</div>
        {verdict.kind === "keep_one" ? <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">{en ? `Vendeo recommends keeping “${rows.find((row) => row.variant.id === verdict.keep[0])?.variant.angle}” and offers to pause the other variants. Review the evidence; each pause asks for confirmation.` : `Vendeo recommande de garder « ${rows.find((row) => row.variant.id === verdict.keep[0])?.variant.angle} » et propose de mettre les autres en pause. Vérifie les résultats; chaque pause demande confirmation.`}</p> : verdict.kind === "keep_two" ? <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">{en ? "Two variants are performing similarly: Vendeo recommends keeping both and offers to pause the remaining one." : "Deux variantes performent de manière comparable : Vendeo recommande de garder les deux et propose de mettre l’autre en pause."} {en ? "No pause is automatic; confirming a pause never deletes the ad." : "Aucune pause n’est automatique; confirmer une pause ne supprime jamais la publicité."}</p> : <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{loading ? (en ? "Loading Meta results…" : "Chargement des résultats Meta…") : (en ? "No winner yet: reliable store attribution is required, plus at least 1,000 impressions, 20 clicks and 5 purchases per variant. Keep testing; no ad is paused automatically." : "Pas encore de gagnant : il faut des achats attribués de façon fiable à la boutique, ainsi qu’au moins 1 000 impressions, 20 clics et 5 achats par variante. Continue le test; aucune publicité n’est mise en pause automatiquement.")}</p>}
      </article>;
    })}</div>
  </section>;
}
