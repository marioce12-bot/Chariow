"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { getDailyMotivation, type DailyMotivation } from "@/lib/daily-motivation";

export function DailyMotivationalQuote() {
  const { locale } = useI18n();
  const [quote, setQuote] = useState<DailyMotivation | null>(null);
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setQuote(getDailyMotivation(now));
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(refresh, midnight.getTime() - now.getTime() + 1000);
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  if (!quote) return <div className="daily-motivation-loading" aria-hidden="true" style={{ minHeight: 52 }} />;
  return <figure className="daily-motivation" style={{ margin: "14px 0 12px", maxWidth: 680 }}>
    <blockquote className="overview-quote" style={{ margin: 0, lineHeight: 1.55 }}>« {locale === "en" ? quote.en : quote.fr} »</blockquote>
    <figcaption style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
      — <cite style={{ fontStyle: "normal", fontWeight: 600 }}>{quote.author}</cite>
    </figcaption>
  </figure>;
}
