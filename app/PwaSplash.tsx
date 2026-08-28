"use client";

import { useEffect, useState } from "react";

export function PwaSplash() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (!isStandalone || sessionStorage.getItem("vendeo-pwa-splash-seen")) return;
    sessionStorage.setItem("vendeo-pwa-splash-seen", "1");
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return <div className="pwa-splash" role="status" aria-label="Chargement de Vendeo">
    <video className="pwa-splash-video" autoPlay muted playsInline preload="auto" onEnded={() => setVisible(false)}>
      <source src="/vendeo-splash.mp4" type="video/mp4" />
    </video>
    <img className="pwa-splash-fallback" src="/icons/vendeo-app-icon.svg" alt="Vendeo" />
  </div>;
}
