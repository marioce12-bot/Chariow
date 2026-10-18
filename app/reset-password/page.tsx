"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/i18n";

export default function ResetPassword() {
  const { t , locale } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError(t("publicComplete.reset.error.length"));
    if (password !== confirmation) return setError(t("publicComplete.reset.error.match"));
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) return setError(updateError.message);
    setSaved(true);
  }

  return <main className="auth-page"><div className="auth-card"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40}/></Link><h1>{t("publicComplete.reset.title")}</h1><p>{t("publicComplete.reset.intro")}</p>{saved ? <div style={{background:'#e9f5ff',borderRadius:8,color:'#123e75',fontSize:13,lineHeight:1.6,padding:16}}>{t("publicComplete.reset.success")}</div> : <form onSubmit={submit}><div className="form-group"><label>{t("publicComplete.reset.label")}</label><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("publicComplete.reset.placeholder")} /></div><div className="form-group"><label>{t("publicComplete.reset.confirm")}</label><input required minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={t("publicComplete.reset.confirmPlaceholder")} /></div>{error&&<p style={{background:'#fff1f2',borderRadius:7,color:'#be123c',fontSize:12,lineHeight:1.5,padding:10}}>{localizeSystemMessage(error, locale)}</p>}<button className="btn btn-dark" type="submit">{t("publicComplete.reset.submit")} <ArrowRight size={15}/></button></form>}<div className="auth-foot"><Link href="/login">{t("publicComplete.reset.back")}</Link></div></div></main>;
}
