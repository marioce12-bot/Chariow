import { fetchAllPages } from "./paginated-query";
import { aggregateCustomers, customerValue, type CustomerSale } from "./unit-economics";

const CUSTOMER_HISTORY_MAX_ROWS = 20_000;

export type CustomerHistory = {
  customerCount: number | null;
  customerValue: number | null;
  complete: boolean;
};

const unavailable: CustomerHistory = { customerCount: null, customerValue: null, complete: false };

/**
 * Reads only the store's customer ID, confirmed-sale status, net amount and currency.
 * An incomplete page set or any missing/unconvertible customer row disables the
 * protection instead of presenting a partial customer value as reliable.
 */
export async function loadStoreCustomerValue(
  supabase: any,
  storeId: string,
  targetCurrency: string,
): Promise<CustomerHistory> {
  const result = await fetchAllPages<CustomerSale>(async (from, to) => {
    const { data, error } = await supabase
      .from("chariow_sales")
      .select("store_id,customer_id,status,net_amount,currency")
      .eq("store_id", storeId)
      .order("occurred_at", { ascending: true })
      .order("chariow_sale_id", { ascending: true })
      .range(from, to);
    return { data: data as CustomerSale[] | null, error };
  }, 1000, CUSTOMER_HISTORY_MAX_ROWS);

  if (result.error || result.rows.length >= CUSTOMER_HISTORY_MAX_ROWS) return unavailable;
  const stats = aggregateCustomers(result.rows, targetCurrency);
  if (stats.withoutCustomer > 0 || stats.skippedSales > 0) return unavailable;
  return {
    customerCount: stats.customers,
    customerValue: customerValue(stats.netByCustomer),
    complete: true,
  };
}
