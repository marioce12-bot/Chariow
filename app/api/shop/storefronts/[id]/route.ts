import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/shop/rate-limit";
import { presentStorefront } from "@/lib/shop/present";
import { STOREFRONT_COLUMNS, saveStorefront, setStorefrontPublished, type StorefrontRow } from "@/lib/shop/service";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(_request: Request, { params }: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Vitrine introuvable" }, { status: 404 });
  const { data } = await supabase.from("shop_storefronts").select(STOREFRONT_COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Vitrine introuvable" }, { status: 404 });
  return NextResponse.json({ storefront: presentStorefront(data as StorefrontRow) });
}

// Modifie la configuration et/ou publie / dépublie. Corps : { config?, isPublished? }. Le slug ne change pas en v1.
export async function PATCH(request: Request, { params }: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  if (rateLimit(`shop-write:${user.id}`, 30)) return NextResponse.json({ error: "Trop de requêtes, réessaie dans une minute" }, { status: 429 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Vitrine introuvable" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  if (body.isPublished !== undefined && typeof body.isPublished !== "boolean") return NextResponse.json({ error: "isPublished doit être vrai ou faux" }, { status: 400 });
  if (body.config === undefined && body.isPublished === undefined) return NextResponse.json({ error: "Rien à modifier" }, { status: 400 });

  const { data: existing } = await supabase.from("shop_storefronts").select("id, store_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Vitrine introuvable" }, { status: 404 });

  const result = body.config !== undefined
    ? await saveStorefront({ supabase, userId: user.id, storeId: existing.store_id, config: body.config, publish: body.isPublished })
    : await setStorefrontPublished(supabase, user.id, id, body.isPublished);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ storefront: presentStorefront(result.storefront) });
}
