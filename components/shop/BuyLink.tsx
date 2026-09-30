"use client";

import type { ReactNode } from "react";

type Fbq = (command: string, event: string, params?: Record<string, unknown>) => void;

// Lien « Acheter » : passe par /shop/[slug]/buy/[produit] (comptage du clic + redirection). Signale aussi l'événement au pixel Meta s'il est chargé.
export function BuyLink({ href, productId, className, children }: { href: string; productId: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={className}
      rel="nofollow noopener"
      onClick={() => {
        try {
          (window as unknown as { fbq?: Fbq }).fbq?.("track", "InitiateCheckout", { content_ids: [productId], content_type: "product" });
        } catch {
          /* le pixel ne doit jamais bloquer l'achat */
        }
      }}
    >
      {children}
    </a>
  );
}
