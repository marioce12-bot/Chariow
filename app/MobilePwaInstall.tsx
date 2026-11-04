"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type MobilePlatform = "android" | "ios" | null;

const DISMISSAL_KEY = "vendeo-mobile-install-dismissed";
const DISMISSAL_TTL = 1000 * 60 * 60 * 24 * 14;

function getMobilePlatform(): MobilePlatform {
  if (typeof navigator === "undefined") return null;
  const userAgent = navigator.userAgent;
  if (/Android/i.test(userAgent)) return "android";
  const iPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(userAgent) || iPadDesktopMode) return "ios";
  return null;
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function wasDismissed(): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISSAL_KEY));
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISSAL_TTL;
  } catch {
    return false;
  }
}

export function MobilePwaInstall() {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<MobilePlatform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const detectedPlatform = getMobilePlatform();
    if (!detectedPlatform || isStandalone() || wasDismissed()) return;

    setPlatform(detectedPlatform);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    const timer = detectedPlatform === "ios" ? window.setTimeout(() => setVisible(true), 1400) : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSAL_KEY, String(Date.now()));
    } catch {
      // La bannière reste simplement fermable si le stockage local est indisponible.
    }
    setVisible(false);
  }

  async function installOnAndroid() {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstalling(false);
    if (choice.outcome === "accepted") setVisible(false);
  }

  if (!visible || !platform) return null;

  return (
    <aside className="mobile-pwa-install" aria-labelledby="mobile-pwa-install-title">
      <button className="mobile-pwa-install__close" type="button" onClick={dismiss} aria-label={t("pwaInstall.close")}>
        ×
      </button>
      <div className="mobile-pwa-install__icon" aria-hidden="true">
        <img src="/icons/icon-192.png" alt="" width="42" height="42" />
      </div>
      <div className="mobile-pwa-install__content">
        <h2 id="mobile-pwa-install-title">{t("pwaInstall.title")}</h2>
        {platform === "android" ? (
          <>
            <p>{t("pwaInstall.androidDescription")}</p>
            <button className="mobile-pwa-install__action" type="button" onClick={() => void installOnAndroid()} disabled={installing}>
              {installing ? t("pwaInstall.installing") : t("pwaInstall.install")}
            </button>
          </>
        ) : (
          <>
            <p>{t("pwaInstall.iosDescription")}</p>
            <p className="mobile-pwa-install__steps">{t("pwaInstall.iosSteps")}</p>
          </>
        )}
      </div>
    </aside>
  );
}
