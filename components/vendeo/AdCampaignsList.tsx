"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PlayCircle, Plus, RefreshCw } from "lucide-react";
import { ResumeCampaignModal } from "./wizard/ResumeCampaignModal";
import type { Platform } from "./wizard/types";

type AdCampaign = {
  id: string;
  product_id: string;
  platform: Platform;
  status: string;
  title: string | null;
  daily_budget: number;
  duration_days: number;
  estimated_budget: number;
  external_error: string | null;
  created_at: string;
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

  if (!storeId) return null;

  return (
    <section className="app-card ad-campaigns-list">
      <div className="card-head">
        <div>
          <span className="eyebrow">Publicité</span>
          <h2>Mes campagnes</h2>
          <p>Chaque campagne créée apparaît ici avec son statut, et tu peux la lancer directement.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => void load()} aria-label="Rafraîchir">
            <RefreshCw size={16} />
          </button>
          <button type="button" className="btn btn-dark" onClick={onNewCampaign}>
            <Plus size={16} /> Nouvelle campagne
          </button>
        </div>
      </div>

      {loading ? (
        <p className="hint-line" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Loader2 size={14} className="animate-spin" /> Chargement…
        </p>
      ) : campaigns.length === 0 ? (
        <p className="hint-line">Aucune campagne pour l’instant. Crée-en une pour la voir apparaître ici.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {campaigns.map((c) => {
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
                  <strong style={{ fontSize: 13 }}>{c.title || c.product_id}</strong>
                  <span className="hint-line">
                    {c.platform === "meta" ? "Meta" : "TikTok"} · {Number(c.daily_budget).toLocaleString("fr-FR")} XOF/j · {c.duration_days} j
                  </span>
                  {c.status === "error" && c.external_error ? (
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
                  ) : c.status === "error" ? (
                    <button type="button" className="btn btn-ghost" onClick={onNewCampaign}>
                      Recommencer
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resuming ? (
        <ResumeCampaignModal
          campaignId={resuming.id}
          platform={resuming.platform}
          initialStatus={resuming.status as "paused" | "paid"}
          onClose={() => setResuming(null)}
          onLaunched={() => {
            setResuming(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
