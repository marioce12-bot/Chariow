import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCachedStoreProducts } from "@/lib/shop/products";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const storeId = new URL(request.url).searchParams.get("store_id")?.trim() ?? "";
  if (!storeId || storeId.length > 120) return NextResponse.json({ error: "Boutique invalide." }, { status: 400 });

  const { data: store, error } = await supabase.from("stores")
    .select("id,platform,store_name,connection_status")
    .eq("id", storeId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de vérifier la boutique." }, { status: 500 });
  if (!store || store.platform !== "chariow" || store.connection_status !== "connected") {
    return NextResponse.json({ error: "Boutique Chariow connectée introuvable." }, { status: 404 });
  }

  try {
    const products = await getCachedStoreProducts(store.id);
    return NextResponse.json({
      store: { id: store.id, name: store.store_name },
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: product.currency,
        image: product.image,
        url: product.url,
      })),
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Le catalogue ne peut pas être chargé pour le moment." }, { status: 502 });
  }
}
