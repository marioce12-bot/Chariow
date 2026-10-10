"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PlayCircle, RefreshCw, X } from "lucide-react";
import { ResumeCampaignModal } from "./wizard/ResumeCampaignModal";
import { LaunchAdWizard } from "./wizard/LaunchAdWizard";
import type { Platform } from "./wizard/types";
import { useI18n } from "@/lib/i18n/i18n";
import { campaignErrorMessage } from "@/lib/i18n/campaign-errors";
import type { PlanId } from "@/lib/plans";
import { getMetaPausedReason, isMetaPausedReason } from "@/lib/meta/status";

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
  meta_ad_account_id?: string | null;
  tiktok_ad_account_id?: string | null;
  pinterest_ad_account_id?: string | null;
  ad_set_name?: string | null;
  ad_name?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  media_url?: string | null;
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
  active: { label: "Active", bg: "#D1FAE5", fg: "#065F46" },
  rejected: { label: "Rejetée", bg: "#FEE2E2", fg: "#991B1B" },
  error: { label: "Erreur", bg: "#FEE2E2", fg: "#991B1B" },
  completed: { label: "Terminée", bg: "#F3F4F6", fg: "#374151" },
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
  const statusLabels: Record<string, string> = locale === "en" ? {
    draft: "Draft", account_required: "Account required", submitting: "Creating…", paused: "Paused", meta_paused: "Paused by Meta", autopilot_paused: "Paused by autopilot",
    paid: "Ready to launch", review: "Under review", active: "Active", rejected: "Rejected", error: "Error", completed: "Completed",
  } : Object.fromEntries(Object.entries(STATUS_META).map(([key, value]) => [key, value.label]));
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
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState<AdCampaign | null>(null);
  const [correcting, setCorrecting] = useState<AdCampaign | null>(null);
  const [correctionFromDetail, setCorrectionFromDetail] = useState(false);
  const [selected, setSelected] = useState<AdCampaign | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingAutopilot, setTogglingAutopilot] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ad-campaigns");
      const data = await res.json().catch(() => null);
      setCampaigns(res.ok && Array.isArray(data?.campaigns) ? data.campaigns : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleAutopilot(campaign: AdCampaign) {
    setTogglingAutopilot(true);
    try {
      const next = !campaign.autopilot_enabled;
      const res = await fetch(`/api/ad-campaigns/${campaign.id}/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) return;
      setSelected((current) => (current && current.id === campaign.id ? { ...current, autopilot_enabled: next } : current));
      void load();
    } finally {
      setTogglingAutopilot(false);
    }
  }

  // Auto-sync : tant qu'une campagne Meta est "en revue", on revérifie son
  // statut aupres de Meta toutes les 15s (au lieu d'attendre le cron
  // quotidien ou une synchro manuelle). S'arrete des que plus aucune
  // campagne n'est en revue.
  useEffect(() => {
    const reviewingIds = campaigns.filter((c) => c.platform === "meta" && c.status === "review").map((c) => c.id);
    if (reviewingIds.length === 0) return;
    const interval = setInterval(() => {
      void Promise.all(reviewingIds.map((id) => fetch(`/api/ad-campaigns/${id}/status`).catch(() => null))).then(() => load());
    }, 15_000);
    return () => clearInterval(interval);
  }, [campaigns, load]);

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

      {loading ? (
        <p className="hint-line" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Loader2 size={14} className="animate-spin" /> {t("campaigns.loading")}
        </p>
      ) : campaigns.length === 0 ? (
        <p className="hint-line">{t("campaigns.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {campaigns.slice(0, showAll ? campaigns.length : 3).map((c) => {
            const metaPausedMessage = getMetaPausedReason(c.external_error);
            const statusKey = metaPausedMessage ? "meta_paused" : c.status;
            const meta = STATUS_META[statusKey] ?? { label: c.status, bg: "#F3F4F6", fg: "#374151" };
            const canResume = c.status === "draft" || c.status === "paused" || c.status === "autopilot_paused" || c.status === "paid";
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
                    {c.platform === "meta" ? "Meta" : c.platform === "pinterest" ? "Pinterest" : "TikTok"}{c.objective === "sales" && c.effective_objective === "traffic" ? " · Trafic (sans pixel)" : ""} · {Number(c.daily_budget).toLocaleString("fr-FR")} $/j · {c.duration_days} j
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
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {c.media_url ? <img src={c.media_url} alt="Affiche de la campagne" style={{ width: 42, height: 42, borderRadius: 7, objectFit: "cover", border: "1px solid var(--line)" }} /> : null}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: meta.bg,
                      color: meta.fg,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {statusLabels[statusKey] ?? meta.label}
                  </span>
                  {canResume ? (
                    <button type="button" className="btn btn-dark" onClick={(event) => { event.stopPropagation(); setResuming(c); }}>
                      <PlayCircle size={14} /> {t("campaigns.launch")}
                    </button>
                   ) : null}
                </div>
              </div>
            );
          })}
          {campaigns.length > 3 ? <button type="button" className="btn btn-ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? t("campaigns.reduce") : t("campaigns.more", { count: campaigns.length - 3 })}</button> : null}
        </div>
      )}

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
            void load();
          }}
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
            {editing ? <EditCampaignForm campaign={selected} saving={saving} onCancel={() => setEditing(false)} onSave={async (updates) => { setSaving(true); const response = await fetch(`/api/ad-campaigns/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); const result = await response.json().catch(() => null); setSaving(false); if (!response.ok) return; setSelected((current) => current ? { ...current, ...updates, external_error: current.external_error } : current); setEditing(false); void load(); }} /> : <div style={{ display: "grid", gap: 8, fontSize: 13 }}><div><strong>Texte :</strong> {selected.ad_text || "Non renseigné"}</div><div><strong>Réseau :</strong> {selected.platform === "meta" ? "Facebook / Instagram" : selected.platform === "pinterest" ? "Pinterest" : "TikTok"}</div><div><strong>Objectif :</strong> {selected.objective}</div><div><strong>Audience :</strong> {(selected.countries || []).join(", ") || "Non renseignée"} · {selected.min_age || 18}-{selected.max_age || 65} ans</div><div><strong>Budget :</strong> {Number(selected.daily_budget).toLocaleString("fr-FR")} $/jour · {selected.duration_days} jours</div>{selected.destination_url ? <div><strong>Lien :</strong> {selected.destination_url}</div> : null}</div>}
            {selected.external_error ? (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: isMetaPausedReason(selected.external_error) ? "#FFFBEB" : "#FEE2E2", color: isMetaPausedReason(selected.external_error) ? "#92400E" : "#991B1B", fontSize: 13 }}>
                <strong>{isMetaPausedReason(selected.external_error) ? (locale === "en" ? "Paused by Meta:" : "En pause chez Meta :") : t("ads.errors.reason")}</strong> {getMetaPausedReason(selected.external_error) ?? campaignErrorMessage(selected.external_error, locale, t, selected.platform)}
                <br />
                <span>
                  {isMetaPausedReason(selected.external_error) ? (locale === "en" ? "Check the account, campaign and billing in Meta Ads Manager, then relaunch from My campaigns." : "Vérifie le compte, la campagne et la facturation dans Meta Ads Manager, puis relance depuis Mes campagnes.") : selected.status === "rejected" ? t("ads.errors.rejectedHelp") : t("ads.errors.otherHelp")}
                </span>
              </div>
            ) : null}
            {selected.external_campaign_id ? (
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <strong style={{ fontSize: 13 }}>Pilotage automatique</strong>
                  <p className="hint-line" style={{ margin: 0 }}>Vendeo surveille la rentabilité (dépense pub vs ventes) et met la campagne en pause automatiquement si elle brûle le budget.</p>
                  {selected.autopilot_pause_reason ? (
                    <p className="hint-line" style={{ margin: "4px 0 0", color: "#B45309" }}>Dernier arrêt : {selected.autopilot_pause_reason}</p>
                  ) : null}
                </div>
                <button type="button" className={selected.autopilot_enabled ? "btn btn-dark" : "btn btn-ghost"} disabled={togglingAutopilot} onClick={() => void toggleAutopilot(selected)}>
                  {selected.autopilot_enabled ? "Activé" : "Activer"}
                </button>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>{selected.status !== "review" && selected.status !== "active" ? <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setCorrectionFromDetail(true); setCorrecting(selected); setSelected(null); }}>{t("ads.correction.edit")}</button> : null}{(selected.status === "draft" || selected.status === "paid" || selected.status === "paused" || selected.status === "autopilot_paused") ? <button type="button" className="btn btn-dark" style={{ flex: 1 }} onClick={() => { setSelected(null); setResuming(selected); }}>{selected.status === "draft" ? "Lancer la campagne" : "Relancer la campagne"}</button> : null}<button type="button" className="btn btn-danger-ghost" onClick={async () => { if (!window.confirm("Supprimer cette campagne ?")) return; const response = await fetch(`/api/ad-campaigns?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" }); if (response.ok) { setSelected(null); void load(); } }}>{t("ads.correction.deleteCampaign")}</button></div>
          </div>
        </div>
      ) : null}
    </section>
    </>
  );
}

function EditCampaignForm({ campaign, saving, onCancel, onSave }: { campaign: AdCampaign; saving: boolean; onCancel: () => void; onSave: (updates: Record<string, unknown>) => Promise<void> }) {
  const [text, setText] = useState(campaign.ad_text || "");
  const [title, setTitle] = useState(campaign.title || "");
  const [link, setLink] = useState(campaign.destination_url || "");
  return <form style={{ display: "grid", gap: 10 }} onSubmit={(event) => { event.preventDefault(); void onSave({ title, ad_text: text, destination_url: link }); }}><label className="hint-line">Titre<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="hint-line">Texte de la publicité<textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} required /></label><label className="hint-line">Lien de destination<input value={link} onChange={(event) => setLink(event.target.value)} required /></label><div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button><button type="submit" className="btn btn-dark" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div></form>;
}
