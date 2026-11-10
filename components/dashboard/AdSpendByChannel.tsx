"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigationCache } from "./NavigationDataCache";
import { BarChart3 } from "lucide-react";
import { toUsd } from "@/lib/currency";
import { isAdPlatformAllowed, type AdPlatform, type PlanId } from "@/lib/plans";
import { useI18n } from "@/lib/i18n/i18n";
import { Skeleton } from "./Skeleton";

/**
 * Dépenses publicitaires par canal (Meta, TikTok, Pinterest) sur la période choisie, sous forme de graphiques.
 * Chaque canal est converti en USD pour pouvoir être comparé.
 *
 * - Comparaison par canal : une barre horizontale par plateforme, avec les métriques de période.
 *   Le détail Meta conserve les campagnes, les clics, les impressions et les conversions.
 * - Courbe : dépense Meta jour par jour. Les API TikTok et Pinterest ne renvoient que des totaux (pas de
 *   courbe jour par jour), elles apparaissent donc uniquement dans les barres.
 *
 * Meta : on additionne TOUS les comptes publicitaires connectés (un utilisateur peut en avoir
 * plusieurs, tous marqués « sélectionnés »), y compris les campagnes lancées directement depuis Meta Ads Manager
 * et celles lancées depuis Vendeo qui n'ont pas encore de données. Si la dernière synchro d'un
 * compte date de plus de 15 minutes, on la relance en arrière-plan puis on rafraîchit.
 */

type ChannelId = "meta" | "tiktok" | "pinterest";
type ChannelStat = {
  id: ChannelId;
  badge: AdPlatform;
  label: string;
  color: string;
  connected: boolean;
  failed: boolean;
  spendUsd: number;
  clicks: number;
  conversions: number;
};
type CampaignStat = {
  id: string;
  name: string;
  clicks: number;
  impressions: number;
  spendUsd: number;
  conversions: number;
};
type DailyPoint = { date: string; spendUsd: number };
type MetaAccountReading = { accountId: string; ok: boolean; spendUsd: number; clicks: number; conversions: number; campaigns: CampaignStat[]; stale: boolean; reconnectRequired?: boolean };
type AdSpendData = { stats: ChannelStat[]; campaigns: CampaignStat[]; readings: MetaAccountReading[]; daily: DailyPoint[] };
type VendeoCampaign = { platform?: string; title?: string | null; product_name?: string | null; external_campaign_id?: string | null };
type AccountRef = { id: string; currency?: string; is_selected?: boolean | null; needs_reconnect?: boolean };
type DailyResponse = { currency?: string; days?: Array<{ date: string; spend: number }> } | null;

const CHANNELS: Array<Pick<ChannelStat, "id" | "badge" | "label" | "color">> = [
  { id: "meta", badge: "facebook", label: "Meta", color: "#1877F2" },
  { id: "tiktok", badge: "tiktok", label: "TikTok", color: "#111827" },
  { id: "pinterest", badge: "pinterest", label: "Pinterest", color: "#E60023" },
];

// Géométrie du suivi quotidien : hauteur fixe, largeur mesurée dans le conteneur
// pour garder des étiquettes lisibles sans agrandir tout le SVG sur grand écran.
const LINE_H = 224;
const LINE_PAD = { top: 20, bottom: 34, left: 54, right: 14 };

const STALE_MS = 15 * 60 * 1000;
const AUTO_SYNC_COOLDOWN_MS = 2 * 60 * 1000;
// Évite de relancer la synchro en boucle (changement de période, rafraîchissements).
const lastAutoSync = new Map<string, number>();

