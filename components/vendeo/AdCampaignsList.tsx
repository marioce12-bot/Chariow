"use client";
import { AutopilotBudgetLimit } from "./AutopilotBudgetLimit";

import "./ad-campaigns-list.css";

import { useCallback, useEffect, useState } from "react";
import { CopyPlus, PlayCircle, RefreshCw, X } from "lucide-react";
import { ResumeCampaignModal } from "./wizard/ResumeCampaignModal";
import { LaunchAdWizard } from "./wizard/LaunchAdWizard";
import type { Platform } from "./wizard/types";
import { SkeletonRows } from "@/components/dashboard/Skeleton";
import { useI18n } from "@/lib/i18n/i18n";
import { campaignErrorMessage } from "@/lib/i18n/campaign-errors";
import type { PlanId } from "@/lib/plans";
import { getMetaCampaignLifecycle, getMetaPausedReason, isMetaPausedReason } from "@/lib/meta/status";
import { useNavigationCache, useNavigationData } from "@/components/dashboard/NavigationDataCache";

type AdCampaign = {
  id: string;
  product_id: string;
  platform: Platform;
  status: string;
  objective: string;
  effective_objective?: string | null;
  title: string | null;
  daily_budget: number;
  duration_days: number;
  estimated_budget: number;
  external_error: string | null;
  created_at: string;
  product_name?: string | null;
  ad_text?: string | null;
  destination_url?: string | null;
  external_campaign_id?: string | null;
  countries?: string[] | null;
  geo_targeting?: { countries?: string[]; regions?: { key: string; name: string }[]; cities?: { key: string; name: string }[] } | null;
  meta_page_id?: string | null;
  call_to_action?: string | null;
  advantage_creative?: boolean | null;
  advantage_audience?: boolean | null;
  meta_ad_account_id?: string | null;
  tiktok_ad_account_id?: string | null;
  pinterest_ad_account_id?: string | null;
  ad_set_name?: string | null;
  ad_name?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  media_url?: string | null;
  carousel_urls?: string[] | null;
  autopilot_enabled?: boolean | null;
  autopilot_paused_at?: string | null;
  autopilot_pause_reason?: string | null;
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Brouillon", bg: "#F3F4F6", fg: "#374151" },
  account_required: { label: "Compte requis", bg: "#FEF3C7", fg: "#92400E" },
  submitting: { label: "Création en cours…", bg: "#DBEAFE", fg: "#1E40AF" },
  paused: { label: "Suspendue", bg: "#E0E7FF", fg: "#3730A3" },
  meta_paused: { label: "En pause chez Meta", bg: "#FEF3C7", fg: "#92400E" },
  autopilot_paused: { label: "Mise en pause par le pilote", bg: "#FEF3C7", fg: "#92400E" },
  paid: { label: "Prête à lancer", bg: "#E0E7FF", fg: "#3730A3" },
  review: { label: "En cours d'examen", bg: "#FEF3C7", fg: "#92400E" },
  preparing: { label: "Préparation en cours", bg: "#DBEAFE", fg: "#1E40AF" },
  unknown: { label: "Statut à vérifier", bg: "#FEF3C7", fg: "#92400E" },
  active: { label: "Active", bg: "#D1FAE5", fg: "#065F46" },
  meta_active: { label: "Active chez Meta", bg: "#D1FAE5", fg: "#065F46" },
  rejected: { label: "Rejetée", bg: "#FEE2E2", fg: "#991B1B" },
  error: { label: "Erreur", bg: "#FEE2E2", fg: "#991B1B" },
  completed: { label: "Terminée", bg: "#F3F4F6", fg: "#374151" },
  archived: { label: "Archivée", bg: "#F3F4F6", fg: "#374151" },
  deleted: { label: "Supprimée chez Meta", bg: "#F3F4F6", fg: "#374151" },
  unavailable: { label: "Statut à vérifier", bg: "#FEF3C7", fg: "#92400E" },
};

/**
 * Liste "Mes campagnes publicitaires" — affichée sur la Vue d'ensemble juste
 * après la carte d'activité. Sans elle, une campagne créée via le wizard
 * disparaît de la vue (le wizard se ferme, la seule trace visible dans l'UI
 * était le tableau de performances, alimenté uniquement par la synchro Meta
 * du lendemain). Chaque campagne créée apparaît ici immédiatement avec son
 * statut, et un bouton permet de relancer une campagne sans repasser par le wizard.
 *
 */
