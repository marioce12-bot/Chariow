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
 * - Barres par canal : la barre Meta est empilée par campagne (chaque segment = une campagne, cliquable) ;
 *   la légende en dessous remplace l'ancienne liste de campagnes et détaille clics / impressions / conversions.
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
type MetaAccountReading = { accountId: string; ok: boolean; spendUsd: number; clicks: number; conversions: number; campaigns: CampaignStat[]; stale: boolean };
type AdSpendData = { stats: ChannelStat[]; campaigns: CampaignStat[]; readings: MetaAccountReading[]; daily: DailyPoint[] };
type VendeoCampaign = { platform?: string; title?: string | null; product_name?: string | null; external_campaign_id?: string | null };
type AccountRef = { id: string; currency?: string; is_selected?: boolean | null };
type DailyResponse = { currency?: string; days?: Array<{ date: string; spend: number }> } | null;

const CHANNELS: Array<Pick<ChannelStat, "id" | "badge" | "label" | "color">> = [
  { id: "meta", badge: "facebook", label: "Meta", color: "#1877F2" },
  { id: "tiktok", badge: "tiktok", label: "TikTok", color: "#111827" },
  { id: "pinterest", badge: "pinterest", label: "Pinterest", color: "#E60023" },
];

// Nuances de bleu pour les segments de campagnes Meta (la couleur suit l'ordre de la légende).
const CAMPAIGN_COLORS = ["#1877F2", "#0A3D91", "#5AA2FF", "#1E5BC6", "#9CC5FF", "#274690"];
const REST_COLOR = "#CBD5E1";

