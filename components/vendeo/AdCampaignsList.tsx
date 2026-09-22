"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PlayCircle, RefreshCw, X } from "lucide-react";
import { ResumeCampaignModal } from "./wizard/ResumeCampaignModal";
import type { Platform } from "./wizard/types";

type AdCampaign = {
  id: string;
  product_id: string;
  platform: Platform;
  status: string;
  objective: string;
  title: string | null;
  daily_budget: number;
  duration_days: number;
  estimated_budget: number;
  external_error: string | null;
  created_at: string;
  product_name?: string | null;
  ad_text?: string | null;
  destination_url?: string | null;
  countries?: string[] | null;
  min_age?: number | null;
  max_age?: number | null;
  media_url?: string | null;
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Brouillon", bg: "#F3F4F6", fg: "#374151" },
  account_required: { label: "Compte requis", bg: "#FEF3C7", fg: "#92400E" },
  submitting: { label: "Création en cours…", bg: "#DBEAFE", fg: "#1E40AF" },
  paused: { label: "Prête — en attente de paiement", bg: "#E0E7FF", fg: "#3730A3" },
  paid: { label: "Payée — en attente d’activation", bg: "#E0E7FF", fg: "#3730A3" },
  review: { label: "En revue chez la plateforme", bg: "#FEF3C7", fg: "#92400E" },
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
 * statut, et un bouton permet de reprendre le paiement/l'activation sans
 * jamais payer deux fois pour la même campagne.
 */
export function AdCampaignsList({ storeId, onNewCampaign }: { storeId: string | null; onNewCampaign: () => void }) {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState<AdCampaign | null>(null);
  const [selected, setSelected] = useState<AdCampaign | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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
    <section className="app-card ad-campaigns-list">
      <div className="card-head">
        <div><h2>Campagnes</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost compact-action" onClick={() => void load()} aria-label="Rafraîchir">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="hint-line" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Loader2 size={14} className="animate-spin" /> Chargement…
        </p>
      ) : campaigns.length === 0 ? (
        <p className="hint-line">Aucune campagne créée.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {campaigns.slice(0, showAll ? campaigns.length : 3).map((c) => {
            const meta = STATUS_META[c.status] ?? { label: c.status, bg: "#F3F4F6", fg: "#374151" };
            const canResume = c.status === "paused" || c.status === "paid";
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 14px",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                   <button type="button" onClick={() => setSelected(c)} style={{ fontSize: 13, textAlign: "left", fontWeight: 700 }}>{c.title || c.product_name || c.product_id}</button>
                  <span className="hint-line">
                    {c.platform === "meta" ? "Meta" : "TikTok"} · {Number(c.daily_budget).toLocaleString("fr-FR")} XOF/j · {c.duration_days} j
                  </span>
                  {/* /launch garde le statut "paid" (jamais "error") apres un refus Meta/TikTok
                      pour permettre un nouvel essai sans repayer : le motif doit donc s'afficher
                      aussi sur "paid", sinon il reste invisible dans la liste. */}
                  {(c.status === "error" || c.status === "paid") && c.external_error ? (
                    <span className="hint-line" style={{ color: "#991B1B" }}>{c.external_error}</span>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                    {meta.label}
                  </span>
                  {canResume ? (
                    <button type="button" className="btn btn-dark" onClick={() => setResuming(c)}>
                      <PlayCircle size={14} /> {c.status === "paused" ? "Lancer" : "Activer"}
                    </button>
                   ) : null}
                </div>
              </div>
            );
          })}
          {campaigns.length > 3 ? <button type="button" className="btn btn-ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? "Réduire" : `Voir plus (${campaigns.length - 3})`}</button> : null}
        </div>
      )}

      {resuming ? (
        <ResumeCampaignModal
          campaignId={resuming.id}
          platform={resuming.platform}
          initialStatus={resuming.status as "paused" | "paid"}
          initialError={resuming.external_error}
          onClose={() => setResuming(null)}
          onLaunched={() => {
            setResuming(null);
            void load();
          }}
        />
      ) : null}
      {selected ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="app-card" style={{ maxWidth: 620, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={(event) => event.stopPropagation()}>
            <div className="card-head campaign-modal-head"><div><span className="eyebrow">Détail</span><h2>{selected.title || selected.product_name || selected.product_id}</h2></div><button type="button" className="compact-icon-button" onClick={() => setSelected(null)} aria-label="Fermer"><X size={16} /></button></div>
            {selected.media_url ? <img src={selected.media_url} alt="Aperçu de la publicité" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10, marginBottom: 14 }} /> : null}
            {editing ? <EditCampaignForm campaign={selected} saving={saving} onCancel={() => setEditing(false)} onSave={async (updates) => { setSaving(true); const response = await fetch(`/api/ad-campaigns/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); const result = await response.json().catch(() => null); setSaving(false); if (!response.ok) return; setSelected((current) => current ? { ...current, ...updates, external_error: current.external_error } : current); setEditing(false); void load(); }} /> : <div style={{ display: "grid", gap: 8, fontSize: 13 }}><div><strong>Texte :</strong> {selected.ad_text || "Non renseigné"}</div><div><strong>Réseau :</strong> {selected.platform === "meta" ? "Facebook / Instagram" : "TikTok"}</div><div><strong>Objectif :</strong> {selected.objective}</div><div><strong>Audience :</strong> {(selected.countries || []).join(", ") || "Non renseignée"} · {selected.min_age || 18}-{selected.max_age || 65} ans</div><div><strong>Budget :</strong> {Number(selected.daily_budget).toLocaleString("fr-FR")} XOF/jour · {selected.duration_days} jours</div>{selected.destination_url ? <div><strong>Lien :</strong> {selected.destination_url}</div> : null}</div>}
            {selected.external_error ? <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}><strong>Rejet / erreur :</strong> {selected.external_error}<br /><span>Modifie les paramètres puis relance. Aucun paiement supplémentaire ne sera demandé.</span></div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>{selected.status !== "review" && selected.status !== "active" ? <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>Modifier</button> : null}{(selected.status === "draft" || selected.status === "paid" || selected.status === "paused") ? <button type="button" className="btn btn-dark" style={{ flex: 1 }} onClick={() => { setSelected(null); setResuming(selected); }}>{selected.status === "draft" ? "Lancer la campagne" : "Relancer la campagne"}</button> : null}<button type="button" className="btn btn-danger-ghost" onClick={async () => { if (!window.confirm("Supprimer cette campagne ?")) return; const response = await fetch(`/api/ad-campaigns?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" }); if (response.ok) { setSelected(null); void load(); } }}>Supprimer</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EditCampaignForm({ campaign, saving, onCancel, onSave }: { campaign: AdCampaign; saving: boolean; onCancel: () => void; onSave: (updates: Record<string, unknown>) => Promise<void> }) {
  const [text, setText] = useState(campaign.ad_text || "");
  const [title, setTitle] = useState(campaign.title || "");
  const [link, setLink] = useState(campaign.destination_url || "");
  return <form style={{ display: "grid", gap: 10 }} onSubmit={(event) => { event.preventDefault(); void onSave({ title, ad_text: text, destination_url: link }); }}><label className="hint-line">Titre<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="hint-line">Texte de la publicité<textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} required /></label><label className="hint-line">Lien de destination<input value={link} onChange={(event) => setLink(event.target.value)} required /></label><div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button><button type="submit" className="btn btn-dark" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div></form>;
}
