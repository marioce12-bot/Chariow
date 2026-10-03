"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Diagnosis = {
  env: Record<string, boolean | string | null>;
  integrations: Array<{ x_screen_name: string | null; is_active: boolean; last_error: string | null }>;
  activeAccounts: number;
  retest: { ok: boolean; status?: number; accounts?: number; detail?: string } | null;
  verdict: string[];
};

function describe(status: string, reason: string) {
  if (status === "connected") return { tone: "ok", text: "Compte X Ads connecté." };
  if (status === "no_ad_account") return { tone: "warn", text: "Autorisation X réussie, mais aucun compte publicitaire accessible. Crée-en un sur ads.x.com (rôle Ad manager ou Account administrator)." };
  if (reason === "ads_403") return { tone: "error", text: "X refuse l'accès aux comptes pub (403) : accès X Ads API non approuvé, ou aucun rôle sur un compte pub." };
  if (reason === "ads_401") return { tone: "error", text: "X rejette les identifiants (401) : vérifie X_API_KEY et X_API_SECRET." };
  if (reason.startsWith("ads_")) return { tone: "error", text: `L'API X Ads a répondu avec une erreur (${reason.slice(4)}).` };
  if (reason === "missing_params") return { tone: "error", text: "Autorisation annulée ou jeton non renvoyé par X." };
  if (reason === "state_expired") return { tone: "error", text: "Demande de connexion expirée (10 min). Relance la connexion." };
  if (reason === "db_error") return { tone: "error", text: "Enregistrement impossible : migration Supabase X Ads appliquée ?" };
  return { tone: "error", text: "La connexion X Ads a échoué." };
}

const TONES = {
  ok: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.45)" },
  warn: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.45)" },
  error: { bg: "rgba(244,63,94,0.12)", border: "rgba(244,63,94,0.45)" },
} as const;

const smallButton = { background: "transparent", border: "1px solid currentColor", borderRadius: 999, color: "inherit", cursor: "pointer", fontSize: 12, padding: "5px 12px" } as const;

// Bandeau compact affiché après un retour OAuth X (?x=...). Couleurs translucides pour rester lisible en thème sombre.
export function XConnectionNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const status = params.get("x");
  if (!status) return null;
  const reason = params.get("reason") ?? "";
  const info = describe(status, reason);
  const tone = TONES[info.tone as keyof typeof TONES];

  async function runDiagnosis() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/integrations/x/diagnose", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setDiagnosis((await res.json()) as Diagnosis);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div role="status" style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 12, fontSize: 13, lineHeight: 1.45, margin: "0 0 12px", padding: "10px 12px" }}>
      <div style={{ alignItems: "flex-start", display: "flex", gap: 8, justifyContent: "space-between" }}>
        <span><strong>X Ads · </strong>{info.text}</span>
        <button type="button" aria-label="Fermer" onClick={() => router.replace(pathname)} style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      {info.tone !== "ok" && !diagnosis ? (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => void runDiagnosis()} disabled={loading} style={smallButton}>{loading ? "Diagnostic…" : "Lancer le diagnostic"}</button>
        </div>
      ) : null}
      {failed ? <p style={{ margin: "8px 0 0" }}>Le diagnostic n'a pas pu s'exécuter.</p> : null}
      {diagnosis ? (
        <div style={{ marginTop: 8 }}>
          {diagnosis.verdict.length ? <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>{diagnosis.verdict.map((line) => <li key={line}>{line}</li>)}</ul> : <p style={{ margin: "0 0 6px" }}>Aucun problème détecté.</p>}
          <details>
            <summary style={{ cursor: "pointer" }}>Détails techniques</summary>
            <pre style={{ fontSize: 11, margin: "6px 0 0", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify({ env: diagnosis.env, integrations: diagnosis.integrations, activeAccounts: diagnosis.activeAccounts, retest: diagnosis.retest }, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
