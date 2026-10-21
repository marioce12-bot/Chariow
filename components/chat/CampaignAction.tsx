"use client";
import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";

export type CampaignActionData = { campaignId: string; action: "edit" | "delete" | "pause" | "activate" | "duplicate" };
type Preview = { campaignId: string; name: string; platform: string; action: CampaignActionData["action"]; changes?: { title?: string; daily_budget?: number }; currentStatus: string; warning?: string; requiresConfirmation: boolean };
export function CampaignAction({ data }: { data: CampaignActionData }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const label: Record<CampaignActionData["action"], string> = { edit: en ? "Edit" : "Modifier", delete: en ? "Delete" : "Supprimer", pause: en ? "Pause" : "Mettre en pause", activate: en ? "Activate" : "Activer", duplicate: en ? "Duplicate" : "Dupliquer" };
  async function prepare() {
    if (inFlight.current) return;
    let changes: { title?: string; daily_budget?: number } | undefined;
    if (data.action === "edit") {
      if (!title.trim() && !budget.trim()) { setError(en ? "Enter an exact title or daily USD budget." : "Saisis un titre exact ou un budget quotidien en USD."); return; }
      if (budget.trim() && (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(budget.trim()) || Number(budget) <= 0 || !Number.isFinite(Number(budget))) ) { setError(en ? "Budget must be a positive USD amount with at most 2 decimals." : "Le budget doit être un montant USD positif avec au plus 2 décimales."); return; }
      changes = { ...(title.trim() ? { title: title.trim() } : {}), ...(budget.trim() ? { daily_budget: Number(budget) } : {}) };
    }
    inFlight.current = true;
    setBusy(true); setError(""); setDone(""); setPreview(null); setToken(null);
    try {
      const r = await fetch("/api/chat/campaign-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "prepare", campaignId: data.campaignId, action: data.action, ...(changes ? { changes } : {}) }) });
      const result = await r.json().catch(() => ({}));
      if (!r.ok || !result.preview || typeof result.token !== "string") throw new Error(result.error || `HTTP ${r.status}`);
      setPreview(result.preview); setToken(result.token);
    } catch (e) { setError(e instanceof Error ? e.message : (en ? "Request failed" : "La demande a échoué")); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function confirm() {
    if (inFlight.current || !preview || !token) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/chat/campaign-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "execute", campaignId: data.campaignId, action: data.action, ...(preview.changes ? { changes: preview.changes } : {}), token, confirmed: true }) });
      const result = await r.json().catch(() => ({}));
      if (!r.ok || result.error || typeof result.message !== "string" || !result.message.trim()) throw new Error(result.error || (en ? "Unverified result. Check the campaign before retrying." : "Résultat non vérifié. Vérifie la campagne avant de réessayer."));
      setDone(result.message); setPreview(null); setToken(null);
    } catch (e) { setError(e instanceof Error ? e.message : (en ? "Request failed" : "La demande a échoué")); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="campaign-action-card" aria-label={en ? "Campaign action preview" : "Action sur la campagne"}>
    <strong>{label[data.action]} · {data.campaignId}</strong>
    {data.action === "edit" && !preview && <div><label>{en ? "Exact new title" : "Nouveau titre exact"}<input value={title} onChange={e => setTitle(e.target.value)} disabled={busy} /></label><label>{en ? "Daily budget (USD)" : "Budget quotidien (USD)"}<input inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} disabled={busy} /></label></div>}
    {!preview && !done && <button type="button" disabled={busy} onClick={() => void prepare()}>{busy ? (en ? "Preparing…" : "Préparation…") : (en ? "Prepare preview" : "Préparer l’aperçu")}</button>}
    {preview && <div role="group" aria-label={en ? "Identified preview" : "Aperçu identifié"}><p><b>{en ? "Target" : "Cible"}:</b> {preview.name} ({preview.campaignId})</p><p><b>{en ? "Platform" : "Plateforme"}:</b> {preview.platform}</p><p><b>{en ? "Current status" : "État actuel"}:</b> {preview.currentStatus}</p><p><b>{en ? "Exact changes" : "Changements exacts"}:</b> {preview.changes ? JSON.stringify(preview.changes) : label[data.action]}</p>{data.action === "activate" && <p role="alert">{en ? "Activation may start spending the campaign budget." : "L’activation peut engager des dépenses sur le budget de cette campagne."}</p>}{data.action === "delete" && <p role="alert">{en ? "Deletion is irreversible." : "La suppression est irréversible."}</p>}{preview.changes?.daily_budget !== undefined && <p>{en ? "Daily budget in USD. A published campaign cannot be edited here." : "Budget quotidien en USD. Une campagne déjà publiée ne peut pas être modifiée ici."}</p>}{preview.warning && <p role="alert">{preview.warning}</p>}<button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? (en ? "Working…" : "En cours…") : (en ? `Confirm ${label[data.action].toLowerCase()}` : `Confirmer : ${label[data.action].toLowerCase()}`)}</button><button type="button" disabled={busy} onClick={() => { setPreview(null); setToken(null); setError(""); }}>{en ? "Cancel" : "Annuler"}</button></div>}
    {done && <p role="status">{done}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
