"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck, Store } from "lucide-react";
import { FaShopify } from "react-icons/fa6";
import { useI18n } from "@/lib/i18n/i18n";
import type { StoreData } from "./shared";
import "@/app/store-connection-gate.css";

export function hasConnectedChariowStore(stores: StoreData[]) {
  return stores.some(store => store.platform === "chariow" && store.connection_status === "connected");
}

export function hasConnectedCommerceStore(stores: StoreData[]) {
  return hasConnectedChariowStore(stores) || stores.some(store => store.platform === "shopify" && store.connection_status === "connected" && store.is_active);
}

export function getChariowConnectTarget(stores: StoreData[]) {
  const existing = stores.find(store => store.platform === "chariow" && store.connection_status !== "connected");
  return existing ? `/api/integrations/chariow/connect?store_id=${encodeURIComponent(existing.id)}` : "/api/integrations/chariow/connect";
}

export function StoreConnectionGate({ stores, failed, onSignOut, onConnectStart }: { stores: StoreData[]; failed: boolean; onSignOut: () => void; onConnectStart?: () => void | Promise<void> }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const dialog = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  async function connect() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const target = getChariowConnectTarget(stores);
      if (!target.includes("store_id=")) {
        const response = await fetch("/api/integrations/chariow/connect/check");
        if (!response.ok) throw new Error("connection-check");
      }
      try { await onConnectStart?.(); } catch { /* OAuth should still proceed if onboarding persistence fails. */ }
      window.location.assign(target);
    } catch {
      setError(en ? "Unable to start the connection. Check your connection and try again." : "Impossible de démarrer la connexion. Vérifie ta connexion et réessaie.");
      setBusy(false);
    }
  }

  return <div className="store-connection-backdrop">
    <div className="store-connection-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="store-connect-title" aria-describedby="store-connect-description" tabIndex={-1} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter(control => !control.matches('input[type="radio"]:not(:checked)'));
      const first = controls[0], last = controls[controls.length - 1];
      const fromHeadingOrDialog = !controls.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (document.activeElement === first || fromHeadingOrDialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || fromHeadingOrDialog)) { event.preventDefault(); first?.focus(); }
    }}>
      <span className="store-connection-icon"><Store size={28} aria-hidden="true" /></span>
      <span className="store-connection-kicker">{en ? "Your Vendeo workspace is ready" : "Ton espace Vendeo est prêt"}</span>
      <h2 id="store-connect-title">{en ? "Connect your store" : "Connecte ta boutique"}</h2>
      <p id="store-connect-description">{en ? "Link your store to Vendeo to access your products and track sales once the connection has been verified." : "Relie ta boutique à Vendeo pour retrouver tes produits et suivre tes ventes une fois la connexion vérifiée."}</p>
      {(error || failed) && <p className="store-connection-error" role="alert">{error || (en ? "The connection was not completed. You can safely try again." : "La connexion n’a pas abouti. Tu peux réessayer en toute sécurité.")}</p>}
      <div className="store-platform-options">
        <button className="store-platform-option" type="button" aria-label="Chariow" disabled={busy} onClick={connect}>
          <span className="store-platform-logo"><img src="/logos/chariow-mark.svg" alt="Logo Chariow" width={36} height={36} /></span>
          <span><strong>Chariow</strong><small>{busy ? (en ? "Connecting…" : "Connexion…") : (en ? "Connect your Chariow store" : "Connecte ta boutique Chariow")}</small></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <button className="store-platform-option store-platform-option-shopify" type="button" aria-label="Shopify" aria-describedby="shopify-unavailable" disabled>
          <span className="store-platform-logo store-platform-logo-shopify"><FaShopify size={36} role="img" aria-label="Logo Shopify" /></span>
          <span><strong>Shopify</strong><small id="shopify-unavailable">{en ? "Temporarily unavailable" : "Temporairement indisponible"}</small></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      <span className="store-connection-reassurance"><ShieldCheck size={15} aria-hidden="true" />{en ? "Secure connection, with your permission" : "Connexion sécurisée, avec ton autorisation"}</span>
      <button className="store-connection-signout" type="button" onClick={onSignOut}>{en ? "Sign out" : "Se déconnecter"}</button>
    </div>
  </div>;
}
