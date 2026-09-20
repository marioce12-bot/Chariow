"use client";

import { useEffect, useState } from "react";

const STATUS_COOKIE = "vendeo_chariow_status";

type Status = "unavailable" | "expired";

const MESSAGES: Record<Status, { title: string; text: string; action: string }> = {
  unavailable: {
    title: "Chariow ne répond pas pour le moment",
    text: "Tes produits et tes chiffres ne peuvent pas s'afficher tant que Chariow est indisponible. Ce n'est pas un problème de ton compte.",
    action: "Réessayer",
  },
  expired: {
    title: "La connexion à Chariow a expiré",
    text: "Reconnecte ta boutique pour retrouver tes produits et tes chiffres.",
    action: "Reconnecter",
  },
};

type StoreRow = { id: string; platform?: string; connection_status?: string };

function readStatus(): Status | null {
  const raw = document.cookie.split("; ").find((part) => part.startsWith(`${STATUS_COOKIE}=`));
  const value = raw?.split("=")[1];
  return value === "unavailable" || value === "expired" ? value : null;
}

// Bandeau affiché quand /api/analytics ou /connect signale (via cookie) que Chariow est en
// panne ou que la connexion a expiré. Avant, l'accueil restait simplement vide.
export default function ChariowStatusNotice() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const check = () => setStatus(readStatus());
    check();
    const timer = window.setInterval(check, 2000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  // Le message peut réapparaître à la prochaine panne une fois que Chariow a répondu à nouveau.
  useEffect(() => {
    if (!status) {
      setDismissed(null);
      setInfo(null);
    }
  }, [status]);

  // « Réessayer » teste vraiment Chariow :
  //  - il répond et les données arrivent  -> on recharge la page pour les afficher ;
  //  - il ne répond toujours pas          -> on le dit, sans relancer une connexion vouée à l'échec ;
  //  - connexion expirée / absente        -> on relance la connexion OAuth Chariow.
  async function retry() {
    setBusy(true);
    setInfo(null);
    try {
      const ping = await fetch("/api/analytics", { cache: "no-store" });
      if (ping.ok) {
        window.location.reload();
        return;
      }
      if (ping.status === 502 || ping.status === 503) {
        setInfo("Chariow ne répond toujours pas. Réessaie dans quelques minutes.");
        return;
      }
      const storesResponse = await fetch("/api/stores", { cache: "no-store" });
      const storesData = storesResponse.ok ? await storesResponse.json().catch(() => ({})) : {};
      const stores: StoreRow[] = Array.isArray(storesData.stores) ? storesData.stores : [];
      const chariowStores = stores.filter((store) => store.platform === "chariow");
      const target = chariowStores.find((store) => store.connection_status !== "connected") ?? chariowStores[0];
      window.location.href = target
        ? `/api/integrations/chariow/connect?store_id=${encodeURIComponent(target.id)}`
        : "/api/integrations/chariow/connect";
    } catch {
      setInfo("Impossible de joindre le serveur. Vérifie ta connexion internet.");
    } finally {
      setBusy(false);
    }
  }

  if (!status || dismissed === status) return null;
  const message = MESSAGES[status];

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 84,
        maxWidth: 520,
        margin: "0 auto",
        zIndex: 60,
        background: "#fff7ed",
        color: "#7c2d12",
        border: "1px solid #fdba74",
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,.15)",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <strong style={{ display: "block", marginBottom: 4 }}>{message.title}</strong>
      <span>{info ?? message.text}</span>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={busy}
          style={{ background: "#7c2d12", color: "#fff", border: 0, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Vérification…" : message.action}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(status)}
          style={{ background: "transparent", color: "#7c2d12", border: "1px solid #fdba74", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