/** Montant en USD avec 2 décimales : les petites dépenses (ex. 2,63 USD) ne sont plus arrondies à 3. */
function usd(value: number, locale: string) {
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

function dayLabel(date: string, locale: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

function emptyStat(base: (typeof CHANNELS)[number]): ChannelStat {
  return { ...base, connected: false, failed: false, spendUsd: 0, clicks: 0, conversions: 0 };
}

async function getJson(url: string): Promise<any | null> {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function sumUsd(entries: Array<{ spend: number; currency: string }>) {
  return entries.reduce((total, entry) => total + (toUsd(entry.spend, entry.currency) ?? 0), 0);
}

/** Additionne la dépense quotidienne de tous les comptes Meta (en USD) et comble les jours sans dépense avec 0. */
function buildDaily(lists: DailyResponse[], fromDay: string, toDay: string): DailyPoint[] {
  const byDate = new Map<string, number>();
  for (const list of lists) {
    if (!list?.days) continue;
    for (const day of list.days) byDate.set(day.date, (byDate.get(day.date) ?? 0) + (toUsd(Number(day.spend ?? 0), list.currency ?? "") ?? 0));
  }
  const points: DailyPoint[] = [];
  const cursor = new Date(`${fromDay}T00:00:00Z`);
  const end = new Date(`${toDay}T00:00:00Z`);
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    points.push({ date, spendUsd: byDate.get(date) ?? 0 });
  }
  return points;
}

/** Regroupe les lectures de tous les comptes Meta en un seul canal + une liste de campagnes. */
function mergeMeta(readings: MetaAccountReading[], vendeoCampaigns: VendeoCampaign[]): { stat: ChannelStat; campaigns: CampaignStat[] } {
  const base = emptyStat(CHANNELS[0]);
  const valid = readings.filter((reading) => reading.ok);
  const byId = new Map<string, CampaignStat>();
  for (const reading of valid) for (const campaign of reading.campaigns) byId.set(campaign.id, campaign);
  // Campagnes lancées depuis Vendeo qui n'ont encore aucune donnée chez Meta (en revue, tout juste lancées) :
  // on les affiche quand même, à zéro, pour que la liste soit complète.
  for (const campaign of vendeoCampaigns) {
    const id = campaign.external_campaign_id;
    if (campaign.platform !== "meta" || !id || byId.has(id)) continue;
    byId.set(id, { id, name: campaign.title || campaign.product_name || id, clicks: 0, impressions: 0, spendUsd: 0, conversions: 0 });
  }
  return {
    stat: {
      ...base,
      connected: true,
      failed: valid.length === 0,
      spendUsd: valid.reduce((total, reading) => total + reading.spendUsd, 0),
      clicks: valid.reduce((total, reading) => total + reading.clicks, 0),
      conversions: valid.reduce((total, reading) => total + reading.conversions, 0),
    },
    campaigns: [...byId.values()].sort((a, b) => b.spendUsd - a.spendUsd || b.clicks - a.clicks),
  };
}

export function AdSpendByChannel({ plan, storeId, periodDays, refreshKey }: { plan: PlanId; storeId: string | null; periodDays: number; refreshKey: number }) {
  const { locale , t } = useI18n();
  const en = locale === "en";
  const tr = (fr: string, english: string) => (en ? english : fr);
  const cache = useNavigationCache();
  // Identity includes store, period and plan; mutations refresh the same usable reading.
  const cacheKey = useMemo(() => `/__computed/ad-spend/${JSON.stringify([storeId, periodDays, plan])}`, [storeId, periodDays, plan]);
  const cached = useSyncExternalStore(cache.subscribe, () => cache.snapshot(cacheKey), () => cache.snapshot(null)) as { data?: AdSpendData; loading: boolean; refreshing: boolean; error: boolean };
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const lineContainerRef = useRef<HTMLDivElement>(null);
  const [lineWidth, setLineWidth] = useState(640);
  const stats = cached.data?.stats ?? CHANNELS.map(emptyStat);
  const metaCampaigns = cached.data?.campaigns ?? [];
  const daily = cached.data?.daily ?? [];
  const loading = cached.data === undefined && cached.loading;
  const loaderRef = useRef<() => Promise<any>>(async () => ({}));

  useEffect(() => {
    let cancelled = false;
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - periodDays + 1);
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    const range = `from=${fromDay}&to=${toDay}`;

    async function readMetaAccount(accountId: string, reconnectRequired = false): Promise<MetaAccountReading> {
      if (reconnectRequired) return { accountId, ok: false, spendUsd: 0, clicks: 0, conversions: 0, campaigns: [], stale: false, reconnectRequired: true };
      const perf = await getJson(`/api/meta/performance?account_id=${encodeURIComponent(accountId)}&store_id=${encodeURIComponent(storeId ?? "")}&${range}`);
      if (!perf) return { accountId, ok: false, spendUsd: 0, clicks: 0, conversions: 0, campaigns: [], stale: false };
      const performances: Array<{ id?: string; name?: string; clicks?: number; impressions?: number; spend?: number; conversions?: number }> = perf.performances ?? [];
      const lastSynced = perf.lastSyncedAt ? new Date(perf.lastSyncedAt).getTime() : 0;
      const campaigns: CampaignStat[] = performances
        .map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? item.id ?? ""),
          clicks: Number(item.clicks ?? 0),
          impressions: Number(item.impressions ?? 0),
          spendUsd: toUsd(Number(item.spend ?? 0), perf.currency) ?? 0,
          conversions: Number(item.conversions ?? 0),
        }))
        .filter((item) => item.id);
      return {
        accountId,
        ok: true,
        spendUsd: toUsd(Number(perf.overview?.spend ?? 0), perf.currency) ?? 0,
        clicks: performances.reduce((total, item) => total + (item.clicks ?? 0), 0),
        conversions: Number(perf.overview?.conversions ?? 0),
        campaigns,
        stale: !lastSynced || Date.now() - lastSynced > STALE_MS,
      };
    }

    async function loadMeta() {
      const [accountsData, campaignsData] = await Promise.all([getJson("/api/integrations/meta/accounts"), getJson("/api/ad-campaigns")]);
      const vendeoCampaigns: VendeoCampaign[] = Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : [];
      const accounts: AccountRef[] = accountsData?.accounts ?? [];
      if (!accounts.length) return { stat: emptyStat(CHANNELS[0]), campaigns: [] as CampaignStat[], readings: [] as MetaAccountReading[], daily: [] as DailyPoint[], vendeoCampaigns };
      const syncableAccounts = accounts.filter((account) => !account.needs_reconnect);
      const [readings, activeLists, dailyLists] = await Promise.all([
        Promise.all(accounts.map((account) => readMetaAccount(account.id, Boolean(account.needs_reconnect)))),
        Promise.all(syncableAccounts.map((account) => getJson(`/api/meta/active-campaigns?account_id=${encodeURIComponent(account.id)}`))),
        Promise.all(syncableAccounts.map((account) => getJson(`/api/meta/daily-spend?account_id=${encodeURIComponent(account.id)}&${range}`) as Promise<DailyResponse>)),
      ]);
      const merged = mergeMeta(readings, vendeoCampaigns);
      // Seules les campagnes en cours chez Meta sont listées (les anciennes, en pause ou archivées, sont masquées).
      // Si le statut est illisible pour un compte, on ne filtre pas pour ne rien cacher à tort.
      const statusKnown = syncableAccounts.length > 0 && activeLists.length === syncableAccounts.length && activeLists.every((list) => Array.isArray(list?.activeIds));
      const activeIds = new Set<string>(activeLists.flatMap((list) => (Array.isArray(list?.activeIds) ? list.activeIds : [])));
      return {
        ...merged,
        campaigns: statusKnown ? merged.campaigns.filter((campaign) => activeIds.has(campaign.id)) : merged.campaigns,
        readings,
        daily: buildDaily(dailyLists, fromDay, toDay),
        vendeoCampaigns,
      };
    }

    async function syncMeta(accountId: string) {
      try {
        const response = await fetch("/api/meta/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, from: fromDay, to: toDay }),
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    // TikTok et Pinterest ont la même forme de réponse : on additionne tous les comptes connectés.
    async function loadSimple(index: 1 | 2, accountsUrl: string, perfUrl: string): Promise<ChannelStat> {
      const base = emptyStat(CHANNELS[index]);
      const accountsData = await getJson(accountsUrl);
      const accounts: AccountRef[] = accountsData?.accounts ?? [];
      if (!accounts.length) return base;
      const results = await Promise.all(accounts.map((account) => getJson(`${perfUrl}?account_id=${encodeURIComponent(account.id)}&${range}`)));
      const valid = results.filter(Boolean) as Array<{ currency: string; overview: { spend: number; clicks: number; conversions: number } }>;
      if (!valid.length) return { ...base, connected: true, failed: true };
      return {
        ...base,
        connected: true,
        failed: valid.length < results.length,
        spendUsd: sumUsd(valid.map((item) => ({ spend: item.overview.spend, currency: item.currency }))),
        clicks: valid.reduce((total, item) => total + item.overview.clicks, 0),
        conversions: valid.reduce((total, item) => total + item.overview.conversions, 0),
      };
    }

    loaderRef.current = async () => {
      const [meta, tiktok, pinterest] = await Promise.all([
      loadMeta(),
      isAdPlatformAllowed(plan, "tiktok") ? loadSimple(1, "/api/integrations/tiktok/accounts", "/api/tiktok/performance") : Promise.resolve(emptyStat(CHANNELS[1])),
      loadSimple(2, "/api/integrations/pinterest/accounts", "/api/pinterest/performance"),
      ]);
      return { stats: [meta.stat, tiktok, pinterest] as ChannelStat[], campaigns: meta.campaigns as CampaignStat[], readings: meta.readings as MetaAccountReading[], daily: meta.daily as DailyPoint[] };
    };
    void cache.loadComputed(cacheKey, () => loaderRef.current(), refreshKey).then(async () => {
      if (cancelled) return;
      const current = cache.snapshot(cacheKey).data as AdSpendData | undefined;
      if (!current) return;

      // Comptes Meta dont les données sont anciennes (ou jamais synchronisées) : on resynchronise en
      // arrière-plan, puis on relit les chiffres. Les données déjà affichées restent en place.
      const staleIds = current.readings.filter((reading) => reading.ok && reading.stale && !reading.reconnectRequired).map((reading) => reading.accountId)
        .filter((accountId) => Date.now() - (lastAutoSync.get(accountId) ?? 0) >= AUTO_SYNC_COOLDOWN_MS);
      if (!staleIds.length) return;
      for (const accountId of staleIds) lastAutoSync.set(accountId, Date.now());
      setMetaSyncing(true);
      const outcomes = await Promise.all(staleIds.map((accountId) => syncMeta(accountId)));
      if (outcomes.some(Boolean) && !cancelled) {
        if (!cancelled) void cache.loadComputed(cacheKey, loaderRef.current, refreshKey, true);
      }
      if (!cancelled) setMetaSyncing(false);
    });
    return () => { cancelled = true; };
  }, [cache, cacheKey, plan, storeId, periodDays, refreshKey]);
  useEffect(() => { void cache.loadComputed(cacheKey, () => loaderRef.current(), refreshKey); }, [cache, cacheKey, cached, refreshKey]);
  useEffect(() => {
    const refreshStale = () => { if (document.visibilityState === "visible" && document.hasFocus()) void cache.loadComputed(cacheKey, () => loaderRef.current(), refreshKey); };
    const timer = window.setInterval(refreshStale, 12 * 60_000);
    window.addEventListener("focus", refreshStale);
    document.addEventListener("visibilitychange", refreshStale);
    return () => { clearInterval(timer); window.removeEventListener("focus", refreshStale); document.removeEventListener("visibilitychange", refreshStale); };
  }, [cache, cacheKey, refreshKey]);

  const connected = stats.filter((stat) => stat.connected);
  const totalUsd = stats.reduce((total, stat) => total + stat.spendUsd, 0);
  const maxUsd = Math.max(1, ...stats.map((stat) => stat.spendUsd));
  const numberLocale = en ? "en-US" : "fr-FR";
  const metaStat = stats[0];

  // --- Courbe : dépense Meta par jour. ---
  const showLine = metaStat.connected && !metaStat.failed && daily.length > 1;
  const maxDaily = Math.max(0.01, ...daily.map((point) => point.spendUsd));
  const lineInnerW = Math.max(1, lineWidth - LINE_PAD.left - LINE_PAD.right);
  const lineInnerH = LINE_H - LINE_PAD.top - LINE_PAD.bottom;
  const px = (index: number) => LINE_PAD.left + (daily.length <= 1 ? 0 : (index / (daily.length - 1)) * lineInnerW);
  const py = (value: number) => LINE_PAD.top + (1 - value / maxDaily) * lineInnerH;
  const linePath = daily.map((point, index) => `${index ? "L" : "M"}${px(index).toFixed(1)} ${py(point.spendUsd).toFixed(1)}`).join(" ");
  const areaPath = daily.length > 1 ? `${linePath} L${px(daily.length - 1).toFixed(1)} ${LINE_H - LINE_PAD.bottom} L${px(0).toFixed(1)} ${LINE_H - LINE_PAD.bottom} Z` : "";
  const hovered = hoverIndex !== null ? daily[hoverIndex] : undefined;
  useEffect(() => {
    const element = lineContainerRef.current;
    if (!element) return;
    const updateWidth = () => setLineWidth(Math.max(280, Math.round(element.getBoundingClientRect().width)));
    updateWidth();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [showLine]);
  function onLinePointer(event: ReactPointerEvent<SVGSVGElement>) {
    if (daily.length < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) / rect.width) * lineWidth;
    const index = Math.round(((x - LINE_PAD.left) / lineInnerW) * (daily.length - 1));
    setHoverIndex(Math.min(daily.length - 1, Math.max(0, index)));
  }

  return (
    <section className="app-card adspend-card">
      <div className="card-head">
        <div>
          <h2>{tr(t("sweep3.text134"), "Ad spend")}</h2>
          <p className="hint-line" style={{ margin: 0 }}>{tr(t("dynamicExtra.spendPeriod", { days: (periodDays) }), `All channels, last ${periodDays} days, converted to USD.`)}{metaSyncing ? ` ${tr(t("sweep1.text135"), "Updating Meta…")}` : ""}</p>
        </div>
        <BarChart3 size={18} />
      </div>

      {cached.data?.readings.some((reading) => reading.reconnectRequired) ? <p className="meta-account-warning" role="alert">{tr(t("ads.reconnectMetaRequired"), "Reconnect your Meta Ads connection to resume syncing.")}</p> : null}
      {loading && !connected.length ? (
        <div style={{ marginTop: 12, display: "grid", gap: 12 }} role="status" aria-busy="true" aria-label={tr(t("sweep2.text136"), "Loading spend")}>
          <div style={{ display: "grid", gap: 6 }}>
            <Skeleton width={110} height={11} />
            <Skeleton width={150} height={24} />
          </div>
          <Skeleton height={120} radius={12} />
          <Skeleton height={84} radius={12} />
        </div>
      ) : !connected.length ? (
        <p className="hint-line" style={{ marginTop: 12 }}>{tr(t("sweep3.text137"), "No ad channel connected. Connect Meta, TikTok or Pinterest in “Ad accounts”.")}</p>
      ) : (
        <>
          <div className="adspend-total">
            <div>
              <span className="adspend-total-label">{tr(t("sweep1.text138"), "Total spent")}</span>
              <strong>{usd(totalUsd, numberLocale)}</strong>
            </div>
            <span className="adspend-total-period">{tr("Total des canaux connectés", "Combined connected channels")}</span>
          </div>

          <div className="adspend-chart-heading">
            <h3>{tr("Dépenses par canal", "Spend by channel")}</h3>
            <p>{tr("La longueur des barres compare les montants sur la même période.", "Bar length compares amounts across the same period.")}</p>
          </div>
          <div className="adspend-channel-grid" role="list" aria-label={tr("Dépenses par canal publicitaire", "Spend by ad channel")}>
            {stats.map((stat) => {
              const hasData = stat.connected && !stat.failed;
              const barPercent = hasData && maxUsd > 0 ? Math.min(100, Math.max(0, (stat.spendUsd / maxUsd) * 100)) : 0;
              return (
                <article className="adspend-channel" key={stat.id} role="listitem">
                  <div className="adspend-channel-heading">
                    <span className="adspend-channel-dot" aria-hidden="true" style={{ backgroundColor: stat.color }} />
                    <h4>{stat.label}</h4>
                  </div>
                  {hasData ? <strong className="adspend-channel-amount">{usd(stat.spendUsd, numberLocale)}</strong> : <span className="adspend-channel-status">{!stat.connected ? tr(t("sweep2.text139"), "Not connected") : tr(t("sweep1.text141"), "Data unavailable right now.")}</span>}
                  <div className="adspend-bar-track" aria-hidden="true">
                    <span style={{ width: `${barPercent}%`, backgroundColor: stat.color }} />
                  </div>
                  {hasData ? (
                    <div className="adspend-channel-metrics">
                      <span>{stat.clicks.toLocaleString(numberLocale)} {tr(t("optionsExtra.text12"), "clicks")}</span>
                      <span>{stat.conversions.toLocaleString(numberLocale)} {tr("conversions", "conversions")}</span>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {metaCampaigns.length ? (
            <details className="adspend-campaigns">
              <summary>
                <span>{tr("Répartition des campagnes Meta", "Meta campaign breakdown")}</span>
                <small>{metaCampaigns.length} {tr("campagnes", "campaigns")}</small>
              </summary>
              <div className="adspend-campaign-list">
                {metaCampaigns.map((campaign) => (
                  <div className="adspend-campaign-row" key={campaign.id}>
                    <div className="adspend-campaign-copy">
                      <strong title={campaign.name}>{campaign.name}</strong>
                      <small>{campaign.clicks.toLocaleString(numberLocale)} {tr(t("optionsExtra.text12"), "clicks")} · {campaign.impressions.toLocaleString(numberLocale)} {tr("impressions", "impressions")} · {campaign.conversions.toLocaleString(numberLocale)} {tr("conversions", "conversions")}</small>
                    </div>
                    <strong className="adspend-campaign-amount">{usd(campaign.spendUsd, numberLocale)}</strong>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {/* Courbe : dépense Meta par jour */}
          {showLine ? (
            <div className="adspend-trend">
              <div className="adspend-trend-heading">
                <div>
                  <h3>{tr("Dépense Meta par jour", "Meta spend per day")}</h3>
                  <p>{tr("Chaque point représente une journée · axe vertical en USD", "Each point is one day · vertical axis in USD")}</p>
                </div>
                <span className="adspend-trend-value" aria-live="polite">
                  {hovered ? `${dayLabel(hovered.date, numberLocale)} · ${usd(hovered.spendUsd, numberLocale)}` : tr("Touchez ou survolez la courbe", "Touch or hover over the chart")}
                </span>
              </div>
              <div className="adspend-trend-plot" ref={lineContainerRef}>
                <svg
                  viewBox={`0 0 ${lineWidth} ${LINE_H}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={tr("Courbe de la dépense Meta par jour", "Meta daily spend curve")}
                  onPointerDown={onLinePointer}
                  onPointerMove={onLinePointer}
                  onPointerLeave={() => setHoverIndex(null)}
                >
                  <defs>
                    <linearGradient id="adspend-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1877F2" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#1877F2" stopOpacity={0.015} />
                    </linearGradient>
                  </defs>
                  {[maxDaily, maxDaily / 2, 0].map((value, index) => {
                    const y = py(value);
                    return (
                      <g key={`${value}-${index}`}>
                        <line x1={LINE_PAD.left} y1={y} x2={lineWidth - LINE_PAD.right} y2={y} stroke={index === 2 ? "#CBD5E1" : "#E8EDF5"} strokeWidth={1} strokeDasharray={index === 2 ? undefined : "3 4"} />
                        <text x={LINE_PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="#64748B">{value.toLocaleString(numberLocale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</text>
                      </g>
                    );
                  })}
                  <text x={LINE_PAD.left} y={11} fontSize={9} fontWeight={700} fill="#64748B">USD</text>
                  <path d={areaPath} fill="url(#adspend-area)" />
                  <path d={linePath} fill="none" stroke="#1877F2" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  {daily.map((point, index) => <circle key={point.date} cx={px(index)} cy={py(point.spendUsd)} r={hoverIndex === index ? 4.5 : 2} fill={hoverIndex === index ? "#1877F2" : "#fff"} stroke="#1877F2" strokeWidth={hoverIndex === index ? 2 : 1.5} />)}
                  {hovered && hoverIndex !== null ? (
                    <g>
                      <line x1={px(hoverIndex)} y1={LINE_PAD.top} x2={px(hoverIndex)} y2={LINE_H - LINE_PAD.bottom} stroke="#64748B" strokeWidth={1} strokeDasharray="3 3" />
                      <circle cx={px(hoverIndex)} cy={py(hovered.spendUsd)} r={5} fill="#1877F2" stroke="#fff" strokeWidth={2} />
                    </g>
                  ) : null}
                  {[0, Math.floor((daily.length - 1) / 2), daily.length - 1].map((index, labelIndex) => (
                    <text key={`${daily[index].date}-${labelIndex}`} x={px(index)} y={LINE_H - 9} textAnchor={labelIndex === 0 ? "start" : labelIndex === 2 ? "end" : "middle"} fontSize={10} fill="#64748B">{dayLabel(daily[index].date, numberLocale)}</text>
                  ))}
                </svg>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