// Géométrie des graphiques (viewBox : le SVG s'adapte à la largeur de l'écran).
const BAR_W = 320;
const BAR_H = 210;
const BAR_TOP = 24;
const BAR_BOTTOM = 40;
const BAR_BASE = BAR_H - BAR_BOTTOM;
const BAR_PLOT = BAR_BASE - BAR_TOP;
const BAR_WIDTH = 64;
const LINE_W = 320;
const LINE_H = 140;
const LINE_PAD = { top: 14, bottom: 24, left: 8, right: 8 };

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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

    async function readMetaAccount(accountId: string): Promise<MetaAccountReading> {
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
      const [readings, activeLists, dailyLists] = await Promise.all([
        Promise.all(accounts.map((account) => readMetaAccount(account.id))),
        Promise.all(accounts.map((account) => getJson(`/api/meta/active-campaigns?account_id=${encodeURIComponent(account.id)}`))),
        Promise.all(accounts.map((account) => getJson(`/api/meta/daily-spend?account_id=${encodeURIComponent(account.id)}&${range}`) as Promise<DailyResponse>)),
      ]);
      const merged = mergeMeta(readings, vendeoCampaigns);
      // Seules les campagnes en cours chez Meta sont listées (les anciennes, en pause ou archivées, sont masquées).
      // Si le statut est illisible pour un compte, on ne filtre pas pour ne rien cacher à tort.
      const statusKnown = activeLists.every((list) => Array.isArray(list?.activeIds));
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
      const staleIds = current.readings.filter((reading) => reading.ok && reading.stale).map((reading) => reading.accountId)
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
    const refreshStale = () => { if (document.visibilityState !== "hidden") void cache.loadComputed(cacheKey, () => loaderRef.current(), refreshKey); };
    const timer = window.setInterval(refreshStale, 60_000);
    window.addEventListener("focus", refreshStale);
    return () => { clearInterval(timer); window.removeEventListener("focus", refreshStale); };
  }, [cache, cacheKey, refreshKey]);

  const connected = stats.filter((stat) => stat.connected);
  const totalUsd = stats.reduce((total, stat) => total + stat.spendUsd, 0);
  const maxUsd = Math.max(1, ...stats.map((stat) => stat.spendUsd));
  const numberLocale = en ? "en-US" : "fr-FR";
  const metaStat = stats[0];

  // --- Barres par canal : la barre Meta est empilée par campagne. ---
  const campaignColor = (index: number) => CAMPAIGN_COLORS[index % CAMPAIGN_COLORS.length];
  const metaSegments = metaCampaigns.map((campaign, index) => ({ id: campaign.id, name: campaign.name, value: campaign.spendUsd, color: campaignColor(index) })).filter((segment) => segment.value > 0);
  const metaRest = Math.max(0, metaStat.spendUsd - metaSegments.reduce((total, segment) => total + segment.value, 0));
  const slot = BAR_W / stats.length;
  const bars = stats.map((stat, index) => {
    const cx = slot * index + slot / 2;
    const total = stat.connected ? stat.spendUsd : 0;
    const height = total > 0 ? Math.max(3, (total / maxUsd) * BAR_PLOT) : 0;
    const parts = stat.id === "meta"
      ? [
          ...metaSegments,
          ...(metaRest > 0.005 ? [{ id: "__rest", name: metaSegments.length ? tr("Autres campagnes", "Other campaigns") : stat.label, value: metaRest, color: metaSegments.length ? REST_COLOR : stat.color }] : []),
        ]
      : [{ id: stat.id, name: stat.label, value: total, color: stat.color }];
    let cursor = BAR_BASE;
    const rects = total > 0
      ? parts.filter((part) => part.value > 0).map((part) => {
          const partHeight = (part.value / Math.max(total, 0.000001)) * height;
          cursor -= partHeight;
          return { ...part, y: cursor, height: partHeight };
        })
      : [];
    return { stat, cx, x: cx - BAR_WIDTH / 2, top: BAR_BASE - height, rects };
  });

  // --- Courbe : dépense Meta par jour. ---
  const showLine = metaStat.connected && !metaStat.failed && daily.length > 1;
  const maxDaily = Math.max(0.01, ...daily.map((point) => point.spendUsd));
  const lineInnerW = LINE_W - LINE_PAD.left - LINE_PAD.right;
  const lineInnerH = LINE_H - LINE_PAD.top - LINE_PAD.bottom;
  const px = (index: number) => LINE_PAD.left + (daily.length <= 1 ? 0 : (index / (daily.length - 1)) * lineInnerW);
  const py = (value: number) => LINE_PAD.top + (1 - value / maxDaily) * lineInnerH;
  const linePath = daily.map((point, index) => `${index ? "L" : "M"}${px(index).toFixed(1)} ${py(point.spendUsd).toFixed(1)}`).join(" ");
  const areaPath = daily.length > 1 ? `${linePath} L${px(daily.length - 1).toFixed(1)} ${LINE_H - LINE_PAD.bottom} L${px(0).toFixed(1)} ${LINE_H - LINE_PAD.bottom} Z` : "";
  const hovered = hoverIndex !== null ? daily[hoverIndex] : undefined;
  function onLinePointer(event: ReactPointerEvent<SVGSVGElement>) {
    if (daily.length < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) / rect.width) * LINE_W;
    const index = Math.round(((x - LINE_PAD.left) / lineInnerW) * (daily.length - 1));
    setHoverIndex(Math.min(daily.length - 1, Math.max(0, index)));
  }

  return (
    // minWidth/maxWidth : sans eux, un nom de campagne très long élargit la carte au-delà de l'écran sur téléphone.
    <section className="app-card" style={{ minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
      <div className="card-head">
        <div>
          <h2>{tr(t("sweep3.text134"), "Ad spend")}</h2>
          <p className="hint-line" style={{ margin: 0 }}>{tr(t("dynamicExtra.spendPeriod", { days: (periodDays) }), `All channels, last ${periodDays} days, converted to USD.`)}{metaSyncing ? ` ${tr(t("sweep1.text135"), "Updating Meta…")}` : ""}</p>
        </div>
        <BarChart3 size={18} />
      </div>

      {loading && !connected.length ? (
        <div style={{ marginTop: 12, display: "grid", gap: 12 }} role="status" aria-busy="true" aria-label={tr(t("sweep2.text136"), "Loading spend")}>
          <div style={{ display: "grid", gap: 6 }}>
            <Skeleton width={110} height={11} />
            <Skeleton width={150} height={24} />
          </div>
          <Skeleton height={170} radius={12} />
          <Skeleton height={110} radius={12} />
        </div>
      ) : !connected.length ? (
        <p className="hint-line" style={{ marginTop: 12 }}>{tr(t("sweep3.text137"), "No ad channel connected. Connect Meta, TikTok or Pinterest in “Ad accounts”.")}</p>
      ) : (
        <>
          <div style={{ marginTop: 12 }}>
            <span className="hint-line">{tr(t("sweep1.text138"), "Total spent")}</span>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{usd(totalUsd, numberLocale)}</div>
          </div>

          {/* Barres par canal (Meta empilée par campagne) */}
          <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} width="100%" style={{ display: "block", marginTop: 14, maxWidth: "100%", height: "auto" }} role="img" aria-label={tr("Dépenses par canal publicitaire", "Spend by ad channel")}>
            <line x1={0} y1={BAR_BASE} x2={BAR_W} y2={BAR_BASE} stroke="#E2E8F0" strokeWidth={1} />
            {bars.map((bar) => (
              <g key={bar.stat.id} opacity={bar.stat.connected ? 1 : 0.6}>
                {bar.rects.map((rect) => {
                  const selectable = !rect.id.startsWith("__") && rect.id !== bar.stat.id;
                  const dimmed = selectedId !== null && selectable && rect.id !== selectedId;
                  return (
                    <rect
                      key={rect.id}
                      x={bar.x}
                      y={rect.y}
                      width={BAR_WIDTH}
                      height={rect.height}
                      fill={rect.color}
                      stroke="#fff"
                      strokeWidth={bar.rects.length > 1 ? 1 : 0}
                      opacity={dimmed ? 0.35 : 1}
                      rx={bar.rects.length === 1 ? 4 : 0}
                      style={{ cursor: selectable ? "pointer" : "default" }}
                      onClick={selectable ? () => setSelectedId((current) => (current === rect.id ? null : rect.id)) : undefined}
                    >
                      <title>{`${rect.name} : ${usd(rect.value, numberLocale)}`}</title>
                    </rect>
                  );
                })}
                {bar.stat.connected && !bar.stat.failed ? (
                  <text x={bar.cx} y={bar.top - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="currentColor">
                    {bar.stat.spendUsd.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </text>
                ) : null}
                <text x={bar.cx} y={BAR_BASE + 17} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">{bar.stat.label}</text>
                <text x={bar.cx} y={BAR_BASE + 31} textAnchor="middle" fontSize={9.5} fill="#94A3B8">
                  {!bar.stat.connected ? tr(t("sweep2.text139"), "Not connected") : bar.stat.failed ? tr(t("sweep1.text141"), "Data unavailable right now.") : `${bar.stat.clicks.toLocaleString(numberLocale)} ${tr(t("optionsExtra.text12"), "clicks")} · ${bar.stat.conversions.toLocaleString(numberLocale)} conv.`}
                </text>
              </g>
            ))}
          </svg>

          {/* Légende = campagnes Meta (touche pour voir le détail) */}
          {metaCampaigns.length > 0 ? (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2 }}>
              <strong style={{ fontSize: 13 }}>{tr(`Campagnes Meta (${metaCampaigns.length})`, `Meta campaigns (${metaCampaigns.length})`)}</strong>
              {metaCampaigns.map((campaign, index) => {
                const active = selectedId === campaign.id;
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => setSelectedId((current) => (current === campaign.id ? null : campaign.id))}
                    aria-pressed={active}
                    style={{ display: "grid", gap: 2, minWidth: 0, width: "100%", textAlign: "left", padding: "7px 8px", border: 0, borderRadius: 8, background: active ? "#EEF4FF" : "transparent", color: "inherit", font: "inherit", cursor: "pointer" }}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 0", minWidth: 0 }}>
                        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: campaignColor(index), flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={campaign.name}>{campaign.name}</span>
                      </span>
                      <strong style={{ fontSize: 13, flexShrink: 0, whiteSpace: "nowrap" }}>{usd(campaign.spendUsd, numberLocale)}</strong>
                    </span>
                    {active ? (
                      <span className="hint-line" style={{ paddingLeft: 18 }}>
                        {campaign.clicks.toLocaleString(numberLocale)} {tr(t("optionsExtra.text12"), "clicks")} · {campaign.impressions.toLocaleString(numberLocale)} {tr("impressions", "impressions")} · {campaign.conversions.toLocaleString(numberLocale)} conversions
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Courbe : dépense Meta par jour */}
          {showLine ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>{tr("Dépense Meta par jour", "Meta spend per day")}</strong>
                <span className="hint-line" style={{ margin: 0 }}>
                  {hovered ? `${dayLabel(hovered.date, numberLocale)} · ${usd(hovered.spendUsd, numberLocale)}` : tr("Touche la courbe pour voir un jour", "Touch the curve to see a day")}
                </span>
              </div>
              <svg
                viewBox={`0 0 ${LINE_W} ${LINE_H}`}
                width="100%"
                style={{ display: "block", marginTop: 6, maxWidth: "100%", height: "auto", touchAction: "pan-y" }}
                role="img"
                aria-label={tr("Courbe de la dépense Meta par jour", "Meta daily spend curve")}
                onPointerDown={onLinePointer}
                onPointerMove={onLinePointer}
                onPointerLeave={() => setHoverIndex(null)}
              >
                <defs>
                  <linearGradient id="adspend-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1877F2" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#1877F2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <line x1={LINE_PAD.left} y1={LINE_H - LINE_PAD.bottom} x2={LINE_W - LINE_PAD.right} y2={LINE_H - LINE_PAD.bottom} stroke="#E2E8F0" strokeWidth={1} />
                <line x1={LINE_PAD.left} y1={LINE_PAD.top} x2={LINE_W - LINE_PAD.right} y2={LINE_PAD.top} stroke="#F1F5F9" strokeWidth={1} strokeDasharray="3 3" />
                <text x={LINE_PAD.left} y={LINE_PAD.top - 3} fontSize={9.5} fill="#94A3B8">{maxDaily.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</text>
                <path d={areaPath} fill="url(#adspend-area)" />
                <path d={linePath} fill="none" stroke="#1877F2" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {hovered && hoverIndex !== null ? (
                  <g>
                    <line x1={px(hoverIndex)} y1={LINE_PAD.top} x2={px(hoverIndex)} y2={LINE_H - LINE_PAD.bottom} stroke="#94A3B8" strokeWidth={1} strokeDasharray="3 3" />
                    <circle cx={px(hoverIndex)} cy={py(hovered.spendUsd)} r={4} fill="#1877F2" stroke="#fff" strokeWidth={2} />
                  </g>
                ) : null}
                <text x={LINE_PAD.left} y={LINE_H - 7} fontSize={9.5} fill="#94A3B8">{dayLabel(daily[0].date, numberLocale)}</text>
                <text x={LINE_W - LINE_PAD.right} y={LINE_H - 7} fontSize={9.5} fill="#94A3B8" textAnchor="end">{dayLabel(daily[daily.length - 1].date, numberLocale)}</text>
              </svg>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
