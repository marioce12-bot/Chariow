import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { product_id?: string; product_name?: string; product_url?: string } | null;
  if (!body?.product_id || !body?.product_name) return NextResponse.json({ error: "Sélectionne un produit" }, { status: 400 });

  const { data: campaign, error: campaignError } = await supabase.from("meta_campaigns").select("id,ad_account_id").eq("id", id).maybeSingle();
  if (campaignError || !campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  const { data: account } = await supabase.from("meta_ad_accounts").select("id").eq("id", campaign.ad_account_id).eq("user_id", user.id).maybeSingle();
  if (!account) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

  const { error } = await supabase.from("campaign_product_links").upsert(
    { user_id: user.id, meta_campaign_id: id, product_id: body.product_id, product_name: body.product_name, product_url: body.product_url ?? null, confidence: "manual", updated_at: new Date().toISOString() },
    { onConflict: "meta_campaign_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  await supabase.from("campaign_product_links").delete().eq("meta_campaign_id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
