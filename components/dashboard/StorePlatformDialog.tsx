"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import { FaShopify } from "react-icons/fa6";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/store-platform-dialog.css";

export function StorePlatformDialog({ full, busy, error, onChoose, onClose }: {
  full: boolean;
  busy: boolean;
  error: string;
  onChoose: (platform: "chariow" | "shopify") => void;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const en = locale === "en";
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  return <div className="store-platform-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialog} className="store-platform-dialog" role="dialog" aria-modal="true" aria-labelledby="store-platform-title" aria-describedby="store-platform-description" tabIndex={-1} onKeyDown={event => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'));
      const first = controls[0], last = controls[controls.length - 1];
      const outside = !controls.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first?.focus(); }
    }}>
      <button type="button" className="store-platform-close" aria-label={en ? "Close" : "Fermer"} onClick={onClose} disabled={busy}><X size={20} /></button>
      <span className="eyebrow">{en ? "Add a store" : "Ajouter une boutique"}</span>
      <h2 id="store-platform-title">{en ? "Choose your platform" : "Choisis ta plateforme"}</h2>
      <p id="store-platform-description">{en ? "Which platform is your store on?" : "Sur quelle plateforme se trouve ta boutique ?"}</p>
      {full && <p className="store-platform-notice" role="status">{en ? "All 3 store slots are in use. You cannot add another store." : "Tes 3 emplacements sont utilisés. Tu ne peux pas ajouter une autre boutique."}</p>}
      <div className="store-platform-options">
        <button type="button" className="store-platform-option" aria-label="Chariow" disabled={busy || full} onClick={() => onChoose("chariow")}>
          <span className="store-platform-logo"><img src="/logos/chariow-mark.svg" alt="Logo Chariow" width={36} height={36} /></span>
          <span><strong>Chariow</strong><small>{en ? "Connect your Chariow store" : "Connecte ta boutique Chariow"}</small></span><ArrowRight size={18} aria-hidden="true" />
        </button>
        <button type="button" className="store-platform-option" aria-label="Shopify" disabled={busy || full} onClick={() => onChoose("shopify")}>
          <span className="store-platform-logo store-platform-logo-shopify"><FaShopify size={36} role="img" aria-label="Logo Shopify" /></span>
          <span><strong>Shopify</strong><small>{en ? "Connect your Shopify store" : "Connecte ta boutique Shopify"}</small></span><ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      {busy && <p role="status">{en ? "Connecting…" : "Connexion…"}</p>}
      {error && <p className="store-error" role="alert">{error}</p>}
    </section>
  </div>;
}
