"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { costPerSale, health, overviewState, profitabilityPct, type HealthLevel, type OverviewState } from "@/lib/unit-economics";
import { convertCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { initialBackfillDate } from "@/lib/meta/backfill";
import { useI18n } from "@/lib/i18n/i18n";

type MetaAccount = {
  id: string;
  currency: string;
  last_backfill_at: string | null;
  backfill_status: "processing" | "in_progress" | "failed" | "complete" | null;
  backfill_next_from?: string | null;
};
type Performance = {
  id: string;
  name: string;
  spend: number;
  realSales: number | null;
  realRevenue: number | null;
  attributionReliable: boolean;
  paybackDays: number | null;
};
type PerformanceSnapshot = {
  adCurrency: string;
  overview: {
    spend: number;
    attributedSpend: number | null;
    attributedNetRevenue: number | null;
    attributedCustomers: number;
    attributionCoverage: number;
    state: OverviewState;
    vendeoCampaigns: number;
    verifiedSales: number;
  };
  performances: Performance[];
};
type HistoryEntity = {
  level: "campaign" | "adset" | "ad";
  id: string;
  name: string;
  impressions: number;
  clicks: number;
  purchases: number;
  spend: number | null;
  purchaseValue: number | null;
};
type History = {
  entities: HistoryEntity[];
  daily?: Array<{ date: string; spend: number | null; purchases: number; purchaseValue: number | null }>;
  currency: string;
  backfillStatus: string;
  lastBackfillAt: string | null;
};
type Props = {
  account: MetaAccount | null;
  storeId: string | null;
  confirmedSales: number;
  maxCostPerCustomer: number | null;
  storeCurrency: string;
  onLaunch: () => void;
  onRefresh: () => void;
  onDaily?: (daily: Array<{ date: string; spend: number | null }>) => void;
};

const levels = ["campaign", "adset", "ad"] as const;

function stateKey(state: OverviewState) {
  return ({ A: "stateA", B: "stateB", C: "stateC", D: "stateD" } as const)[state];
}
function healthKey(value: HealthLevel | null): HealthLevel | null {
  return value;
}

export function MetaHistoryOverview({ account, storeId, confirmedSales, maxCostPerCustomer, storeCurrency, onLaunch, onRefresh, onDaily }: Props) {
  const { t } = useI18n();
  const accountId = account?.id;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const onDailyRef = useRef(onDaily);
  onDailyRef.current = onDaily;
  const [history, setHistory] = useState<History | null>(null);
  const [summary, setSummary] = useState<PerformanceSnapshot | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string>(account?.last_backfill_at ? "complete" : account?.backfill_status ?? "pending");
  const [retryToken, setRetryToken] = useState(0);
  const [historyError, setHistoryError] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const from = useMemo(() => initialBackfillDate(today), [today]);

  const loadHistory = useCallback(async () => {
    if (!accountId) { setHistory(null); onDailyRef.current?.([]); return; }
    try {
      const response = await fetch(`/api/meta/history?account_id=${encodeURIComponent(accountId)}&from=${from}&currency=${encodeURIComponent(storeCurrency)}`);
      if (!response.ok) { setHistoryError(true); onDailyRef.current?.([]); return; }
      const result = await response.json() as History;
      setHistory(result);
      onDailyRef.current?.((result.daily ?? []).map(({ date, spend }) => ({ date, spend })));
      setHistoryError(false);
    } catch {
      setHistoryError(true);
      onDailyRef.current?.([]);
    }
  }, [accountId, from, storeCurrency]);

  const loadSummary = useCallback(async () => {
    if (!accountId) { setSummary(null); return; }
    try {
      const response = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(accountId)}&store_id=${encodeURIComponent(storeId ?? "")}&from=${from}&to=${today}`);
      if (response.ok) setSummary(await response.json());
      else setSummary(null);
    } catch {
      setSummary(null);
    }
  }, [accountId, from, today, storeId]);

  useEffect(() => {
    setBackfillStatus(account?.last_backfill_at ? "complete" : account?.backfill_status ?? "pending");
  }, [account?.id, account?.last_backfill_at, account?.backfill_status]);

  useEffect(() => { void loadHistory(); void loadSummary(); }, [loadHistory, loadSummary]);

  useEffect(() => {
    if (!accountId || account?.last_backfill_at || account?.backfill_status === "failed" || backfillStatus === "complete" || backfillStatus === "failed") return;
    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        try {
          const response = await fetch("/api/meta/backfill", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: accountId }),
          });
          const result = await response.json();
          if (!response.ok || result.status === "failed") { setBackfillStatus("failed"); return; }
          setBackfillStatus(result.status);
          if (result.status === "complete") {
            await Promise.all([loadHistory(), loadSummary()]);
            onRefreshRef.current();
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, result.from ? 150 : 2500));
        } catch {
          setBackfillStatus("failed");
          return;
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [accountId, account?.last_backfill_at, account?.backfill_status, retryToken, loadHistory, loadSummary]);

  const spendAccount = summary?.overview.spend ?? null;
  const accountCurrency = summary?.adCurrency ?? account?.currency ?? "";
  const declaredSpend = spendAccount === null || !accountCurrency
    ? null
    : accountCurrency === storeCurrency ? spendAccount : convertCurrency(spendAccount, accountCurrency, storeCurrency);
  const attributedSpend = summary?.overview.attributedSpend ?? null;
  const attributedSpendStore = attributedSpend === null || !accountCurrency
    ? null
    : accountCurrency === storeCurrency ? attributedSpend : convertCurrency(attributedSpend, accountCurrency, storeCurrency);
  const verifiedSales = summary?.overview.attributionCoverage ?? 0;
  const verifiedCustomers = summary?.overview.attributedCustomers ?? 0;
  const noLinkedSales = summary !== null && verifiedSales === 0;
  const missingSalesLabel = t(noLinkedSales ? "overview.noLinkedSales" : "overview.metricUnavailable");
  const saleCost = costPerSale(attributedSpendStore, verifiedSales);
  const costPerCustomer = attributedSpendStore !== null && verifiedCustomers > 0 ? attributedSpendStore / verifiedCustomers : null;
  const healthLevel = health(costPerCustomer, maxCostPerCustomer);
  const netRevenue = summary?.overview.attributedNetRevenue ?? null;
  const profitability = profitabilityPct(netRevenue, attributedSpend);
  const reliableCampaigns = (summary?.performances ?? []).filter((campaign) => campaign.attributionReliable);
  const recovered = reliableCampaigns.filter((campaign) => campaign.paybackDays !== null);
  const recoveryDays = reliableCampaigns.length === 1 && recovered.length === 1 ? recovered[0].paybackDays : null;
  const state = summary?.overview.state ?? overviewState({ confirmedSales, vendeoCampaigns: 0, linkedSales: 0 });
  const healthWidth = costPerCustomer !== null && maxCostPerCustomer && maxCostPerCustomer > 0
    ? Math.min(100, Math.max(0, (costPerCustomer / maxCostPerCustomer) * 100))
    : 0;
  const importLabel = backfillStatus === "complete" || account?.last_backfill_at
    ? t("overview.upToDate")
    : backfillStatus === "failed" ? t("overview.importFailed") : t("overview.importing");

  return (
    <section className="my-ads-overview app-card" aria-label={t("overview.myAds")}>
      <header className="my-ads-header">
        <div><h2>{t("overview.myAds")}</h2><span className={`my-ads-state state-${state.toLowerCase()}`}>{t(`overview.${stateKey(state)}`)}</span></div>
        {account ? <span className={`my-ads-import ${backfillStatus === "complete" || account.last_backfill_at ? "is-complete" : ""}`}>{importLabel}</span> : null}
      </header>
      <div className="my-ads-metrics">
        <div className="my-ads-metric"><span>{t("overview.spend")}</span><strong>{declaredSpend === null ? t("overview.metricUnavailable") : formatMoney(declaredSpend, storeCurrency)}</strong><small className="source-meta">{t("overview.metaDeclared")}</small></div>
        <div className="my-ads-metric"><span>{t("overview.costPerSale")}</span><strong>{saleCost === null ? missingSalesLabel : formatMoney(saleCost, storeCurrency)}</strong>{verifiedSales > 0 ? <small className="source-verified">{t("overview.verified")} · {verifiedSales}</small> : null}</div>
        <div className="my-ads-metric"><span>{t("overview.profitability")}</span><strong>{profitability === null ? t(noLinkedSales ? "overview.metricNotCalculated" : "overview.metricUnavailable") : `${profitability.toFixed(1)} %`}</strong>{profitability !== null ? <small className="source-verified">{t("overview.verified")}</small> : null}</div>
        <div className="my-ads-metric"><span>{t("overview.health")}</span><strong>{healthLevel ? t(`overview.${healthKey(healthLevel)}`) : summary ? t("overview.healthNotMeasured") : t("overview.metricUnavailable")}</strong>{healthLevel ? <div className="my-ads-health-track"><i style={{ width: `${healthWidth}%` }} data-health={healthLevel} /></div> : null}</div>
        <div className="my-ads-metric"><span>{t("overview.recovery")}</span><strong>{recoveryDays === null ? t(noLinkedSales ? "overview.metricNotCalculated" : "overview.metricUnavailable") : `${Math.ceil(recoveryDays)} ${t("overview.daysUnit")}`}</strong>{recoveryDays !== null ? <small className="source-verified">{t("overview.verified")}</small> : null}</div>
      </div>
      {state === "A" || state === "D" ? <button className="btn btn-primary my-ads-launch" onClick={onLaunch}>{t("ads.launch")}</button> : null}
      {account && backfillStatus === "failed" ? <button className="btn btn-ghost" onClick={() => { setBackfillStatus("pending"); setRetryToken((value) => value + 1); }}>{t("overview.retryImport")}</button> : null}
      {historyError ? <div className="my-ads-error">{t("overview.historyUnavailable")}</div> : null}
      {account && !historyError && history && history.entities.length === 0 ? <div className="my-ads-empty">{t("overview.noMetaHistory")}</div> : null}
      {history && history.entities.length > 0 ? <div className="meta-history-levels">
        {levels.map((level) => {
          const rows = history.entities.filter((entity) => entity.level === level).slice(0, 4);
          if (!rows.length) return null;
          const title = level === "campaign" ? t("overview.campaigns") : level === "adset" ? t("overview.adSets") : t("overview.ads");
          return <div className="meta-history-level" key={level}>
            <div className="meta-history-title"><strong>{title}</strong><span className="source-meta">{t("overview.metaDeclared")}</span></div>
            {rows.map((row) => <div className="meta-history-row" key={`${level}:${row.id}`}>
              <span className="meta-history-name" title={row.name}>{row.name}</span>
              <span>{row.spend === null ? t("overview.metricUnavailable") : formatMoney(row.spend, history.currency)}</span>
              <small>{row.impressions.toLocaleString()} {t("overview.impressions")} · {row.clicks.toLocaleString()} {t("overview.clicks")} · {row.purchases} {t("overview.purchases")}</small>
              <small>{t("overview.purchaseValue")}: {row.purchaseValue === null ? t("overview.metricUnavailable") : formatMoney(row.purchaseValue, history.currency)}</small>
            </div>)}
          </div>;
        })}
      </div> : null}
    </section>
  );
}
