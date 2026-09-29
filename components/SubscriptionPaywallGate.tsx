"use client";

import { useEffect, useState } from "react";
import { TrialPaywallModal } from "@/components/TrialPaywallModal";

// Garde monté sur /dashboard : lit l'état réel de l'abonnement côté serveur
// (GET /api/subscription) et affiche la pop-up NON fermable dès que le compte
// est 'past_due' (essai de 15 jours ou abonnement de 30 jours expiré).
// Il revérifie au retour sur l'onglet pour éviter un accès prolongé.
export function SubscriptionPaywallGate() {
  const [subscription, setSubscription] = useState<{ status: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/subscription", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setSubscription(data.subscription ?? null);
      } catch {
        // Réseau indisponible : on garde l'état précédent.
      }
    }

    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <TrialPaywallModal subscription={subscription} />;
}
