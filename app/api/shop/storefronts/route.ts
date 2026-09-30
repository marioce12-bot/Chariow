import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/shop/rate-limit";
import { presentStorefront } from "@/lib/shop/present";
import { STOREFRONT_COLUMNS, saveStorefront, type StorefrontRow } from "@/lib/shop/service";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("shop_storefronts").select(STOREFRONT_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: "Impossible de charger les vitrines" }, { status: 500 });
  const storefronts = await Promise.all(
    ((data ?? []) as StorefrontRow[]).map(async (row) => {
      const count = async (type: string) => {
        const { count: total } = await supabase.from("shop_storefront_events").select("id", { count: "exact", head: true }).eq("storefront_id", row.id).eq("event_type", type);
        return total ?? 0;
      };
      const [visits, buyClicks] = await Promise.all([count("visit"), count("buy_click")]);
      return presentStorefront(row, { visits, buyClicks });
    }),
  );
  return NextResponse.json({ storefronts });
}

// Crée (ou met à jour) la vitrine d'une boutique. Corps : { storeId, config, publish?, slug? }.
export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  if (rateLimit(`shop-write:${user.id}`, 30)) return NextResponse.json({ error: "Trop de requêtes, réessaie dans une minute" }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  if (typeof body.storeId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.storeId)) return NextResponse.json({ error: "storeId invalide" }, { status: 400 });
  if (body.publish !== undefined && typeof body.publish !== "boolean") return NextResponse.json({ error: "publish doit être vrai ou faux" }, { status: 400 });
  if (body.slug !== undefined && typeof body.slug !== "string") return NextResponse.json({ error: "slug invalide" }, { status: 400 });

  const result = await saveStorefront({ supabase, userId: user.id, storeId: body.storeId, config: body.config, publish: body.publish, preferredSlug: body.slug });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ storefront: presentStorefront(result.storefront) }, { status: result.created ? 201 : 200 });
}
