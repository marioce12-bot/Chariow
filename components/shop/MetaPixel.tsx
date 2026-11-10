"use client";

import { useEffect } from "react";
import { COOKIE_CONSENT_CHANGED_EVENT, hasMarketingConsent } from "@/lib/legal/cookie-consent";
import { enableMetaPixel } from "@/lib/legal/meta-pixels";

// Le Pixel du marchand ne se charge que si le visiteur a autorisé les traceurs facultatifs.
export function MetaPixel({ pixelId }: { pixelId: string }) {
  useEffect(() => {
    if (!/^\d{5,20}$/.test(pixelId)) return;
    const sync = () => {
      if (hasMarketingConsent()) enableMetaPixel(pixelId);
    };
    sync();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
  }, [pixelId]);
  return null;
}
