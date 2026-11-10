"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone, RefreshCw, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";

type CampaignAccount = {
  id: string;
  email: string | null;
  full_name: string | null;
  active_campaigns_count: number;
};

export function AdminCampaignAccounts() {
  const { locale } = useI18n();
  const en = locale === "en";
  const [accounts, setAccounts] = useState<CampaignAccount[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void fetch("/api/admin/campaigns/active-accounts", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.accounts)) throw new Error("load");
        return payload.accounts as CampaignAccount[];
      })
      .then(setAccounts)
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) => `${account.full_name ?? ""} ${account.email ?? ""} ${account.id}`.toLowerCase().includes(needle));
  }, [accounts, query]);

  return (
    <section className="admin-card admin-campaign-accounts">
      <div className="admin-card-head">
        <div>
          <h3><Megaphone size={17} /> {en ? "Accounts with active campaigns" : "Comptes avec campagnes actives"} ({loading ? "…" : accounts.length})</h3>
          <p className="admin-help">{en ? "Only campaigns whose stored status is exactly active are included. Completed campaigns and drafts are excluded." : "Seules les campagnes dont le statut enregistré est exactement « active » sont comptées. Les campagnes terminées et les brouillons sont exclues."}</p>
        </div>
        <button type="button" className="admin-btn admin-btn-soft" onClick={() => setRevision((value) => value + 1)} disabled={loading} aria-label={en ? "Refresh active campaign accounts" : "Actualiser les comptes avec campagnes actives"}><RefreshCw size={15} /></button>
      </div>
      <label className="admin-campaign-account-search">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={en ? "Search name, email or ID" : "Rechercher nom, e-mail ou ID"} aria-label={en ? "Search active campaign accounts" : "Rechercher les comptes avec campagnes actives"} />
      </label>
      {loading && <p className="admin-history-loading" role="status"><Loader2 className="admin-history-spin" size={16} /> {en ? "Loading accounts…" : "Chargement des comptes…"}</p>}
      {error && <div className="admin-history-error" role="alert">{en ? "Active campaign accounts could not be loaded." : "Impossible de charger les comptes avec campagnes actives."} <button type="button" onClick={() => setRevision((value) => value + 1)}>{en ? "Retry" : "Réessayer"}</button></div>}
      {!loading && !error && filtered.length === 0 && <p className="admin-help">{en ? "No accounts with active campaigns found." : "Aucun compte avec des campagnes actives trouvé."}</p>}
      {filtered.length > 0 && (
        <div className="admin-campaign-account-list">
          {filtered.map((account) => (
            <div className="admin-campaign-account-row" key={account.id}>
              <div className="admin-campaign-account-identity">
                <strong>{account.full_name || account.email || account.id}</strong>
                {account.full_name && account.email && <small>{account.email}</small>}
              </div>
              <strong className="admin-campaign-count">{account.active_campaigns_count} <span>{en ? (account.active_campaigns_count === 1 ? "active campaign" : "active campaigns") : (account.active_campaigns_count === 1 ? "campagne active" : "campagnes actives")}</span></strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
