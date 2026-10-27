import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { fetchStoreProducts } from "@/lib/shop/products";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const { data: store, error } = await supabase
    .from("stores")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de vérifier la boutique." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    // Product-only upstream reads; unlike /api/analytics, this does not persist sales,
    // update synchronization timestamps, or send sale notifications.
    const products = await fetchStoreProducts(id, 3_000);
    return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Impossible de recharger le catalogue de la boutique." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