export function AdCampaignsList({ storeId, plan: planProp, onNewCampaign }: { storeId: string | null; plan?: PlanId; onNewCampaign: () => void }) {
  const { locale, t } = useI18n();
  const statusLabels: Record<string, string> = Object.fromEntries(Object.keys(STATUS_META).map((key) => [key, t(`adsExtra.status.${key}`)]));
  // Le plan sert au wizard de modification (ex. placement WhatsApp) : repris de la
  // prop si le parent le fournit, sinon lu une fois depuis /api/subscription.
  const [fetchedPlan, setFetchedPlan] = useState<PlanId>("starter");
  const plan = planProp ?? fetchedPlan;
  useEffect(() => {
    if (planProp) return;
    let cancelled = false;
    fetch("/api/subscription").then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!cancelled && data?.subscription?.plan) setFetchedPlan(data.subscription.plan as PlanId);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [planProp]);
  // Fragment scopes the in-memory key by storeId but is never sent to the API;
  // GET /api/ad-campaigns remains user-authorized and unchanged.
  const campaignsUrl = storeId ? `/api/ad-campaigns#store=${encodeURIComponent(storeId)}` : null;
  const campaignsQuery = useNavigationData<{ campaigns?: AdCampaign[] }>(campaignsUrl);
  const navigationCache = useNavigationCache();
  const campaigns = Array.isArray(campaignsQuery.data?.campaigns) ? campaignsQuery.data.campaigns : [];
  const currentCampaigns = campaigns.filter((campaign) => !["archived", "deleted"].includes(getMetaCampaignLifecycle(campaign.status, campaign.external_error) ?? ""));
  const historicalCampaigns = campaigns.filter((campaign) => ["archived", "deleted"].includes(getMetaCampaignLifecycle(campaign.status, campaign.external_error) ?? ""));
  const loading = campaignsQuery.loading;
  const [resuming, setResuming] = useState<AdCampaign | null>(null);
  const [correcting, setCorrecting] = useState<AdCampaign | null>(null);
  // Duplication : wizard pré-rempli avec cette campagne, qui crée un nouveau brouillon.
  const [duplicating, setDuplicating] = useState<AdCampaign | null>(null);
  const [correctionFromDetail, setCorrectionFromDetail] = useState(false);
  const [selected, setSelected] = useState<AdCampaign | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!selected) return;
    const latest = campaigns.find((campaign) => campaign.id === selected.id);
    if (latest && (latest.status !== selected.status || latest.external_error !== selected.external_error)) {
      setSelected((current) => current?.id === selected.id ? { ...current, status: latest.status, external_error: latest.external_error } : current);
    }
  }, [campaigns, selected]);
  const load = useCallback(async () => {
    if (campaignsUrl) await navigationCache.load(campaignsUrl, 0, true);
  }, [campaignsUrl, navigationCache]);

  // Poll transitional and active Meta rows; never leave an expired Active
  // assertion on screen after an unavailable platform read. IDs are stable so
  // list cache refreshes do not continuously restart polling.
  const monitoredIds = campaigns.filter((campaign) => campaign.platform === "meta" && ["review", "preparing", "unknown", "active"].includes(campaign.status)).map((campaign) => campaign.id).sort().join(",");
  useEffect(() => {
    if (!monitoredIds) return;
    let disposed = false;
    let inFlight = false;
    const refresh = async () => {
      if (disposed || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        await Promise.all(monitoredIds.split(",").map((id) => fetch(`/api/ad-campaigns/${id}/status`, { cache: "no-store" }).catch(() => null)));
        if (!disposed) await load();
      } finally { inFlight = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    const onReturn = () => void refresh();
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => { disposed = true; window.clearInterval(interval); document.removeEventListener("visibilitychange", onReturn); window.removeEventListener("focus", onReturn); };
  }, [monitoredIds, load]);


  if (!storeId) return null;

  return (
    <>
    <section className="app-card ad-campaigns-list">
      <div className="card-head">
        <div><h2>{t("campaigns.title")}</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost compact-action" onClick={() => void load()} aria-label={t("campaigns.refresh")}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Skeleton uniquement au premier chargement : lors d'un rafraîchissement (bouton ou auto-sync
          des campagnes en revue), la liste déjà affichée reste en place au lieu de clignoter. */}
      {loading && campaigns.length === 0 ? (
        <SkeletonRows count={2} label={t("campaigns.loading")} />
      ) : currentCampaigns.length === 0 ? (
        <p className="hint-line">{t("campaigns.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {currentCampaigns.slice(0, showAll ? currentCampaigns.length : 3).map((c) => {
            const metaPausedMessage = getMetaPausedReason(c.external_error);
            const lifecycle = getMetaCampaignLifecycle(c.status, c.external_error);
            const statusKey = lifecycle ?? (metaPausedMessage ? "meta_paused" : c.platform === "meta" && c.status === "active" ? "meta_active" : c.status);
            const meta = STATUS_META[statusKey] ?? { label: c.status, bg: "#F3F4F6", fg: "#374151" };
            const canResume = !lifecycle && (c.status === "draft" || c.status === "paused" || c.status === "autopilot_paused" || c.status === "paid");
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(c)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(c);
                  }
                }}
                className="ad-campaign-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 14px",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                   <span style={{ fontSize: 13, textAlign: "left", fontWeight: 700 }}>{c.title || c.product_name || c.product_id}</span>
                  <span className="hint-line">
                    {c.platform === "meta" ? "Meta" : c.platform === "pinterest" ? "Pinterest" : "TikTok"}{c.objective === "sales" && c.effective_objective === "traffic" ? ` · ${t("adsExtra.traffic_without_pixel")}` : ""} · {Number(c.daily_budget).toLocaleString(locale)} $/{locale === "en" ? "day" : "j"} · {c.duration_days} {locale === "en" ? "days" : "j"}
                  </span>
                  {/* /launch garde le statut "paid" (jamais "error") apres un refus Meta/TikTok
                      pour permettre un nouvel essai sans repayer : le motif doit donc s'afficher
                      aussi sur "paid". "rejected" est le refus survenu après diffusion (retour
                      async de mapMetaEffectiveStatus) : même logique, le motif doit rester visible
                      directement dans la liste, sans avoir à ouvrir le détail. */}
                  {(c.status === "error" || c.status === "paid" || c.status === "rejected" || metaPausedMessage) && c.external_error ? (
                    <span className="hint-line" style={{ color: metaPausedMessage ? "#92400E" : "#991B1B" }}>{metaPausedMessage ?? campaignErrorMessage(c.external_error, locale, t, c.platform)}</span>
                  ) : null}
                </div>
                <div className="ad-campaign-actions">
                  {c.media_url ? <img className="ad-campaign-thumb" src={c.media_url} alt={t("adsExtra.poster_alt")} style={{ width: 42, height: 42, borderRadius: 7, objectFit: "cover", border: "1px solid var(--line)" }} /> : null}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: meta.bg,
                      color: meta.fg,
                      whiteSpace: "normal",
                    }}
                  >
                    {statusLabels[statusKey] ?? meta.label}
                  </span>
                  <button type="button" className="btn btn-ghost ad-campaign-duplicate" title={t("adsExtra.duplicate")} aria-label={t("adsExtra.duplicate")} onClick={(event) => { event.stopPropagation(); setDuplicating(c); }}>
                    <CopyPlus size={14} /> <span>{t("adsExtra.duplicate")}</span>
                  </button>
                  {canResume ? (
                    <button type="button" className="btn btn-dark" onClick={(event) => { event.stopPropagation(); setResuming(c); }}>
                      <PlayCircle size={14} /> {c.status === "paused" || c.status === "autopilot_paused" ? t("adsExtra.resume") : t("campaigns.launch")}
                    </button>
                   ) : null}
                </div>
              </div>
            );
          })}
          {currentCampaigns.length > 3 ? <button type="button" className="btn btn-ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? t("campaigns.reduce") : t("campaigns.more", { count: currentCampaigns.length - 3 })}</button> : null}
        </div>
      )}
      {historicalCampaigns.length > 0 ? <details className="ad-campaign-history"><summary>{t("adsExtra.history", { count: historicalCampaigns.length })}</summary><div className="ad-campaign-history-list">{historicalCampaigns.map((campaign) => { const lifecycle = getMetaCampaignLifecycle(campaign.status, campaign.external_error)!; const meta = STATUS_META[lifecycle]; return <div className="ad-campaign-row" key={campaign.id}><div className="ad-campaign-title">{campaign.title || campaign.product_name || campaign.product_id}</div><span className="ad-campaign-badge" style={{ background: meta.bg, color: meta.fg }}>{statusLabels[lifecycle]}</span><button type="button" className="btn btn-ghost ad-campaign-duplicate" title={t("adsExtra.duplicate")} aria-label={t("adsExtra.duplicate")} onClick={() => setDuplicating(campaign)}><CopyPlus size={14} /><span>{t("adsExtra.duplicate")}</span></button></div>; })}</div></details> : null}

      {resuming ? (
        <ResumeCampaignModal
          campaignId={resuming.id}
          platform={resuming.platform}
          initialStatus={resuming.status as "draft" | "paused" | "autopilot_paused" | "paid"}
          initialError={getMetaPausedReason(resuming.external_error) ?? resuming.external_error}
          onClose={() => setResuming(null)}
          onCorrection={(message) => {
            const campaign = resuming;
            setResuming(null);
            setCorrectionFromDetail(false);
            if (campaign) setCorrecting({ ...campaign, external_error: message ?? campaign.external_error });
          }}
          onLaunched={() => {
            setResuming(null);
            navigationCache.invalidate();
            void load();
          }}
        />
      ) : null}
      {duplicating && storeId ? (
        <LaunchAdWizard
          key={`duplicate:${duplicating.id}`}
          storeId={storeId}
          plan={plan}
          duplicateCampaign={duplicating}
          onClose={() => setDuplicating(null)}
          onLaunched={() => { navigationCache.invalidate(); void load(); }}
        />
      ) : null}
      {correcting && storeId ? (
        <LaunchAdWizard
          storeId={storeId}
          plan={plan}
          editCampaign={correcting}
          editNotice={correcting.external_error ? (getMetaPausedReason(correcting.external_error) ?? campaignErrorMessage(correcting.external_error, locale, t, correcting.platform)) : null}
          onClose={() => {
            const campaign = correcting;
            setCorrecting(null);
            if (correctionFromDetail && campaign) setSelected(campaign);
            setCorrectionFromDetail(false);
          }}
          onEdited={() => {
            const edited = correcting;
            setCorrecting(null);
            setCorrectionFromDetail(false);
            void load();
            if (["draft", "paid", "paused", "autopilot_paused", "rejected"].includes(edited.status)) setResuming({ ...edited, external_error: null });
            else setSelected({ ...edited, external_error: null });
          }}
        />
      ) : null}
      {selected ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="app-card" style={{ maxWidth: 620, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={(event) => event.stopPropagation()}>
            <div className="card-head campaign-modal-head"><div><span className="eyebrow">{t("campaigns.detail")}</span><h2>{selected.title || selected.product_name || selected.product_id}</h2></div><button type="button" className="compact-icon-button" onClick={() => setSelected(null)} aria-label={t("campaigns.close")}><X size={16} /></button></div>
            {selected.media_url ? <img src={selected.media_url} alt={t("campaigns.preview")} style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10, marginBottom: 14 }} /> : null}
            {editing ? <EditCampaignForm campaign={selected} saving={saving} onCancel={() => setEditing(false)} onSave={async (updates) => { setSaving(true); const response = await fetch(`/api/ad-campaigns/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); const result = await response.json().catch(() => null); setSaving(false); if (!response.ok) return; navigationCache.invalidate(); setSelected((current) => current ? { ...current, ...updates, external_error: current.external_error } : current); setEditing(false); void load(); }} /> : <div style={{ display: "grid", gap: 8, fontSize: 13 }}><div><strong>{t("campaigns.text")}</strong> {selected.ad_text || "Non renseigné"}</div><div><strong>{t("campaigns.network")}</strong> {selected.platform === "meta" ? "Facebook / Instagram" : selected.platform === "pinterest" ? "Pinterest" : "TikTok"}</div><div><strong>{t("campaigns.objective")}</strong> {selected.objective}</div><div><strong>{t("campaigns.audience")}</strong> {(selected.countries || []).join(", ") || "Non renseignée"} · {selected.min_age || 18}-{selected.max_age || 65} {" "}{t("finalExtra.text68")}</div><div><strong>{t("campaigns.budget")}</strong> {Number(selected.daily_budget).toLocaleString("fr-FR")} {" "}{t("finalExtra.text69")}{" "}{selected.duration_days} {" "}{t("sweep1.text330")}</div>{selected.destination_url ? <div><strong>{t("campaigns.link")}</strong> {selected.destination_url}</div> : null}</div>}
            {selected.external_error ? (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: isMetaPausedReason(selected.external_error) ? "#FFFBEB" : "#FEE2E2", color: isMetaPausedReason(selected.external_error) ? "#92400E" : "#991B1B", fontSize: 13 }}>
                <strong>{isMetaPausedReason(selected.external_error) ? (locale === "en" ? "Paused by Meta:" : "En pause chez Meta :") : t("ads.errors.reason")}</strong> {getMetaPausedReason(selected.external_error) ?? campaignErrorMessage(selected.external_error, locale, t, selected.platform)}
                <br />
                <span>
                  {isMetaPausedReason(selected.external_error) ? (locale === "en" ? "Check the account, campaign and billing in Meta Ads Manager, then relaunch from My campaigns." : "Vérifie le compte, la campagne et la facturation dans Meta Ads Manager, puis relance depuis Mes campagnes.") : selected.status === "rejected" ? t("ads.errors.rejectedHelp") : t("ads.errors.otherHelp")}
                </span>
              </div>
            ) : null}
            {selected.status === "active" && !getMetaCampaignLifecycle(selected.status, selected.external_error) && !isMetaPausedReason(selected.external_error) && selected.external_campaign_id && (selected.platform === "meta" || selected.platform === "tiktok") ? (
              <div style={{ marginTop: 14 }}>
                <AutopilotBudgetLimit key={selected.id} campaignId={selected.id} enabled={Boolean(selected.autopilot_enabled)} onEnabledChange={(enabled) => {
                  setSelected((current) => current?.id === selected.id ? { ...current, autopilot_enabled: enabled } : current);
                  void load();
                }} />
                {selected.autopilot_pause_reason ? <p className="hint-line" style={{ color: "#B45309" }}>{t("sweep3.text332")} {selected.autopilot_pause_reason}</p> : null}
              </div>
            ) : null}
            <div className="ad-campaign-modal-actions">{!getMetaCampaignLifecycle(selected.status, selected.external_error) && !["review", "preparing", "unknown", "active"].includes(selected.status) ? <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setCorrectionFromDetail(true); setCorrecting(selected); setSelected(null); }}>{t("ads.correction.edit")}</button> : null}<button type="button" className="btn btn-ghost ad-campaign-duplicate" title={t("adsExtra.duplicate")} aria-label={t("adsExtra.duplicate")} onClick={() => { setEditing(false); setDuplicating(selected); setSelected(null); }}><CopyPlus size={14} /><span>{t("adsExtra.duplicate")}</span></button>{!getMetaCampaignLifecycle(selected.status, selected.external_error) && (selected.status === "draft" || selected.status === "paid" || selected.status === "paused" || selected.status === "autopilot_paused") ? <button type="button" className="btn btn-dark" style={{ flex: 1 }} onClick={() => { setSelected(null); setResuming(selected); }}>{selected.status === "draft" ? t("ads.launchButton") : t("adsExtra.resume")}</button> : null}{!getMetaCampaignLifecycle(selected.status, selected.external_error) ? <button type="button" className="btn btn-danger-ghost" onClick={async () => { if (!window.confirm("Supprimer cette campagne ?")) return; const response = await fetch(`/api/ad-campaigns?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" }); if (response.ok) { navigationCache.invalidate(); setSelected(null); void load(); } }}>{t("ads.correction.deleteCampaign")}</button> : null}</div>
          </div>
        </div>
      ) : null}
    </section>
    </>
  );
}

function EditCampaignForm({ campaign, saving, onCancel, onSave }: { campaign: AdCampaign; saving: boolean; onCancel: () => void; onSave: (updates: Record<string, unknown>) => Promise<void> }) {
  const { t } = useI18n();
  const [text, setText] = useState(campaign.ad_text || "");
  const [title, setTitle] = useState(campaign.title || "");
  const [link, setLink] = useState(campaign.destination_url || "");
  return <form style={{ display: "grid", gap: 10 }} onSubmit={(event) => { event.preventDefault(); void onSave({ title, ad_text: text, destination_url: link }); }}><label className="hint-line">{t("adminComplete.title")}<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="hint-line">{t("ads.correction.adText")}<textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} required /></label><label className="hint-line">{t("ads.correction.destination")}<input value={link} onChange={(event) => setLink(event.target.value)} required /></label><div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost" onClick={onCancel}>{t("workspaceExtra.cancel")}</button><button type="submit" className="btn btn-dark" disabled={saving}>{saving ? t("ads.correction.saving") : t("optionsExtra.text62")}</button></div></form>;
}
