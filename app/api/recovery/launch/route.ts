import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSaleContact } from "@/lib/chariow/sale-details";
import { getRecoveryPaymentUrl, loadRecoveryProducts } from "@/lib/chariow/product-links";
import { normalizePhone, recoveryMessage, validHttpsUrl, waLink } from "@/lib/recovery";
const fail = (error: string, status = 400) => NextResponse.json({error}, {status});

export async function POST(request: Request) {
  const {supabase, user, response} = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("Requête invalide");
  const storeId = String(body.storeId ?? "");
  const sourceSaleId = String(body.sourceSaleId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || !sourceSaleId || sourceSaleId.length > 200) return fail("Boutique ou paiement invalide");
  if (body.consent !== true) return fail("Confirme que ce client a accepté les relances WhatsApp. Un numéro seul ne suffit pas.");
  const {data: store, error: storeError} = await supabase.from("stores")
    .select("id,store_name,mcp_url,access_token_encrypted").eq("id",storeId).eq("user_id",user.id).maybeSingle();
  if (storeError || !store) return fail("Boutique introuvable",404);
  const admin = createAdminClient();
  const {data: sale, error: saleError} = await admin.from("chariow_sales")
    .select("chariow_sale_id,status,amount,currency,occurred_at,raw_payload")
    .eq("store_id",storeId).eq("chariow_sale_id",sourceSaleId).maybeSingle();
  if (saleError) return fail("La vérification du paiement a échoué. Réessaie.",500);
  if (!sale) return fail("Paiement introuvable dans cette boutique",404);
  const occurred = Date.parse(sale.occurred_at ?? "");
  if (!["abandoned","failed"].includes(String(sale.status).toLowerCase())) return fail("Ce paiement n’est plus abandonné ou échoué. Actualise la liste.",409);
  if (!Number.isFinite(occurred) || occurred > Date.now() || occurred < Date.now()-30*864e5) return fail("Ce paiement n’est plus dans les 30 derniers jours.",409);
  const raw = sale.raw_payload ?? {};
  const contact = buildSaleContact(raw);
  const phone = normalizePhone(contact.phone ?? "");
  if (phone.replace(/\D/g,"").length < 8 || phone.replace(/\D/g,"").length > 15) return fail("Chariow ne fournit pas de numéro WhatsApp exploitable pour ce paiement.",422);
  const {data: opted, error: optError} = await supabase.from("payment_recovery_cases").select("id")
    .eq("store_id",storeId).eq("phone",phone).or("status.eq.opted_out,opt_out_at.not.is.null").limit(1);
  if (optError) return fail("Impossible de vérifier les désabonnements",500);
  if (opted?.length) return fail("Ce client ne souhaite plus être relancé.",403);
  const {data: existing, error: existingError} = await supabase.from("payment_recovery_cases").select("*")
    .eq("store_id",storeId).eq("source_sale_id",sourceSaleId).maybeSingle();
  if (existingError) return fail("Impossible de vérifier les relances existantes",500);
  if (existing) {
    if (existing.opt_out_at || !["open","prepared"].includes(existing.status)) return fail("Ce paiement a déjà été relancé ou ne peut plus l’être.",409);
    if (!existing.consent_at || !existing.consent_source) return fail("Le consentement enregistré est incomplet.",403);
    if (!validHttpsUrl(existing.payment_url)) return fail("Le lien de cette relance est indisponible. Actualise la boutique.",422);
    const message = recoveryMessage(existing.customer_name, existing.product_name, store.store_name ?? "notre boutique",existing.payment_url);
    const now = new Date().toISOString();
    const {error} = await supabase.from("payment_recovery_cases").update({status:"prepared",prepared_at:now,updated_at:now})
      .eq("id",existing.id).eq("store_id",storeId).in("status",["open","prepared"]);
    if (error) return fail("La préparation a échoué",500);
    return NextResponse.json({id:existing.id,url:waLink(phone,message),message,status:"prepared",delivery:"manual"});
  }
  let paymentUrl = getRecoveryPaymentUrl(raw);
  if (!paymentUrl) {
    try { paymentUrl = getRecoveryPaymentUrl(raw, await loadRecoveryProducts(store)); }
    catch { return fail("Le catalogue Chariow est momentanément indisponible. Réessaie après actualisation.",503); }
  }
  if (!paymentUrl) return fail("Chariow ne fournit pas encore de lien pour ce produit. Publie sa page sur la boutique puis actualise Vendeo.",422);
  const productName = [raw.product_name,raw.product?.name,raw.product?.title,raw.data?.sale?.product_name]
    .find(value => typeof value === "string" && value.trim())?.trim().slice(0,160) ?? null;
  const now = new Date().toISOString();
  const {data: row,error: insertError} = await supabase.from("payment_recovery_cases").insert({
    store_id:storeId,source_sale_id:sourceSaleId,customer_name:contact.name?.slice(0,120) ?? null,
    phone,email:contact.email?.slice(0,254) ?? null,product_name:productName,
    amount:sale.amount ?? null,currency:sale.currency ?? null,abandoned_at:sale.occurred_at,
    consent_at:now,consent_source:"Consentement client attesté par le marchand via la case de confirmation au lancement de la relance.",
    payment_url:paymentUrl,status:"prepared",prepared_at:now,
  }).select("id").single();
  if (insertError || !row) return fail(insertError?.code === "23505" ? "Cette relance existe déjà. Actualise la liste." : "Impossible de préparer la relance",insertError?.code === "23505" ? 409 : 500);
  const message = recoveryMessage(contact.name,productName,store.store_name ?? "notre boutique",paymentUrl);
  return NextResponse.json({id:row.id,url:waLink(phone,message),message,status:"prepared",delivery:"manual"},{status:201});
}
