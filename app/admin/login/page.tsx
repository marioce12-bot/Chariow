"use client";
import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import { FormEvent, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
export default function AdminLoginPage() {
  const { t , locale } = useI18n(); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); const response=await fetch("/api/admin/password-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})}); if(response.ok) window.location.assign("/admin"); else { const data=await response.json().catch(()=>({})); setError(data.error??t("adminComplete.invalidPassword")); setLoading(false); } }
  return <main className="admin-password-page"><form className="admin-password-card" onSubmit={submit}><span className="admin-password-icon"><Lock size={24}/></span><span className="admin-kicker">{t("adminComplete.internal")}</span><h1>{t("adminComplete.access")}</h1><p>{t("adminComplete.loginPrompt")}</p><label>{t("adminComplete.password")}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={t("adminComplete.passwordPlaceholder")} autoComplete="current-password" autoFocus required/></label>{error&&<div className="admin-password-error">{localizeSystemMessage(error, locale)}</div>}<button className="btn btn-dark" disabled={loading}>{loading?t("adminComplete.verifying"):t("adminComplete.accessConsole")}</button><small className="admin-password-note"><ShieldCheck size={13}/>{t("adminComplete.teamOnly")}</small></form></main>;
}
