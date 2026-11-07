"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Gift, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/referral-bonus-popup.css";

type ReferralBonusNotification = { id: string; credits: 150; createdAt: string };
const SEEN_STORAGE_KEY = "vendeo_referral_bonus_notifications_seen_v1";
const MAX_SAVED_IDS = 200;
const POLL_INTERVAL_MS = 30_000;

function readSeenIds(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function ReferralBonusPopup() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<ReferralBonusNotification[]>([]);
  const [mounted, setMounted] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const queuedIdsRef = useRef<Set<string>>(new Set());
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    seenIdsRef.current = new Set(readSeenIds());
    let disposed = false;
    let checking = false;

    async function checkForRewards() {
      if (disposed || checking || document.visibilityState === "hidden" || navigator.onLine === false) return;
      checking = true;
      try {
        const response = await fetch("/api/referrals/bonus-notifications", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        if (disposed || !Array.isArray(payload?.transactions)) return;

        const newlyConfirmed = (payload.transactions as ReferralBonusNotification[])
          .filter((item) => item && typeof item.id === "string" && item.credits === 150 && typeof item.createdAt === "string")
          .reverse()
          .filter((item) => !seenIdsRef.current.has(item.id) && !queuedIdsRef.current.has(item.id));
        if (!newlyConfirmed.length) return;

        for (const item of newlyConfirmed) queuedIdsRef.current.add(item.id);
        setNotifications((current) => {
          const alreadyQueued = new Set(current.map((item) => item.id));
          return [...current, ...newlyConfirmed.filter((item) => !alreadyQueued.has(item.id))];
        });
      } catch {
        // The notification is checked again on the next focus, connection, or polling event.
      } finally {
        checking = false;
      }
    }

    const checkWhenAvailable = () => { void checkForRewards(); };
    void checkForRewards();
    const interval = window.setInterval(checkWhenAvailable, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkWhenAvailable);
    window.addEventListener("focus", checkWhenAvailable);
    window.addEventListener("pageshow", checkWhenAvailable);
    window.addEventListener("online", checkWhenAvailable);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkWhenAvailable);
      window.removeEventListener("focus", checkWhenAvailable);
      window.removeEventListener("pageshow", checkWhenAvailable);
      window.removeEventListener("online", checkWhenAvailable);
    };
  }, []);

  const activeNotification = notifications[0] ?? null;
  const isOpen = Boolean(activeNotification);

  useEffect(() => {
    if (!activeNotification || seenIdsRef.current.has(activeNotification.id)) return;
    queuedIdsRef.current.delete(activeNotification.id);
    seenIdsRef.current.add(activeNotification.id);
    try {
      window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...seenIdsRef.current].slice(-MAX_SAVED_IDS)));
    } catch {
      // Keep this tab's in-memory seen set when browser storage is unavailable.
    }
  }, [activeNotification?.id]);

  useEffect(() => {
    if (!isOpen) {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
      return;
    }

    if (!returnFocusRef.current) returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNotifications((current) => current.slice(1));
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function dismiss() {
    setNotifications((current) => current.slice(1));
  }

  if (!mounted || !activeNotification) return null;

  return createPortal(
    <div className="referral-bonus-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section className="referral-bonus-dialog" role="dialog" aria-modal="true" aria-labelledby="referral-bonus-title" aria-describedby="referral-bonus-description">
        <button ref={closeButtonRef} type="button" className="referral-bonus-close" onClick={dismiss} aria-label={t("referral.bonusPopupClose")}>
          <X size={19} aria-hidden="true" />
        </button>
        <div className="referral-bonus-icon" aria-hidden="true"><Gift size={30} strokeWidth={1.8} /></div>
        <h2 id="referral-bonus-title">{t("referral.bonusPopupTitle")}</h2>
        <p id="referral-bonus-description">{t("referral.bonusPopupBody")}</p>
        <button type="button" className="referral-bonus-confirm" onClick={dismiss}>{t("referral.bonusPopupDismiss")}</button>
      </section>
    </div>,
    document.body,
  );
}
