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
  if (status === "no_ad_account") return { tone: "warn", text: "Autorisation X réussie, mais aucun compte publicitaire n'est accessible. Crée un compte sur ads.x.com avec un rôle Ad manager ou Account administrator." };
  if (reason === "ads_403") return { tone: "error", text: "X refuse l'accès aux comptes publicitaires (403). L'app X n'a probablement pas l'accès X Ads API (Standard Access), ou ton compte X n'a aucun rôle sur un compte pub." };
  if (reason === "ads_401") return { tone: "error", text: "X rejette les identifiants (401). Vérifie que X_API_KEY et X_API_SECRET correspondent bien à l'app X utilisée." };
  if (reason.startsWith("ads_")) return { tone: "error", text: `L'API X Ads a répondu avec une erreur (${reason.slice(4)}).` };
  if (reason === "missing_params") return { tone: "error", text: "L'autorisation a été annulée ou X n'a pas renvoyé de jeton." };
  if (reason === "state_expired") return { tone: "error", text: "La demande de connexion a expiré (10 min). Relance la connexion." };
  if (reason === "db_error") return { tone: "error", text: "Impossible d'enregistrer l'intégration : la migration Supabase X Ads est-elle appliquée ?" };
  return { tone: "error", text: "La connexion X Ads a échoué." };
}

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
  const colors = info.tone === "ok" ? { bg: "#ecfdf3", fg: "#067647" } : info.tone === "warn" ? { bg: "#fff5e8", fg: "#805c20" } : { bg: "#fff1f2", fg: "#be123c" };

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
    <div className="app-card" role="status" style={{ background: colors.bg, color: colors.fg, marginBottom: 16, lineHeight: 1.5 }}>
      <strong>X Ads</strong>
      <p style={{ margin: "6px 0 10px" }}>{info.text}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {info.tone !== "ok" ? <button type="button" className="btn btn-dark" onClick={() => void runDiagnosis()} disabled={loading}>{loading ? "Diagnostic…" : "Lancer le diagnostic"}</button> : null}
        <button type="button" className="btn btn-ghost" onClick={() => router.replace(pathname)}>Fermer</button>
      </div>
      {failed ? <p style={{ marginTop: 10 }}>Le diagnostic n'a pas pu s'exécuter.</p> : null}
      {diagnosis ? (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {diagnosis.verdict.length ? <ul style={{ paddingLeft: 18, margin: "0 0 8px" }}>{diagnosis.verdict.map((line) => <li key={line}>{line}</li>)}</ul> : <p>Aucun problème détecté.</p>}
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 12 }}>{JSON.stringify({ env: diagnosis.env, integrations: diagnosis.integrations, activeAccounts: diagnosis.activeAccounts, retest: diagnosis.retest }, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}
