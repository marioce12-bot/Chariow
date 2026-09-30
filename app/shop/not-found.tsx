import { ShopMessage } from "@/components/shop/Storefront";

// Affichée (statut 404, noindex automatique) quand la vitrine est introuvable, non publiée, désactivée ou que l'abonnement du propriétaire n'est plus valide.
export default function ShopNotFound() {
  return <ShopMessage title="Boutique indisponible" text="Cette boutique n’est pas disponible pour le moment." />;
}
