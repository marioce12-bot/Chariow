"use client";

import { useEffect, useState } from "react";

type Stats = {
  currency: string;
  totals: { spend: number; impressions: number; clicks: number; conversions: number };
  campaigns: Array<{ campaignId: string; name: string; spend: number; impressions: number; clicks: number; conversions: number; ctr: number; cpc: number }>;
};

const nf = (n: number, digits = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: digits });

export default function TikTokStats() {
  const [days, setDays] = useState<7 | 30>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tiktok/stats?days=${days}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data?.error || "Impossible de charger les stats TikTok");
        setStats(data);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Impossible de charger les stats TikTok"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const money = (n: number) => `${nf(n, 2)} ${stats?.currency ?? ""}`.trim();
  const card: React.CSSProperties = { flex: "1 1 45%", minWidth: 130 };
  const label: React.CSSProperties = { fontSize: 12, opacity: 0.7, display: "block" };
  const value: React.CSSProperties = { fontSize: 20, fontWeight: 700, display: "block", marginTop: 4 };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([7, 30] as const).map((d) => (
          <button key={d} type="button" className={days === d ? "btn btn-dark" : "btn"} onClick={() => setDays(d)}>{d} jours</button>
        ))}
      </div>

      {loading && <div className="app-card">Chargement des stats TikTok…</div>}
      {!loading && error && <div className="app-card" role="alert">{error}</div>}

      {!loading && !error && stats && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div className="app-card" style={card}><span style={label}>Dépenses</span><span style={value}>{money(stats.totals.spend)}</span></div>
            <div className="app-card" style={card}><span style={label}>Impressions</span><span style={value}>{nf(stats.totals.impressions)}</span></div>
            <div className="app-card" style={card}><span style={label}>Clics</span><span style={value}>{nf(stats.totals.clicks)}</span></div>
            <div className="app-card" style={card}><span style={label}>Conversions</span><span style={value}>{nf(stats.totals.conversions)}</span></div>
          </div>

          {stats.campaigns.length === 0 ? (
            <div className="app-card">Aucune donnée sur cette période. Les stats apparaissent une fois la diffusion commencée (après validation de la pub par TikTok).</div>
          ) : (
            stats.campaigns.map((c) => (
              <div key={c.campaignId} className="app-card" style={{ marginBottom: 10 }}>
                <strong style={{ display: "block", marginBottom: 6 }}>{c.name}</strong>
                <span style={{ fontSize: 13, opacity: 0.8 }}>
                  {money(c.spend)} · {nf(c.impressions)} impr. · {nf(c.clicks)} clics ({nf(c.ctr, 2)} %) · CPC {money(c.cpc)} · {nf(c.conversions)} conv.
                </span>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
