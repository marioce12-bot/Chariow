"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck, Store } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import type { StoreData } from "./shared";
import "@/app/store-connection-gate.css";

export function hasConnectedChariowStore(stores: StoreData[]) {
  return stores.some(store => store.platform === "chariow" && store.connection_status === "connected");
}

export function getChariowConnectTarget(stores: StoreData[]) {
  const existing = stores.find(store => store.platform === "chariow" && store.connection_status !== "connected");
  return existing ? `/api/integrations/chariow/connect?store_id=${encodeURIComponent(existing.id)}` : "/api/integrations/chariow/connect";
}

export function StoreConnectionGate({ stores, failed, onSignOut }: { stores: StoreData[]; failed: boolean; onSignOut: () => void }) {
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
      window.location.assign(target);
    } catch {
      setError(en ? "Unable to start the connection. Check your connection and try again." : "Impossible de démarrer la connexion. Vérifie ta connexion et réessaie.");
      setBusy(false);
    }
  }

  return <div className="store-connection-backdrop">
    <div className="store-connection-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="store-connect-title" aria-describedby="store-connect-description" tabIndex={-1} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    }}>
      <span className="store-connection-icon"><Store size={28} aria-hidden="true" /></span>
      <span className="store-connection-kicker">{en ? "Your Vendeo workspace is ready" : "Ton espace Vendeo est prêt"}</span>
      <h2 id="store-connect-title">{en ? "Connect your Chariow store" : "Connecte ta boutique Chariow"}</h2>
      <p id="store-connect-description">{en ? "Your dashboard, ads and AI Studio are ready. Connect your Chariow store to continue and access your real products and sales." : "Ton dashboard, tes publicités et le Studio IA sont prêts. Connecte ta boutique Chariow pour continuer et retrouver tes vrais produits et ventes."}</p>
      {(error || failed) && <p className="store-connection-error" role="alert">{error || (en ? "The connection was not completed. You can safely try again." : "La connexion n’a pas abouti. Tu peux réessayer en toute sécurité.")}</p>}
      <button className="btn btn-dark store-connection-cta" type="button" disabled={busy} onClick={connect}>{busy ? (en ? "Connecting…" : "Connexion…") : (en ? "Connect my store" : "Connecter ma boutique")}<ArrowRight size={18} aria-hidden="true" /></button>
      <span className="store-connection-reassurance"><ShieldCheck size={15} aria-hidden="true" />{en ? "Secure connection through Chariow" : "Connexion sécurisée via Chariow"}</span>
      <button className="store-connection-signout" type="button" onClick={onSignOut}>{en ? "Sign out" : "Se déconnecter"}</button>
    </div>
  </div>;
}
