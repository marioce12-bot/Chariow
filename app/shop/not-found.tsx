import { ShopMessage } from "@/components/shop/Storefront";
import { useI18n } from "@/lib/i18n/i18n";

// Affichée (statut 404, noindex automatique) quand la vitrine est introuvable, non publiée, désactivée ou que l'abonnement du propriétaire n'est plus valide.
export default function ShopNotFound() {
  const { t } = useI18n();
  return <ShopMessage title={t("publicComplete.shop.notFoundTitle")} text={t("publicComplete.shop.notFoundText")} />;
}
