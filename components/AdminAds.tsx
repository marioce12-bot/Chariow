"use client";
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { fetchAdminJson } from "@/lib/admin-fetch";
import { AdminPeriodPicker, periodQuery } from "./AdminPeriodPicker";
import "./admin-revenue.css";

export type AdsMetrics = {
  total_launched: number; total_launched_users: number; active_now: number;
  launched_in_period: number; active_in_period: number;
  by_platform: Record<string, number>; active_in_period_by_platform: Record<string, number>;
  by_status: Record<string, number>;
  period: { preset: string; start: string | null; end: string; startAt: string | null; endAt: string; timeZone: string };
};
const platformName: Record<string, string> = { meta: "Meta", tiktok: "TikTok", pinterest: "Pinterest", reddit: "Reddit", x: "X" };

// Publicités lancées avec Vendeo : total (actives ou non) + actives sur la période choisie.
export function AdminAds({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const language = en ? "en-US" : "fr-FR";
  const [ads, setAds] = useState<AdsMetrics | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(() => periodQuery("30d"));
  useEffect(() => {
    let current = true;
    setState("loading");
    fetchAdminJson(`/api/admin/ads${query}`).then((payload) => {
      const value = payload.ads;
      if (!value || typeof value.total_launched !== "number" || typeof value.active_in_period !== "number") throw new Error();
      if (current) { setAds(value); setState("ready"); }
    }).catch(() => { if (current) setState("error"); });
    return () => { current = false; };
  }, [refreshRevision, retry, query]);
  const n = (value: number | undefined) => value == null ? "—" : Number(value).toLocaleString(language);
  const date = (value: string) => new Date(value).toLocaleDateString(language, { timeZone: ads?.period.timeZone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  const label = ads?.period.preset === "custom" ? (en ? "Custom range" : "Intervalle personnalisé")
    : ads?.period.preset && ads.period.preset !== "all" ? `${ads.period.preset.slice(0, -1)} ${en ? "days" : "jours"}` : en ? "All history" : "Tout l’historique";
  const split = (values: Record<string, number> | undefined) => Object.entries(values ?? {}).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${platformName[key] ?? key} ${n(count)}`).join(" · ") || "—";
  const cards: [string, number | undefined, string][] = ads ? [
    [en ? "Ads launched with Vendeo" : "Pubs lancées avec Vendeo", ads.total_launched, en ? `All time · active or not · ${n(ads.total_launched_users)} advertiser(s)` : `Depuis le début · actives ou non · ${n(ads.total_launched_users)} annonceur(s)`],
    [en ? "Active ads right now" : "Pubs actives en ce moment", ads.active_now, en ? "Current status: active" : "Statut actuel : actif"],
    [en ? "Ads active over the period" : "Pubs actives sur la période", ads.active_in_period, `${label} · ${date(ads.period.startAt ?? ads.period.endAt)} → ${date(ads.period.endAt)}`],
    [en ? "Ads launched over the period" : "Pubs lancées sur la période", ads.launched_in_period, en ? "New launches only" : "Nouveaux lancements uniquement"],
  ] : [];
  return <section className="admin-card admin-revenue" aria-label={en ? "Vendeo ads" : "Publicités Vendeo"}>
    <div className="admin-card-head"><div><h2>{en ? "Ads launched with Vendeo" : "Publicités lancées avec Vendeo"}</h2>
      <p className="admin-help">{en ? "Campaigns actually sent to the ad platform · drafts and unpaid attempts excluded" : "Campagnes réellement envoyées à la plateforme publicitaire · brouillons et essais non aboutis exclus"}</p></div><Megaphone size={19} /></div>
    <AdminPeriodPicker idPrefix="ads" onChange={setQuery} />
    {state === "loading" && <p role="status">{en ? "Loading ads…" : "Chargement des publicités…"}</p>}
    {state === "error" && <p role="alert">{en ? "Ads statistics unavailable. No value is shown as zero." : "Statistiques publicitaires indisponibles. Aucune valeur n’est remplacée par un zéro."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry((v) => v + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
    {ads && state === "ready" && <>
      <div className="admin-revenue-grid ads-grid" aria-live="polite">
        {cards.map(([title, value, note]) => <article className="admin-kpi" key={title}><small>{title}</small><strong>{n(value)}</strong><small>{note}</small></article>)}
      </div>
      <p className="admin-help">{en ? "Launched by platform: " : "Lancées par plateforme : "}{split(ads.by_platform)}</p>
      <p className="admin-help">{en ? "Active over the period by platform: " : "Actives sur la période par plateforme : "}{split(ads.active_in_period_by_platform)}</p>
      <p className="admin-help">{en
        ? "“Active over the period” = ran at some point in the period (launch date to planned end, or to the pause/archive date). Rejected and failed ads are excluded. Ads launched before tracking began use their creation date."
        : "« Active sur la période » = a diffusé à un moment de la période (de la date de lancement à la fin prévue, ou à la date de pause/archivage). Les pubs refusées ou en erreur sont exclues. Les pubs lancées avant le suivi utilisent leur date de création."}</p>
    </>}
  </section>;
}
