"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { toUsd } from "@/lib/currency";
import { isAdPlatformAllowed, type AdPlatform, type PlanId } from "@/lib/plans";
import { useI18n } from "@/lib/i18n/i18n";
import { ChannelBadge } from "./shared";
import { Skeleton } from "./Skeleton";

/**
 * Dépenses publicitaires par canal (Meta, TikTok, Pinterest) sur la période choisie.
 * Chaque canal est converti en USD pour pouvoir être comparé. Les API TikTok et
 * Pinterest ne renvoient que des totaux (pas de courbe jour par jour) : on compare
 * donc les canaux entre eux avec un graphique en barres.
 *
 * Meta : on additionne TOUS les comptes publicitaires connectés (un utilisateur peut en avoir
 * plusieurs, tous marqués « sélectionnés ») et on affiche le détail par campagne (clics,
 * impressions, dépense), y compris les campagnes lancées directement depuis Meta Ads Manager
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
type MetaAccountReading = { accountId: string; ok: boolean; spendUsd: number; clicks: number; conversions: number; campaigns: CampaignStat[]; stale: boolean };
type VendeoCampaign = { platform?: string; title?: string | null; product_name?: string | null; external_campaign_id?: string | null };
type AccountRef = { id: string; currency?: string; is_selected?: boolean | null };

const CHANNELS: Array<Pick<ChannelStat, "id" | "badge" | "label" | "color">> = [
  { id: "meta", badge: "facebook", label: "Meta", color: "#1877F2" },
  { id: "tiktok", badge: "tiktok", label: "TikTok", color: "#111827" },
  { id: "pinterest", badge: "pinterest", label: "Pinterest", color: "#E60023" },
];

const STALE_MS = 15 * 60 * 1000;
const AUTO_SYNC_COOLDOWN_MS = 2 * 60 * 1000;
// Évite de relancer la synchro en boucle (changement de période, rafraîchissements).
const lastAutoSync = new Map<string, number>();

/** Montant en USD avec 2 décimales : les petites dépenses (ex. 2,63 USD) ne sont plus arrondies à 3. */
function usd(value: number, locale: string) {
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
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
  const [stats, setStats] = useState<ChannelStat[]>(CHANNELS.map(emptyStat));
  const [metaCampaigns, setMetaCampaigns] = useState<CampaignStat[]>([]);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

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
      if (!accounts.length) return { stat: emptyStat(CHANNELS[0]), campaigns: [] as CampaignStat[], readings: [] as MetaAccountReading[], vendeoCampaigns };
      const [readings, activeLists] = await Promise.all([
        Promise.all(accounts.map((account) => readMetaAccount(account.id))),
        Promise.all(accounts.map((account) => getJson(`/api/meta/active-campaigns?account_id=${encodeURIComponent(account.id)}`))),
      ]);
      const merged = mergeMeta(readings, vendeoCampaigns);
      // Seules les campagnes en cours chez Meta sont listées (les anciennes, en pause ou archivées, sont masquées).
      // Si le statut est illisible pour un compte, on ne filtre pas pour ne rien cacher à tort.
      const statusKnown = activeLists.every((list) => Array.isArray(list?.activeIds));
      const activeIds = new Set<string>(activeLists.flatMap((list) => (Array.isArray(list?.activeIds) ? list.activeIds : [])));
      return { ...merged, campaigns: statusKnown ? merged.campaigns.filter((campaign) => activeIds.has(campaign.id)) : merged.campaigns, readings, vendeoCampaigns };
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

    setLoading(true);
    void Promise.all([
      loadMeta(),
      isAdPlatformAllowed(plan, "tiktok") ? loadSimple(1, "/api/integrations/tiktok/accounts", "/api/tiktok/performance") : Promise.resolve(emptyStat(CHANNELS[1])),
      loadSimple(2, "/api/integrations/pinterest/accounts", "/api/pinterest/performance"),
    ]).then(async ([meta, tiktok, pinterest]) => {
      if (cancelled) return;
      setStats([meta.stat, tiktok, pinterest]);
      setMetaCampaigns(meta.campaigns);
      setLoading(false);

      // Comptes Meta dont les données sont anciennes (ou jamais synchronisées) : on resynchronise en
      // arrière-plan, puis on relit les chiffres. Les données déjà affichées restent en place.
      const staleIds = meta.readings.filter((reading) => reading.ok && reading.stale).map((reading) => reading.accountId)
        .filter((accountId) => Date.now() - (lastAutoSync.get(accountId) ?? 0) >= AUTO_SYNC_COOLDOWN_MS);
      if (!staleIds.length) return;
      for (const accountId of staleIds) lastAutoSync.set(accountId, Date.now());
      setMetaSyncing(true);
      const outcomes = await Promise.all(staleIds.map((accountId) => syncMeta(accountId)));
      if (outcomes.some(Boolean) && !cancelled) {
        const fresh = await loadMeta();
        if (!cancelled) {
          setStats((current) => [fresh.stat, current[1], current[2]]);
          setMetaCampaigns(fresh.campaigns);
        }
      }
      if (!cancelled) setMetaSyncing(false);
    }).catch(() => { if (!cancelled) { setLoading(false); setMetaSyncing(false); } });
    return () => { cancelled = true; };
  }, [plan, storeId, periodDays, refreshKey]);

  const connected = stats.filter((stat) => stat.connected);
  const totalUsd = stats.reduce((total, stat) => total + stat.spendUsd, 0);
  const maxUsd = Math.max(1, ...stats.map((stat) => stat.spendUsd));
  const numberLocale = en ? "en-US" : "fr-FR";

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
          {[0, 1, 2].map((index) => (
            <div key={index} style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Skeleton width={110} height={16} />
                <Skeleton width={60} height={16} />
              </div>
              <Skeleton height={8} radius={999} />
            </div>
          ))}
        </div>
      ) : !connected.length ? (
        <p className="hint-line" style={{ marginTop: 12 }}>{tr(t("sweep3.text137"), "No ad channel connected. Connect Meta, TikTok or Pinterest in “Ad accounts”.")}</p>
      ) : (
        <>
          <div style={{ marginTop: 12 }}>
            <span className="hint-line">{tr(t("sweep1.text138"), "Total spent")}</span>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{usd(totalUsd, numberLocale)}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, marginTop: 14 }}>
            {stats.map((stat) => (
              <div key={stat.id} style={{ display: "grid", gap: 6, minWidth: 0, opacity: stat.connected ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <ChannelBadge id={stat.badge} />
                    <strong style={{ fontSize: 14 }}>{stat.label}</strong>
                  </span>
                  <strong style={{ fontSize: 14, whiteSpace: "nowrap" }}>{stat.connected ? usd(stat.spendUsd, numberLocale) : tr(t("sweep2.text139"), "Not connected")}</strong>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "#EEF2F7", overflow: "hidden" }} role="img" aria-label={`${stat.label}: ${usd(stat.spendUsd, numberLocale)}`}>
                  <div style={{ width: `${stat.connected ? Math.max(stat.spendUsd > 0 ? 3 : 0, (stat.spendUsd / maxUsd) * 100) : 0}%`, height: "100%", background: stat.color, borderRadius: 999 }} />
                </div>
                <span className="hint-line">
                  {!stat.connected
                    ? tr(t("sweep3.text140"), "Connect this channel in “Ad accounts”.")
                    : stat.failed
                      ? tr(t("sweep1.text141"), "Data unavailable right now.")
                      : `${stat.clicks.toLocaleString(numberLocale)} ${tr(t("optionsExtra.text12"), "clicks")} · ${stat.conversions.toLocaleString(numberLocale)} conversions`}
                </span>
              </div>
            ))}
          </div>

          {metaCampaigns.length > 0 ? (
            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{tr(`Campagnes Meta (${metaCampaigns.length})`, `Meta campaigns (${metaCampaigns.length})`)}</strong>
              {metaCampaigns.map((campaign) => (
                <div key={campaign.id} style={{ display: "grid", gap: 2, minWidth: 0, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, flex: "1 1 0", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={campaign.name}>{campaign.name}</span>
                    <strong style={{ fontSize: 13, flexShrink: 0, whiteSpace: "nowrap" }}>{usd(campaign.spendUsd, numberLocale)}</strong>
                  </div>
                  <span className="hint-line">
                    {campaign.clicks.toLocaleString(numberLocale)} {tr(t("optionsExtra.text12"), "clicks")} · {campaign.impressions.toLocaleString(numberLocale)} {tr("impressions", "impressions")} · {campaign.conversions.toLocaleString(numberLocale)} conversions
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
