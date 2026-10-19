"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { autopilotBudgetCopy, type BudgetLocale } from "@/lib/i18n/autopilot-budget-copy";
import "./autopilot-budget.css";
import { currencyFractionDigits, validateBudgetLimit } from "@/lib/autopilot-budget";
import { isAutopilotLive, type AutopilotLiveStatus, AUTOPILOT_STATUS_MAX_AGE_MS } from "@/lib/autopilot-eligibility";

type BudgetResponse = { budget_limit: number | null; currency: string | null };
export { currencyFractionDigits } from "@/lib/autopilot-budget";

export function validateAutopilotBudgetAmount(raw: string, currency: string): { valid: boolean; value: number | null } {
  const decimals = currencyFractionDigits(currency);
  if (decimals === null || raw.trim() === "") return { valid: false, value: null };
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) return { valid: false, value: null };
  const value = Number(normalized);
  if (!validateBudgetLimit(value, currency) || (normalized.split(".")[1]?.length ?? 0) > decimals) return { valid: false, value: null };
  return { valid: true, value };
}

export function AutopilotBudgetLimit({ campaignId, enabled = false, liveStatus, onEnabledChange, onBudgetSaved }: { campaignId: string; enabled?: boolean; liveStatus?: AutopilotLiveStatus; onEnabledChange?: (enabled: boolean) => void; onBudgetSaved?: () => void }) {
  const { locale } = useI18n();
  const uniqueId = useId().replace(/:/g, "");
  const titleId = `autopilot-budget-title-${uniqueId}`;
  const amountId = `autopilot-budget-amount-${uniqueId}`;
  const currencyId = `autopilot-budget-currency-${uniqueId}`;
  const language: BudgetLocale = locale === "en" ? "en" : "fr";
  const c = autopilotBudgetCopy[language];
  const base = `/api/ad-campaigns/${encodeURIComponent(campaignId)}/autopilot`;
  const budgetEndpoint = `${base}/budget-limit`;
  const [active, setActive] = useState(enabled);
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [amount, setAmount] = useState("");
  const [activationOpen, setActivationOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [verified, setVerified] = useState<AutopilotLiveStatus | undefined>(liveStatus);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const refreshStatus = useCallback(async () => {
    if (document.visibilityState !== "visible" || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const generation = generationRef.current;
    setCheckingStatus(true);
    try {
      const response = await fetch(base, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const proof = result.autopilot_live_status;
      if (response.ok && isAutopilotLive(proof)) { setVerified(proof); setError(""); }
      else {
        setVerified(response.ok && proof?.state === "inactive" ? proof : undefined);
        setActivationOpen(false);
        setError(proof?.reasonCode === "TOKEN_EXPIRED" ? c.tokenExpired : "");
      }
    } catch {
      if (!controller.signal.aborted && generation === generationRef.current) { setVerified(undefined); setActivationOpen(false); }
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setCheckingStatus(false); }
    }
  }, [base, c]);
  useEffect(() => {
    generationRef.current++;
    requestRef.current?.abort(); requestRef.current = null;
    setVerified(liveStatus);
    if (!isAutopilotLive(liveStatus)) void refreshStatus();
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void refreshStatus(); }, 30_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void refreshStatus(); };
    const onFocus = () => void refreshStatus();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(poll); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", onFocus); requestRef.current?.abort(); requestRef.current = null; generationRef.current++; };
  }, [campaignId, liveStatus, refreshStatus]);
  useEffect(() => {
    if (!verified?.checked_at) return;
    const timer = window.setTimeout(() => { setVerified((current) => isAutopilotLive(current) ? current : undefined); setActivationOpen(false); }, Math.max(0, AUTOPILOT_STATUS_MAX_AGE_MS - (Date.now() - Date.parse(verified.checked_at))));
    return () => window.clearTimeout(timer);
  }, [verified]);
  const loadCurrency = useCallback(async (blankAmount = false) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(budgetEndpoint, { method: "GET", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(c.errors[result?.code ?? result?.error] || c.loadError);
      const numberValue = result.budget_limit == null ? null : Number(result.budget_limit);
      const next = { budget_limit: numberValue !== null && Number.isFinite(numberValue) ? numberValue : null, currency: typeof result.currency === "string" && result.currency ? result.currency.toUpperCase() : null };
      setData(next); setAmount(blankAmount ? "" : next.budget_limit == null ? "" : String(next.budget_limit));
    } catch (e) { setError(e instanceof Error ? e.message : c.loadError); }
    finally { setLoading(false); }
  }, [budgetEndpoint, c]);

  useEffect(() => { setActive(enabled); setActivationOpen(false); setData(null); setAmount(""); if (enabled) void loadCurrency(); }, [enabled, loadCurrency]);

  const patchLimit = async () => {
    if (!data?.currency || busy) return;
    const parsed = validateAutopilotBudgetAmount(amount, data.currency);
    if (!parsed.valid) { setError(c.invalid); return; }
    setBusy(true); setError(""); setFeedback("");
    try {
      const response = await fetch(budgetEndpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget_limit: parsed.value, currency: data.currency }) });
      const result = await response.json();
      if (!response.ok) throw new Error(c.errors[result?.code ?? result?.error] || c.saveError);
      const numberValue = result.budget_limit == null ? null : Number(result.budget_limit);
      const server = { budget_limit: numberValue !== null && Number.isFinite(numberValue) ? numberValue : null, currency: typeof result.currency === "string" && result.currency ? result.currency.toUpperCase() : null };
      setData(server); setAmount(server.budget_limit == null ? "" : String(server.budget_limit)); setFeedback(c.saved); onBudgetSaved?.();
    } catch (e) { setError(e instanceof Error ? e.message : c.saveError); }
    finally { setBusy(false); }
  };

  const activationRequest = async (activate: boolean) => {
    if (busy) return;
    let payload: { enabled: boolean; budget_limit?: number; currency?: string } = { enabled: false };
    if (activate) {
      if (!isAutopilotLive(verified)) { setVerified(undefined); setActivationOpen(false); return; }
      if (!data?.currency) return;
      const parsed = validateAutopilotBudgetAmount(amount, data.currency);
      if (!parsed.valid) { setError(c.invalid); return; }
      payload = { enabled: true, budget_limit: parsed.value!, currency: data.currency };
    }
    setBusy(true); setError(""); setFeedback("");
    try {
      const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (result.autopilot_live_status) { setVerified(result.autopilot_live_status); setActivationOpen(false); }
      if (!response.ok) throw new Error(c.errors[result?.code ?? result?.error] || c.activationError);
      if (result.campaign?.enabled !== activate) throw new Error(c.activationError);
      if (activate) {
        const campaign = result.campaign || {};
        const budgetValue = campaign.budget_limit == null ? null : Number(campaign.budget_limit);
        setData({ budget_limit: budgetValue !== null && Number.isFinite(budgetValue) ? budgetValue : null, currency: typeof campaign.currency === "string" ? campaign.currency.toUpperCase() : data?.currency || null });
        setActive(true); setActivationOpen(false); setFeedback(c.activated);
      } else { setData(null); setAmount(""); setActive(false); setFeedback(c.deactivated); }
      onEnabledChange?.(activate);
    } catch (e) { setError(e instanceof Error ? e.message : c.activationError); }
    finally { setBusy(false); }
  };

  const currencyKnown = !!data?.currency && currencyFractionDigits(data.currency) !== null;
  if (!isAutopilotLive(verified)) return <section className="autopilot-budget-limit" aria-live="polite">
    <p role="status">{checkingStatus ? c.verifyingStatus : verified?.state === "inactive" ? c.statusInactive : c.statusUnknown}</p>
    {!checkingStatus ? <button type="button" onClick={() => void refreshStatus()}>{c.retryStatus}</button> : null}
    {active ? <button type="button" disabled={busy} onClick={() => void activationRequest(false)}>{c.deactivate}</button> : null}
    {error ? <div role="alert">{error}</div> : null}
  </section>;
  return <section className="autopilot-budget-limit" aria-labelledby={titleId}>
    <h3 id={titleId}>{!active && !activationOpen ? c.inactiveTitle : c.title}</h3>
    {!active ? <>
      <p>{c.inactiveHelp}</p>
      {!activationOpen ? <div className="abl-actions"><button type="button" disabled={busy} onClick={() => { setActivationOpen(true); setAmount(""); void loadCurrency(true); }}>{c.activate}</button></div> : <>
        <p>{c.activationHelp}</p>
        {loading ? <p className="abl-state" role="status">{c.loading}</p> : <div className="abl-form"><div>
          <label htmlFor={amountId}>{c.label}</label>
          <input id={amountId} type="text" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} aria-describedby={currencyId} disabled={!currencyKnown || busy} />
          <div id={currencyId} className="abl-currency">{c.currency}: <strong>{data?.currency || "—"}</strong></div>
        </div></div>}
        <div className="abl-actions"><button type="button" disabled={!currencyKnown || busy || loading} onClick={() => void activationRequest(true)}>{busy ? c.saving : c.confirmActivate}</button><button type="button" className="abl-remove" disabled={busy} onClick={() => { setActivationOpen(false); setError(""); }}>{c.cancel}</button></div>
      </>}
    </> : <>
      <p>{c.description}</p>
      {loading ? <p className="abl-state" role="status">{c.loading}</p> : <>
        {data?.budget_limit != null ? <div className="abl-saved"><strong>{new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: data.currency ? currencyFractionDigits(data.currency) ?? 2 : 2 }).format(data.budget_limit)} {data.currency}</strong></div> : <div className="abl-state">{c.missing}</div>}
        <div className="abl-form"><div>
          <label htmlFor={amountId}>{c.label}</label>
          <input id={amountId} type="text" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); setFeedback(""); }} aria-describedby={currencyId} disabled={!currencyKnown || busy} />
          <div id={currencyId} className="abl-currency">{c.currency}: <strong>{data?.currency || "—"}</strong></div>
        </div><button type="button" disabled={!currencyKnown || busy} onClick={() => void patchLimit()}>{busy ? c.saving : c.save}</button></div>
        <div className="abl-actions"><button type="button" className="abl-remove" disabled={busy} onClick={() => void activationRequest(false)}>{c.deactivate}</button></div>
      </>}
    </>}
    {error ? <div className="abl-feedback abl-error" role="alert">{error}</div> : null}
    {feedback ? <div className="abl-feedback" aria-live="polite" role="status">{feedback}</div> : null}
  </section>;
}
