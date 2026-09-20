"use client";

import { useEffect, useState } from "react";

const STATUS_COOKIE = "vendeo_chariow_status";

type Status = "unavailable" | "expired";

const MESSAGES: Record<Status, { title: string; text: string }> = {
  unavailable: {
    title: "Chariow ne répond pas pour le moment",
    text: "Tes produits et tes chiffres ne peuvent pas s'afficher tant que Chariow est indisponible. Ce n'est pas un problème de ton compte : réessaie dans quelques minutes.",
  },
  expired: {
    title: "La connexion à Chariow a expiré",
    text: "Reconnecte ta boutique dans « Boutiques Chariow » pour retrouver tes produits et tes chiffres.",
  },
};

function readStatus(): Status | null {
  const raw = document.cookie.split("; ").find((part) => part.startsWith(`${STATUS_COOKIE}=`));
  const value = raw?.split("=")[1];
  return value === "unavailable" || value === "expired" ? value : null;
}

// Bandeau affiché quand /api/analytics signale (via cookie) que Chariow est en
// panne ou que la connexion a expiré. Avant, l'accueil restait simplement vide.
export default function ChariowStatusNotice() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState<Status | null>(null);

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
    if (!status) setDismissed(null);
  }, [status]);

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
      <span>{message.text}</span>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ background: "#7c2d12", color: "#fff", border: 0, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
        >
          Réessayer
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
