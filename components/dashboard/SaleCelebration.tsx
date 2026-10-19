"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/sale-celebration.css";

export const SALE_CELEBRATION_DURATION = 2000;
// A shared in-flight request survives React StrictMode's effect replay. The
// server atomically claims sales, including across tabs and devices.
const checks = new Map<string, Promise<boolean>>();
function checkSales(userId: string) {
  const existing = checks.get(userId);
  if (existing) return existing;
  const request = fetch("/api/sales/celebration", { method: "POST", cache: "no-store" })
    .then(async (response) => response.ok && (await response.json()).celebrate === true)
    .catch(() => false)
    .finally(() => { if (checks.get(userId) === request) checks.delete(userId); });
  checks.set(userId, request);
  return request;
}

const COLORS = ["#fbbf24", "#fb7185", "#a78bfa", "#38bdf8", "#34d399", "#fff4b8"];

/** Also exported independently to exercise the real visual without fake sales. */
export function SaleCelebrationOverlay() {
  const { locale } = useI18n();
  return createPortal(
    <div className="sale-celebration" data-testid="sale-celebration">
      <div className="sale-celebration-particles" aria-hidden="true">
        {Array.from({ length: 84 }, (_, index) => (
          <i key={`confetti-${index}`} className="sale-confetti" style={{
            "--x": `${(index * 37) % 101}vw`,
            "--drift": `${((index * 43) % 241) - 120}px`,
            "--delay": `${(index % 9) * 35}ms`,
            "--spin": `${360 + (index % 5) * 180}deg`,
            "--color": COLORS[index % COLORS.length],
          } as CSSProperties} />
        ))}
        {[{ x: "20%", y: "30%" }, { x: "80%", y: "26%" }, { x: "50%", y: "65%" }].map((burst, burstIndex) => (
          <div key={burstIndex} className="sale-firework" style={{ left: burst.x, top: burst.y }}>
            {Array.from({ length: 20 }, (_, index) => {
              const angle = index * Math.PI / 10;
              return <i key={index} className="sale-firework-spark" style={{
                "--dx": `${Math.cos(angle) * 130}px`,
                "--dy": `${Math.sin(angle) * 130}px`,
                "--delay": `${burstIndex * 160}ms`,
                "--color": COLORS[(index + burstIndex) % COLORS.length],
              } as CSSProperties} />;
            })}
          </div>
        ))}
      </div>
      <div className="sale-celebration-message" role="status" aria-live="polite" aria-atomic="true">
        <strong>Woohoo 🎉</strong>
        <span>{locale === "en" ? "New sale!" : "Nouvelle vente !"}</span>
      </div>
    </div>, document.body,
  );
}

export function SaleCelebration({ userId }: { userId: string }) {
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    let disposed = false;
    let checking = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      if (disposed || document.visibilityState === "hidden") return;
      pending = false;
      setCelebrating(true);
      clearTimeout(timer);
      timer = setTimeout(() => { if (!disposed) setCelebrating(false); }, SALE_CELEBRATION_DURATION);
    };
    const check = async () => {
      if (disposed || checking || document.visibilityState === "hidden" || navigator.onLine === false) return;
      if (pending) { show(); return; }
      checking = true;
      const celebrate = await checkSales(userId);
      checking = false;
      if (disposed || !celebrate) return;
      pending = true;
      show();
    };
    const onVisibility = () => { if (document.visibilityState !== "hidden") void check(); };
    void check();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    window.addEventListener("online", onVisibility);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      window.removeEventListener("online", onVisibility);
    };
  }, [userId]);
  return celebrating ? <SaleCelebrationOverlay /> : null;
}
