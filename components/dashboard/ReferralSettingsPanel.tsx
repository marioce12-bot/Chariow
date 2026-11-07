"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift, LoaderCircle, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { REFERRALS_PER_FREE_MONTH, referralProgress } from "@/lib/referrals/rules";

type ReferredPerson = { id: string; displayName: string | null; createdAt: string; number: number };
type ReferralReward = {
  id: string;
  milestoneCount: number;
  createdAt: string;
  activatedAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
};
type ReferralSummary = {
  referralLink: string;
  totalReferrals: number;
  referralCredits: number;
  completedMilestones: number;
  nextOffset: number;
  hasMore: boolean;
  rewards: ReferralReward[];
};

export function ReferralSettingsPanel() {
  const { locale, t } = useI18n();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [people, setPeople] = useState<ReferredPerson[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/referrals?offset=${offset}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t("referral.loadError"));
      setSummary({
        referralLink: payload.referralLink,
        totalReferrals: payload.totalReferrals,
        referralCredits: payload.referralCredits,
        completedMilestones: payload.completedMilestones,
        nextOffset: payload.nextOffset,
        hasMore: payload.hasMore,
        rewards: payload.rewards ?? [],
      });
      setPeople((current) => append ? [...current, ...(payload.referrals ?? [])] : payload.referrals ?? []);
      setNextOffset(payload.nextOffset ?? 0);
      setHasMore(payload.hasMore === true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("referral.loadError"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  useEffect(() => { void loadPage(0, false); }, [loadPage]);

  async function copyReferralLink() {
    if (!summary?.referralLink) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary.referralLink);
      } else {
        const input = document.getElementById("vendeo-referral-link") as HTMLInputElement | null;
        input?.select();
        if (!document.execCommand("copy")) throw new Error("clipboard_unavailable");
      }
      setCopied(true);
      setNotice(t("referral.copied"));
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(t("referral.copyError"));
    }
  }

  async function activateReward() {
    const reward = summary?.rewards.find((item) => !item.activatedAt);
    if (!reward || actionBusy) return;
    setActionBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/referrals/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId: reward.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t("referral.activationError"));
      setNotice(payload.duplicate ? t("referral.alreadyActivated") : t("referral.activated"));
      await loadPage(0, false);
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : t("referral.activationError"));
    } finally {
      setActionBusy(false);
    }
  }

  const progress = referralProgress(summary?.totalReferrals ?? 0);
  const availableRewards = summary?.rewards.filter((reward) => !reward.activatedAt) ?? [];
  const activatedRewards = summary?.rewards.filter((reward) => Boolean(reward.activatedAt)) ?? [];
  const dateLocale = locale === "en" ? "en" : "fr";
  const formatDate = (value: string) => new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(value));

  return (
    <section className="settings-section settings-section-referral" data-settings-panel="referral" aria-label={t("referral.title")}>
      <div className="page-top settings-section-head">
        <div>
          <span className="eyebrow">{t("referral.eyebrow")}</span>
          <h2>{t("referral.title")}</h2>
          <p>{t("referral.subtitle")}</p>
        </div>
      </div>

      {loading ? <p className="referral-state" role="status">{t("referral.loading")}</p> : null}
      {error ? <div className="settings-inline-message referral-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadPage(0, false)}>{t("referral.retry")}</button></div> : null}
      {notice ? <p className="settings-inline-message referral-notice" role="status">{notice}</p> : null}

      {summary ? <>
        <div className="referral-stats-grid">
          <article className="referral-stat-card"><span className="referral-stat-icon"><Users size={18} /></span><small>{t("referral.peopleReferred")}</small><strong>{summary.totalReferrals}</strong></article>
          <article className="referral-stat-card"><span className="referral-stat-icon"><Gift size={18} /></span><small>{t("referral.creditsEarned")}</small><strong>{summary.referralCredits}</strong></article>
          <article className="referral-stat-card"><span className="referral-stat-icon"><Check size={18} /></span><small>{t("referral.freeMonthsActivated")}</small><strong>{activatedRewards.length}</strong></article>
        </div>

        <div className="referral-link-card">
          <label htmlFor="vendeo-referral-link">{t("referral.linkLabel")}</label>
          <div className="referral-link-row">
            <input id="vendeo-referral-link" type="text" readOnly value={summary.referralLink} aria-label={t("referral.linkLabel")} />
            <button type="button" className="btn btn-dark" onClick={() => void copyReferralLink()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? t("referral.copiedShort") : t("referral.copy")}
            </button>
          </div>
          <small>{t("referral.linkHint")}</small>
        </div>

        <div className="referral-progress-card">
          <div className="referral-progress-heading"><strong>{t("referral.nextFreeMonth")}</strong><span>{progress.towardNext}/{REFERRALS_PER_FREE_MONTH}</span></div>
          <div className="referral-progress-track" role="meter" aria-label={t("referral.nextFreeMonth")} aria-valuemin={0} aria-valuemax={REFERRALS_PER_FREE_MONTH} aria-valuenow={progress.towardNext}>
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <p>{t("referral.milestoneSummary", { count: summary.completedMilestones, remaining: REFERRALS_PER_FREE_MONTH - progress.towardNext })}</p>
        </div>

        {availableRewards.length > 0 ? <div className="referral-reward-card">
          <div><strong>{t("referral.rewardAvailable", { count: availableRewards.length })}</strong><p>{t("referral.rewardDescription")}</p></div>
          <button type="button" className="btn btn-dark" onClick={() => void activateReward()} disabled={actionBusy}>
            {actionBusy ? <LoaderCircle className="referral-spinner" size={16} /> : <Gift size={16} />}
            {actionBusy ? t("referral.activating") : t("referral.activate")}
          </button>
        </div> : null}

        <div className="referral-people-card">
          <div className="referral-people-heading"><h3>{t("referral.peopleTitle")}</h3><span>{summary.totalReferrals}</span></div>
          {people.length ? <ul className="referral-people-list">
            {people.map((person) => <li key={person.id}>
              <span className="referral-person-avatar" aria-hidden="true">{person.displayName?.slice(0, 1).toUpperCase() ?? <Users size={16} />}</span>
              <span className="referral-person-copy"><strong>{person.displayName ?? t("referral.personFallback", { number: person.number })}</strong><small>{formatDate(person.createdAt)}</small></span>
            </li>)}
          </ul> : <p className="referral-empty">{t("referral.noPeople")}</p>}
          {hasMore ? <button type="button" className="referral-load-more" onClick={() => void loadPage(nextOffset, true)} disabled={loadingMore}>
            {loadingMore ? t("referral.loadingMore") : t("referral.loadMore")}
          </button> : null}
        </div>
      </> : null}
    </section>
  );
}
