import type { CustomerSale } from "@/lib/unit-economics";

// Jeux de données de test des états A à D et des cas limites.
// Aucun email ni téléphone : seulement customer_id.

const sale = (customer: string, net: number, currency = "XOF", status = "completed", store = "store-1"): CustomerSale => ({
  store_id: store,
  customer_id: customer,
  status,
  net_amount: net,
  currency,
});

/** État A : boutique avec ventes, aucune pub Vendeo. */
export const stateASales: CustomerSale[] = [sale("c1", 8500), sale("c2", 17000), sale("c3", 8500), sale("c1", 8500, "XOF", "settled"), sale("c4", 0, "XOF", "abandoned"), sale("c5", 0, "XOF", "failed")];

/** État D : aucune vente confirmée (uniquement abandonnées et échouées). */
export const stateDSales: CustomerSale[] = [sale("c9", 0, "XOF", "abandoned"), sale("c8", 0, "XOF", "failed")];

/** Un seul client, une seule commande. */
export const singleCustomerSales: CustomerSale[] = [sale("solo", 10000)];

/** Rachats multiples : un client avec 3 commandes, un avec 2, un avec 1. */
export const repeatBuyersSales: CustomerSale[] = [sale("r1", 5000), sale("r1", 5000), sale("r1", 5000), sale("r2", 4000), sale("r2", 4000), sale("r3", 7000)];

/** Devises mixtes : XOF, EUR (convertible) et une devise inconnue (ignorée). */
export const mixedCurrencySales: CustomerSale[] = [sale("m1", 6559.57, "XOF"), sale("m1", 10, "EUR"), sale("m2", 100, "ZZZ"), sale("m3", 500, "")];

/** Même customer.id dans deux boutiques : deux clients distincts. */
export const twoStoresSales: CustomerSale[] = [sale("same", 1000, "XOF", "completed", "store-1"), sale("same", 2000, "XOF", "completed", "store-2")];

/** Vente sans customer_id : comptée à part. */
export const missingCustomerSales: CustomerSale[] = [{ store_id: "store-1", customer_id: null, status: "completed", net_amount: 3000, currency: "XOF" }, sale("ok", 3000)];
