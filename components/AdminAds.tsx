"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { fetchAdminJson } from "@/lib/admin-fetch";
import type { AdsStats } from "@/lib/admin-dashboard-types";
import { AdminPeriodPicker } from "./AdminPeriodPicker";
export function AdminAds() {
  const { locale } = useI18n();
  const en = locale === "en";
  const [query, setQuery] = useState(() => `?period=all&timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
  const [ads, setAds] = useState<AdsStats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setState("loading");
    fetchAdminJson(`/api/admin/ads${query}`).then(payload => {
      if (!payload.ads || typeof payload.ads.total_launched !== "number") throw new Error("invalid_ads_stats");
      if (current) { setAds(payload.ads); setState("ready"); }
    }).catch(() => { if (current) setState("error"); });
    return () => { current = false; };
  }, [query, retry]);
  const labels = en
    ? ["Campaigns launched with Vendeo (total)", "Active during period", "Running now", "Launched during period"]
    : ["Pubs lancées avec Vendeo (total)", "Actives sur la période", "En diffusion maintenant", "Lancées sur la période"];
  const values = ads ? [ads.total_launched, ads.active_in_period, ads.running_now, ads.launched_in_period] : [];
  return <section className="admin-card admin-ads" aria-label={en ? "Ad campaign statistics" : "Statistiques des campagnes publicitaires"}>
    <div className="admin-card-head"><h2>{en ? "Advertising campaigns" : "Campagnes publicitaires"}</h2></div>
    <AdminPeriodPicker onChange={setQuery} idPrefix="ads-period" />
    {state === "loading" && <p role="status">{en ? "Loading ad statistics…" : "Chargement des statistiques publicitaires…"}</p>}
    {state === "error" && <p role="alert">{en ? "Ad statistics unavailable." : "Statistiques publicitaires indisponibles."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry(value => value + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
    {ads && <>
      <div className="admin-kpi-grid">{labels.map((label, index) => <article className="admin-kpi" key={label}><small>{label}</small><strong>{Number(values[index]).toLocaleString(en ? "en-US" : "fr-FR")}</strong></article>)}</div>
      <p className="admin-help">{en ? "Active during period = planned delivery (launch + duration) overlapping the period; actual end date is not stored." : "Actives sur la période = diffusion prévue (lancement + durée) chevauchant la période ; la date de fin réelle n’est pas stockée"}</p>
      <div className="admin-kpi-grid">{(["meta", "tiktok", "pinterest"] as const).map(platform => <article className="admin-kpi" key={platform}><small>{platform === "meta" ? "Meta" : platform === "tiktok" ? "TikTok" : "Pinterest"}</small><strong>{Number(ads.by_platform?.[platform] ?? 0).toLocaleString(en ? "en-US" : "fr-FR")}</strong></article>)}</div>
    </>}
  </section>;
}
