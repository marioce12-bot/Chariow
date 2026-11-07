"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Loader2,
  RefreshCw,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { adminReadError, fetchAdminJson } from "@/lib/admin-fetch";
import { Empty } from "./AdminSections";

type ReferralAccount = {
  userId: string;
  email: string | null;
  fullName: string | null;
};

type ReferrerSummary = ReferralAccount & {
  referralCount: number;
  referredAccounts: ReferralAccount[];
};

type AdminReferralsPayload = {
  totalReferred: number;
  referrerCount: number;
  referrers: ReferrerSummary[];
};

function accountIdentity(account: ReferralAccount, en: boolean) {
  const name = account.fullName?.trim();
  const email = account.email?.trim();
  return {
    title: name || email || (en ? "Profile unavailable" : "Profil introuvable"),
    detail:
      name && email
        ? email
        : `${en ? "Account ID" : "ID du compte"} : ${account.userId}`,
  };
}

export function AdminReferralsSection({
  refreshRevision,
}: {
  refreshRevision: number;
}) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [data, setData] = useState<AdminReferralsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);
  const formatCount = (count: number) =>
    count.toLocaleString(en ? "en-US" : "fr-FR");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    void fetchAdminJson<AdminReferralsPayload>("/api/admin/referrals", {
      signal: controller.signal,
    })
      .then((payload) => {
        if (
          !Number.isInteger(payload.totalReferred) ||
          !Number.isInteger(payload.referrerCount) ||
          !Array.isArray(payload.referrers)
        )
          throw new Error("admin_read_invalid");
        if (active) setData(payload);
      })
      .catch((cause: unknown) => {
        if (!active || (cause instanceof Error && cause.name === "AbortError"))
          return;
        setError(adminReadError(cause, locale));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [locale, refreshRevision, retryRevision]);

  return (
    <>
      {data && (
        <div className="admin-kpi-grid admin-referral-kpis">
          <div className="admin-kpi">
            <span className="owner-kpi-top">
              {en ? "Referred accounts" : "Comptes parrainés"}
              <span className="owner-kpi-icon blue">
                <Users size={17} aria-hidden="true" />
              </span>
            </span>
            <strong>{formatCount(data.totalReferred)}</strong>
            <small>
              {en
                ? "Accounts with a recorded referral relationship"
                : "Comptes ayant une relation de parrainage enregistrée"}
            </small>
          </div>
          <div className="admin-kpi">
            <span className="owner-kpi-top">
              {en ? "Referrers" : "Parrains"}
              <span className="owner-kpi-icon green">
                <UserPlus size={17} aria-hidden="true" />
              </span>
            </span>
            <strong>{formatCount(data.referrerCount)}</strong>
            <small>
              {en
                ? "Accounts with at least one referred account"
                : "Comptes ayant parrainé au moins une personne"}
            </small>
          </div>
        </div>
      )}

      <section className="admin-card admin-referrals">
        <div className="admin-card-head">
          <div>
            <h3>{en ? "Referrers and referred accounts" : "Parrains et comptes parrainés"}</h3>
            <p>
              {en
                ? "Each group is based on a referral recorded in the platform database."
                : "Chaque groupe reprend les parrainages enregistrés dans la base de la plateforme."}
            </p>
          </div>
          <Users size={17} aria-hidden="true" />
        </div>

        {loading && !data && (
          <p className="admin-help" role="status">
            <Loader2 className="owner-spinning" size={16} aria-hidden="true" />{" "}
            {en ? "Loading referral data…" : "Chargement des parrainages…"}
          </p>
        )}
        {error && (
          <div className="owner-notice owner-notice-error" role="alert">
            <TriangleAlert size={18} aria-hidden="true" />
            <span>{error}</span>
            <button
              type="button"
              className="admin-btn admin-btn-soft"
              onClick={() => setRetryRevision((value) => value + 1)}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {en ? "Retry" : "Réessayer"}
            </button>
          </div>
        )}
        {loading && data && (
          <p className="admin-help" role="status">
            {en ? "Refreshing referral data…" : "Actualisation des parrainages…"}
          </p>
        )}
        {!loading && !error && data?.referrers.length === 0 && (
          <Empty
            text={
              en
                ? "No referred accounts have been recorded yet."
                : "Aucun compte parrainé n’est enregistré pour le moment."
            }
          />
        )}
        {data && data.referrers.length > 0 && (
          <div className="admin-referral-list">
            {data.referrers.map((referrer) => {
              const identity = accountIdentity(referrer, en);
              return (
                <details className="admin-referral-group" key={referrer.userId}>
                  <summary>
                    <span className="admin-referral-identity">
                      <strong>{identity.title}</strong>
                      <small>{identity.detail}</small>
                    </span>
                    <span className="admin-referral-summary-count">
                      {formatCount(referrer.referralCount)}{" "}
                      {en
                        ? referrer.referralCount === 1
                          ? "referred account"
                          : "referred accounts"
                        : referrer.referralCount === 1
                          ? "compte parrainé"
                          : "comptes parrainés"}
                    </span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </summary>
                  <ul>
                    {referrer.referredAccounts.map((account) => {
                      const referredIdentity = accountIdentity(account, en);
                      return (
                        <li key={account.userId}>
                          <span className="admin-referral-identity">
                            <strong>{referredIdentity.title}</strong>
                            <small>{referredIdentity.detail}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
