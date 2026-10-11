import { describe, expect, it } from "vitest";
import { loadStoreCustomerValue } from "./autopilot-customer-value";

type Row = {
  store_id: string;
  customer_id: string | null;
  status: string;
  net_amount: number;
  currency: string;
};

function mockSupabase(rows: Row[], error: unknown = null) {
  let selectedColumns = "";
  const builder: any = {};
  builder.select = (columns: string) => { selectedColumns = columns; return builder; };
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.range = async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error });
  return {
    client: { from: (table: string) => {
      expect(table).toBe("chariow_sales");
      return builder;
    } },
    selectedColumns: () => selectedColumns,
  };
}

const sales: Row[] = [
  { store_id: "s1", customer_id: "c1", status: "completed", net_amount: 120, currency: "XOF" },
  { store_id: "s1", customer_id: "c1", status: "settled", net_amount: 80, currency: "XOF" },
  { store_id: "s1", customer_id: "c2", status: "completed", net_amount: 100, currency: "XOF" },
];

describe("loadStoreCustomerValue", () => {
  it("calcule la valeur moyenne par client après regroupement des rachats", async () => {
    const mock = mockSupabase(sales);
    const result = await loadStoreCustomerValue(mock.client, "s1", "XOF");
    expect(result).toEqual({ customerCount: 2, customerValue: 150, complete: true });
    expect(mock.selectedColumns()).toBe("store_id,customer_id,status,net_amount,currency");
    expect(mock.selectedColumns()).not.toMatch(/email|phone|telephone/i);
  });

  it("désactive la protection si une vente confirmée n’a pas de customer_id", async () => {
    const mock = mockSupabase([...sales, { store_id: "s1", customer_id: null, status: "completed", net_amount: 50, currency: "XOF" }]);
    const result = await loadStoreCustomerValue(mock.client, "s1", "XOF");
    expect(result).toEqual({ customerCount: null, customerValue: null, complete: false });
  });

  it("désactive la protection si la requête de pages échoue", async () => {
    const mock = mockSupabase(sales, new Error("query failed"));
    const result = await loadStoreCustomerValue(mock.client, "s1", "XOF");
    expect(result).toEqual({ customerCount: null, customerValue: null, complete: false });
  });
});
