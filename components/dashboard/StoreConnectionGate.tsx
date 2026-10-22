"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Globe, Lock, ShieldCheck, Store } from "lucide-react";
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

export function StoreConnectionGate({ stores, failed, onSignOut }: { stores: StoreData[]; failed: boolean; onSignOut: () => void }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const dialog = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<"intro" | "choose">("intro")
  const [shopDomain, setShopDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    if (dialog.current) {
      dialog.current.scrollTop = 0;
      dialog.current.focus();
    }
  }, [screen]);

  function changeScreen(next: typeof screen) {
    setError("");
    setScreen(next);
  }

  async function connectShopify() {
    if (busy) return;
    const shop = shopDomain.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      setError(en ? "Enter a valid *.myshopify.com domain." : "Saisis un domaine *.myshopify.com valide.");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/integrations/shopify/connect/check");
      if (!response.ok) throw new Error("configuration-check");
      const data = await response.json();
      if (data?.configured === false || data?.available === false) throw new Error("not-configured");
      window.location.assign(`/api/integrations/shopify/connect?shop=${encodeURIComponent(shop)}`);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "not-configured" ? (en ? "Shopify connection is not configured yet. Please try again later." : "La connexion Shopify n’est pas encore configurée. Réessaie plus tard.") : (en ? "Unable to verify Shopify setup or start connection. Please try again later." : "Impossible de vérifier la configuration Shopify ou de démarrer la connexion. Réessaie plus tard."));
      setBusy(false);
    }
  }
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
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter(control => !control.matches('input[type="radio"]:not(:checked)'));
      const first = controls[0], last = controls[controls.length - 1];
      const fromHeadingOrDialog = !controls.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (document.activeElement === first || fromHeadingOrDialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || fromHeadingOrDialog)) { event.preventDefault(); first?.focus(); }
    }}>
      <span className="store-connection-icon"><Store size={28} aria-hidden="true" /></span>
      <span className="store-connection-kicker">{en ? "Your Vendeo workspace is ready" : "Ton espace Vendeo est prêt"}</span>
      <h2 id="store-connect-title">{screen === "intro" ? (en ? "Connect your store" : "Connecte ta boutique") : (en ? "Which type of store?" : "Quel type de boutique ?")}</h2>
      <p id="store-connect-description">{screen === "intro"
        ? (en ? "Link your store to Vendeo to access your products and track sales once the connection has been verified." : "Relie ta boutique à Vendeo pour retrouver tes produits et suivre tes ventes une fois la connexion vérifiée.")
        : (en ? "Choose your store type. We will guide you through the right connection steps." : "Choisis ton type de boutique. Nous te guiderons dans les étapes adaptées.")}</p>
      {(error || failed) && <p className="store-connection-error" role="alert">{error || (en ? "The connection was not completed. You can safely try again." : "La connexion n’a pas abouti. Tu peux réessayer en toute sécurité.")}</p>}
      {screen === "intro" ? <button className="btn btn-dark store-connection-cta" type="button" onClick={() => changeScreen("choose")}>
        {en ? "Connect my store" : "Connecter ma boutique"}<ArrowRight size={18} aria-hidden="true" />
      </button> : <>
        <div className="store-type-options">
          <div className="store-type-option" style={{ display: "block" }}>
            <strong>Shopify</strong>
            <label style={{ display: "block", marginTop: 10 }}>{en ? "Shop domain" : "Domaine de la boutique"}
              <input aria-label={en ? "Shop domain" : "Domaine de la boutique"} value={shopDomain} onChange={event => setShopDomain(event.target.value)} placeholder="example.myshopify.com" autoComplete="url" disabled={busy} style={{ display: "block", width: "100%", marginTop: 5 }} />
            </label>
            <button className="btn btn-dark" type="button" disabled={busy} onClick={connectShopify} style={{ marginTop: 10 }}>{busy ? (en ? "Connecting…" : "Connexion…") : (en ? "Connect Shopify" : "Connecter Shopify")}</button>
          </div>
          <button className="store-type-option" type="button" aria-label="Chariow" disabled={busy} onClick={connect}>
            <Store size={23} aria-hidden="true" /><span><strong>Chariow</strong><span>{busy ? (en ? "Connecting…" : "Connexion…") : (en ? "Connect securely using the existing Chariow flow." : "Connexion sécurisée avec le parcours Chariow existant.")}</span></span><ArrowRight size={18} aria-hidden="true" />
          </button>
          <button className="store-type-option store-type-option-disabled" type="button" aria-label={en ? "Custom store" : "Boutique personnalisée"} aria-describedby="custom-store-unavailable" disabled>
            <Globe size={23} aria-hidden="true" /><span><strong>{en ? "Custom store" : "Boutique personnalisée"}</strong><span id="custom-store-unavailable">{en ? "Not available yet. Initial tests will be preview-only, before production approval." : "Indisponible pour le moment. Premiers tests en prévisualisation, avant validation pour la Production."}</span></span><Lock size={18} aria-hidden="true" />
          </button>
        </div>
        <button className="store-connection-back" type="button" disabled={busy} onClick={() => changeScreen("intro")}><ArrowLeft size={15} aria-hidden="true" />{en ? "Back" : "Retour"}</button>
      </>}
      <span className="store-connection-reassurance"><ShieldCheck size={15} aria-hidden="true" />{en ? "Secure connection, with your permission" : "Connexion sécurisée, avec ton autorisation"}</span>
      <button className="store-connection-signout" type="button" onClick={onSignOut}>{en ? "Sign out" : "Se déconnecter"}</button>
    </div>
  </div>;
}
