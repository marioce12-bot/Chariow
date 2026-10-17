import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { aggregateProductProfit } from "@/lib/product-profit-math";

const MAX = 999999999999.99;
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function productLabel(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;
  const product =
    payload.product && typeof payload.product === "object"
      ? (payload.product as Record<string, unknown>)
      : {};
  return (
    str(payload.product_name) ??
    str(product.name) ??
    str(product.title) ??
    str(payload.product_title)
  );
}
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId");
  if (!storeId)
    return NextResponse.json({ error: "storeId requis" }, { status: 400 });
  const period = params.get("period") ?? "30";
  if (!/^(7|30|90)$/.test(period))
    return NextResponse.json({ error: "Période invalide" }, { status: 400 });
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("user_id", user.id)
    .single();
  if (storeError || !store)
    return NextResponse.json(
      { error: "Boutique introuvable" },
      { status: 404 },
    );
  const since = new Date(Date.now() - Number(period) * 86400000).toISOString();
  const pageSize = 1000;
  let from = 0;
  const sales: Array<{
    product_id: string | null;
    amount: number | string | null;
    net_amount: number | string | null;
    currency: string | null;
    status: string;
    product_name?: string | null;
    raw_payload?: unknown;
  }> = [];
  while (true) {
    const { data, error } = await supabase
      .from("chariow_sales")
      .select("product_id, amount, net_amount, currency, status, raw_payload")
      .eq("store_id", storeId)
      .gte("occurred_at", since)
      .lte("occurred_at", new Date().toISOString())
      .order("occurred_at", { ascending: true })
      .order("chariow_sale_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? [])
      sales.push({ ...row, product_name: productLabel(row.raw_payload) });
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  const { data: costs, error: costsError } = await supabase
    .from("product_profit_costs")
    .select("product_id, currency, unit_cost, fee_per_sale, updated_at")
    .eq("store_id", storeId);
  if (costsError)
    return NextResponse.json({ error: costsError.message }, { status: 500 });
  return NextResponse.json({
    products: aggregateProductProfit(sales, costs ?? []),
    costs: costs ?? [],
  });
}
export async function PUT(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const { storeId, productId, currency, unitCost = 0, feePerSale = 0 } = body ?? {};
  const code =
    typeof currency === "string" ? currency.trim().toUpperCase() : "";
  const validCost = (v: unknown) =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= 0 &&
    v <= MAX &&
    Math.abs(Math.round(v * 100) - v * 100) <=
      Math.max(1e-7, Number.EPSILON * Math.abs(v * 100) * 2);
  if (
    typeof storeId !== "string" ||
    typeof productId !== "string" ||
    !productId.trim() ||
    !/^[A-Z0-9]{3,8}$/.test(code) ||
    !validCost(unitCost) ||
    !validCost(feePerSale)
  )
    return NextResponse.json(
      {
        error:
          "Boutique, produit, devise et coûts (0 à 999999999999,99, deux décimales maximum) valides requis",
      },
      { status: 400 },
    );
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("user_id", user.id)
    .single();
  if (storeError || !store)
    return NextResponse.json(
      { error: "Boutique introuvable" },
      { status: 404 },
    );
  const { data, error } = await supabase
    .from("product_profit_costs")
    .upsert(
      {
        store_id: storeId,
        product_id: productId.trim(),
        currency: code,
        unit_cost: unitCost,
        fee_per_sale: feePerSale,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,product_id,currency" },
    )
    .select("product_id, currency, unit_cost, fee_per_sale, updated_at")
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cost: data });
}
