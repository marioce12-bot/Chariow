"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { formatMoney } from "@/lib/format";
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
type AccountRef = { id: string; currency?: string; is_selected?: boolean | null };

const CHANNELS: Array<Pick<ChannelStat, "id" | "badge" | "label" | "color">> = [
  { id: "meta", badge: "facebook", label: "Meta", color: "#1877F2" },
  { id: "tiktok", badge: "tiktok", label: "TikTok", color: "#111827" },
  { id: "pinterest", badge: "pinterest", label: "Pinterest", color: "#E60023" },
];

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

export function AdSpendByChannel({ plan, storeId, periodDays, refreshKey }: { plan: PlanId; storeId: string | null; periodDays: number; refreshKey: number }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const tr = (fr: string, english: string) => (en ? english : fr);
  const [stats, setStats] = useState<ChannelStat[]>(CHANNELS.map(emptyStat));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - periodDays + 1);
    const range = `from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;

    async function loadMeta(): Promise<ChannelStat> {
      const base = emptyStat(CHANNELS[0]);
      const accountsData = await getJson("/api/integrations/meta/accounts");
      const accounts: AccountRef[] = accountsData?.accounts ?? [];
      if (!accounts.length) return base;
      const chosen = accounts.find((account) => account.is_selected) ?? accounts[0];
      const perf = await getJson(`/api/meta/performance?account_id=${encodeURIComponent(chosen.id)}&store_id=${encodeURIComponent(storeId ?? "")}&${range}`);
      if (!perf) return { ...base, connected: true, failed: true };
      const performances: Array<{ clicks?: number }> = perf.performances ?? [];
      return {
        ...base,
        connected: true,
        spendUsd: toUsd(Number(perf.overview?.spend ?? 0), perf.currency) ?? 0,
        clicks: performances.reduce((total, item) => total + (item.clicks ?? 0), 0),
        conversions: Number(perf.overview?.conversions ?? 0),
      };
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
    ]).then((next) => {
      if (cancelled) return;
      setStats(next);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [plan, storeId, periodDays, refreshKey]);

  const connected = stats.filter((stat) => stat.connected);
  const totalUsd = stats.reduce((total, stat) => total + stat.spendUsd, 0);
  const maxUsd = Math.max(1, ...stats.map((stat) => stat.spendUsd));

  return (
    <section className="app-card">
      <div className="card-head">
        <div>
          <h2>{tr("Dépenses publicitaires", "Ad spend")}</h2>
          <p className="hint-line" style={{ margin: 0 }}>{tr(`Tous canaux, ${periodDays} derniers jours, convertis en USD.`, `All channels, last ${periodDays} days, converted to USD.`)}</p>
        </div>
        <BarChart3 size={18} />
      </div>

      {loading && !connected.length ? (
        <div style={{ marginTop: 12, display: "grid", gap: 12 }} role="status" aria-busy="true" aria-label={tr("Chargement des dépenses", "Loading spend")}>
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
        <p className="hint-line" style={{ marginTop: 12 }}>{tr("Aucun canal publicitaire connecté. Connecte Meta, TikTok ou Pinterest dans « Comptes publicitaires ».", "No ad channel connected. Connect Meta, TikTok or Pinterest in “Ad accounts”.")}</p>
      ) : (
        <>
          <div style={{ marginTop: 12 }}>
            <span className="hint-line">{tr("Total dépensé", "Total spent")}</span>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{formatMoney(totalUsd, "USD")}</div>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {stats.map((stat) => (
              <div key={stat.id} style={{ display: "grid", gap: 6, opacity: stat.connected ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <ChannelBadge id={stat.badge} />
                    <strong style={{ fontSize: 14 }}>{stat.label}</strong>
                  </span>
                  <strong style={{ fontSize: 14, whiteSpace: "nowrap" }}>{stat.connected ? formatMoney(stat.spendUsd, "USD") : tr("Non connecté", "Not connected")}</strong>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "#EEF2F7", overflow: "hidden" }} role="img" aria-label={`${stat.label}: ${formatMoney(stat.spendUsd, "USD")}`}>
                  <div style={{ width: `${stat.connected ? Math.max(stat.spendUsd > 0 ? 3 : 0, (stat.spendUsd / maxUsd) * 100) : 0}%`, height: "100%", background: stat.color, borderRadius: 999 }} />
                </div>
                <span className="hint-line">
                  {!stat.connected
                    ? tr("Connecte ce canal dans « Comptes publicitaires ».", "Connect this channel in “Ad accounts”.")
                    : stat.failed
                      ? tr("Données indisponibles pour le moment.", "Data unavailable right now.")
                      : `${stat.clicks.toLocaleString(en ? "en-US" : "fr-FR")} ${tr("clics", "clicks")} · ${stat.conversions.toLocaleString(en ? "en-US" : "fr-FR")} conversions`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
