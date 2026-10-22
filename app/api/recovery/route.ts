import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validRecoveryInput,
  validHttpsUrl,
  recoveryMessage,
  waLink,
  saleMatch,
  type RecoveryCase,
  normalizePhone,
} from "@/lib/recovery";
import { getRecoveryPaymentUrl, loadRecoveryProducts, type RecoveryLinkProduct } from "@/lib/chariow/product-links";
import { buildSaleContact } from "@/lib/chariow/sale-details";
async function ownedStore(supabase: any, userId: string, storeId: string) {
  return supabase
    .from("stores")
    .select("id,platform,store_name,mcp_url,access_token_encrypted")
    .eq("id", storeId)
    .eq("user_id", userId)
    .maybeSingle();
}
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
const safeString = (...values: any[]) => {
  for (const value of values)
    if (typeof value === "string" && value.trim()) return value.trim();
  return null;
};
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const storeId = new URL(request.url).searchParams.get("store_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return fail("Boutique invalide");
  const { data: store, error: ownerError } = await ownedStore(
    supabase,
    user.id,
    storeId,
  );
  if (ownerError || !store) return fail("Boutique introuvable", 404);
  if (store.platform === "shopify") return NextResponse.json({ cases: [], candidates: [], totalsByCurrency: [], salesAfterRecovery: [], storeName: store.store_name, whatsappIntegration: "unavailable", note: "Les relances Shopify ne sont pas activées : aucune coordonnée client ni panier abandonné n’est importé avec les permissions actuelles." });
  const { data: cases, error } = await supabase
    .from("payment_recovery_cases")
    .select("*")
    .eq("store_id", storeId)
    .order("abandoned_at", { ascending: false })
    .limit(201);
  if (error) return fail(error.message, 500);
  const cappedCases = (cases ?? []).slice(0, 200);
  const admin = createAdminClient();
  const cutoff = Date.now() - 30 * 864e5;
  const { data: abandoned, error: abandonedError } = await admin
    .from("chariow_sales")
    .select("chariow_sale_id,status,amount,currency,occurred_at,raw_payload")
    .eq("store_id", storeId)
    .in("status", ["abandoned", "failed"])
    .order("occurred_at", { ascending: false })
    .limit(301);
  if (abandonedError)
    return fail(
      `Impossible de charger les abandons: ${abandonedError.message}`,
      500,
    );
  let catalog: RecoveryLinkProduct[] = [];
  let catalogNote = "";
  if ((abandoned ?? []).some(s => !getRecoveryPaymentUrl(s.raw_payload))) {
    try { catalog = await loadRecoveryProducts(store); }
    catch { catalogNote = "Les liens du catalogue Chariow n’ont pas pu être actualisés. Réessaie dans un instant."; }
  }
  const candidates = (abandoned ?? [])
    .filter(
      (s) =>
        Date.parse(s.occurred_at ?? "") < Date.now() &&
        Date.parse(s.occurred_at ?? "") >= cutoff,
    )
    .map((s) => {
      const raw = s.raw_payload ?? {},
        contact = buildSaleContact(raw);
      return {
        id: String(s.chariow_sale_id),
        status: s.status,
        amount: s.amount ?? null,
        currency: s.currency ?? null,
        abandonedAt: s.occurred_at,
        customerName: contact.name,
        email: contact.email,
        phone: contact.phone,
        productName: safeString(
          raw.product_name,
          raw.product?.name,
          raw.product?.product_name,
          raw.data?.sale?.product_name,
          raw.data?.sale?.product?.name,
        ),
        paymentUrl: getRecoveryPaymentUrl(raw, catalog),
        failureReason: contact.failureReason,
        hasContact: !!(
          contact.phone ||
          contact.email ||
          raw.customer_id ||
          raw.customer?.id
        ),
      };
    });
  return NextResponse.json({
    cases: cappedCases,
    note:
      (cases ?? []).length > 200
        ? "Liste des cas plafonnée à 200."
        : (abandoned ?? []).length >= 300
          ? "Liste des abandons plafonnée à 300; affinez la période."
          : catalogNote || null,
    candidates: candidates
      .slice(0, 300)
      .filter((x) => !cases?.some((c) => c.source_sale_id === x.id)),
    storeName: store.store_name,
    whatsappIntegration: "manual",
    salesAfterRecovery: (cases ?? [])
      .filter((c) => c.status === "recovered")
      .map((c) => ({
        caseId: c.id,
        saleId: c.sale_id,
        attribution: c.attribution,
        amount: c.recovered_amount ?? null,
        currency: c.recovered_currency ?? null,
      })),
    totalsByCurrency: Object.values(
      (cases ?? [])
        .filter(
          (c) =>
            c.status === "recovered" &&
            c.recovered_amount != null &&
            c.recovered_currency,
        )
        .reduce((acc: any, c: any) => {
          const currency = String(
            c.recovered_currency ?? "Inconnue",
          ).toUpperCase();
          acc[currency] ??= { currency, reference: 0, estimated: 0, total: 0 };
          const amount = Number(c.recovered_amount ?? 0);
          acc[currency].total += amount;
          acc[currency][
            c.attribution === "confirmed" ? "reference" : "estimated"
          ] += amount;
          return acc;
        }, {}),
    ),
  });
}
export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("Corps invalide");
  const storeId = String(body.storeId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return fail("Boutique invalide");
  const { data: store } = await ownedStore(supabase, user.id, storeId);
  if (!store) return fail("Boutique introuvable", 404);
  if (store.platform === "shopify") return fail("Les relances Shopify nécessitent une intégration des paniers abandonnés et des coordonnées autorisées. Fonction non activée.", 422);
  const admin = createAdminClient();
  if (body.action === "create") {
    if (!validRecoveryInput(body))
      return fail(
        "Consentement explicite, provenance, date d'abandon passée, numéro valide et URL HTTPS requis",
      );
    const sourceSaleId =
      body.sourceSaleId == null ? null : String(body.sourceSaleId);
    if (sourceSaleId) {
      const { data: source, error } = await admin
        .from("chariow_sales")
        .select(
          "chariow_sale_id,status,amount,currency,occurred_at,raw_payload",
        )
        .eq("store_id", storeId)
        .eq("chariow_sale_id", sourceSaleId)
        .maybeSingle();
      if (error)
        return fail(
          `Vérification de la vente source impossible: ${error.message}`,
          500,
        );
      if (!source)
        return fail("Vente source introuvable dans cette boutique", 404);
      if (
        !["abandoned", "failed"].includes(String(source.status).toLowerCase())
      )
        return fail("La vente source doit être abandonnée ou échouée", 409);
      const { data: duplicate, error: dupError } = await supabase
        .from("payment_recovery_cases")
        .select("id")
        .eq("store_id", storeId)
        .eq("source_sale_id", sourceSaleId)
        .maybeSingle();
      if (dupError) return fail(dupError.message, 500);
      if (duplicate) return fail("Cette vente source a déjà un cas", 409);
      const sc = buildSaleContact(source.raw_payload ?? {});
      if (
        source.amount != null &&
        (body.amount == null || Number(body.amount) !== Number(source.amount))
      )
        return fail("Le montant ne correspond pas à la vente source", 400);
      if (
        source.currency &&
        String(body.currency ?? "")
          .trim()
          .toUpperCase() !== String(source.currency).trim().toUpperCase()
      )
        return fail("La devise ne correspond pas à la vente source", 400);
      if (
        sc.phone &&
        normalizePhone(body.phone).replace(/\D/g, "") !==
          normalizePhone(sc.phone).replace(/\D/g, "")
      )
        return fail("Le téléphone ne correspond pas à la vente source", 400);
      if (
        sc.email &&
        String(body.email ?? "")
          .trim()
          .toLowerCase() !== sc.email.toLowerCase()
      )
        return fail("L’email ne correspond pas à la vente source", 400);
      const sp =
        source.raw_payload?.product_name ?? source.raw_payload?.product?.name;
      if (
        typeof sp === "string" &&
        sp.trim() &&
        String(body.productName ?? "")
          .trim()
          .toLowerCase() !== sp.trim().toLowerCase()
      )
        return fail("Le produit ne correspond pas à la vente source", 400);
    }
    const normalizedPhone = normalizePhone(body.phone);
    const { data: opted, error: optError } = await supabase
      .from("payment_recovery_cases")
      .select("id")
      .eq("store_id", storeId)
      .eq("phone", normalizedPhone)
      .or("status.eq.opted_out,opt_out_at.not.is.null")
      .limit(1);
    if (optError) return fail(optError.message, 500);
    if (opted?.length)
      return fail("Contact désabonné; création interdite", 403);
    const consentDate =
      body.consentAt == null ? new Date() : new Date(body.consentAt);
    if (
      !Number.isFinite(consentDate.getTime()) ||
      consentDate.getTime() > Date.now()
    )
      return fail("Date de consentement invalide ou future");
    const optional = (v: any, max: number) =>
      typeof v === "string" ? v.trim().slice(0, max) || null : null;
    const amount =
      body.amount == null || body.amount === "" ? null : Number(body.amount);
    const row = {
      store_id: storeId,
      source_sale_id: sourceSaleId,
      customer_name: optional(body.customerName, 120),
      phone: normalizedPhone.slice(0, 40),
      email: optional(body.email, 254),
      customer_id: optional(body.customerId, 160),
      product_name: optional(body.productName, 160),
      amount,
      currency: optional(body.currency, 8)?.toUpperCase() ?? null,
      abandoned_at: new Date(body.abandonedAt).toISOString(),
      consent_at: consentDate.toISOString(),
      consent_source: body.consentSource.trim().slice(0, 300),
      payment_url: body.paymentUrl,
    };
    const { data, error } = await supabase
      .from("payment_recovery_cases")
      .insert(row)
      .select("*")
      .single();
    if (error) return fail(error.message, error.code === "23505" ? 409 : 500);
    return NextResponse.json({ case: data }, { status: 201 });
  }
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Cas invalide");
  const { data: c, error } = await supabase
    .from("payment_recovery_cases")
    .select("*")
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error || !c) return fail("Cas introuvable", 404);
  if (body.action === "reconcile") {
    if (!["sent", "recovered"].includes(c.status))
      return fail("Seuls les cas envoyés peuvent être rapprochés", 409);
    let sales: any[] = [];
    const reconciliationNow = new Date().toISOString();
    for (let start = 0; ; start += 1000) {
      const { data: page, error: salesError } = await admin
        .from("chariow_sales")
        .select(
          "chariow_sale_id,status,amount,currency,occurred_at,updated_at,raw_payload",
        )
        .eq("store_id", storeId)
        .gte("updated_at", c.sent_at)
        .lte("updated_at", reconciliationNow)
        .order("updated_at", { ascending: true })
        .order("chariow_sale_id", { ascending: true })
        .range(start, start + 999);
      if (salesError)
        return fail(
          `Impossible de rapprocher les ventes: ${salesError.message}`,
          500,
        );
      sales.push(...(page ?? []));
      if ((page ?? []).length < 1000) break;
    }
    const match = saleMatch(c as RecoveryCase, sales);
    if (!match) return NextResponse.json({ case: c, match: null });
    const saleId = String(match.sale.chariow_sale_id);
    const { data: used, error: usedError } = await supabase
      .from("payment_recovery_cases")
      .select("id")
      .eq("store_id", storeId)
      .eq("sale_id", saleId)
      .neq("id", id)
      .maybeSingle();
    if (usedError) return fail(usedError.message, 500);
    if (used)
      return NextResponse.json({
        case: c,
        match: null,
        notice: "Vente déjà attribuée à un autre cas",
      });
    const { data: updated, error: updateError } = await supabase
      .from("payment_recovery_cases")
      .update({
        status: "recovered",
        sale_id: saleId,
        recovered_amount: match.sale.amount,
        recovered_currency: match.sale.currency,
        attribution: match.attribution,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("store_id", storeId)
      .eq("status", c.status)
      .select("*")
      .single();
    if (updateError)
      return fail(
        updateError.message,
        updateError.code === "23505" ? 409 : 500,
      );
    return NextResponse.json({
      case: updated,
      match: { saleId, attribution: match.attribution },
    });
  }
  if (body.action === "opt_out") {
    const { data, error: updateError } = await supabase
      .from("payment_recovery_cases")
      .update({
        status: c.status === "recovered" ? "recovered" : "opted_out",
        opt_out_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("store_id", storeId)
      .select("*")
      .single();
    if (updateError) return fail(updateError.message, 500);
    return NextResponse.json({ case: data });
  }
  if (body.action === "prepare") {
    const { data: revoked, error: revokedError } = await supabase
      .from("payment_recovery_cases")
      .select("id")
      .eq("store_id", storeId)
      .eq("phone", c.phone)
      .or("status.eq.opted_out,opt_out_at.not.is.null")
      .limit(1);
    if (revokedError) return fail(revokedError.message, 500);
    if (revoked?.length) return fail("Contact désabonné; envoi interdit", 403);
    if (!["open", "prepared"].includes(c.status) || c.opt_out_at)
      return fail("Ce cas ne peut plus être préparé", 409);
    if (!c.consent_at || !c.consent_source || c.status === "opted_out")
      return fail("Consentement absent ou révoqué", 403);
    if (!validHttpsUrl(c.payment_url))
      return fail("URL de paiement HTTPS valide requise", 400);
    const message = recoveryMessage(
      c.customer_name,
      c.product_name,
      String(store.store_name ?? "votre boutique"),
      c.payment_url,
    );
    const url = waLink(c.phone, message);
    const { error: updateError } = await supabase
      .from("payment_recovery_cases")
      .update({
        status: "prepared",
        prepared_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("store_id", storeId)
      .in("status", ["open", "prepared"]);
    if (updateError) return fail(updateError.message, 500);
    return NextResponse.json({ url, message, status: "prepared" });
  }
  if (body.action === "sent") {
    const { data: revoked, error: revokeError } = await supabase
      .from("payment_recovery_cases")
      .select("id")
      .eq("store_id", storeId)
      .eq("phone", c.phone)
      .or("status.eq.opted_out,opt_out_at.not.is.null")
      .limit(1);
    if (revokeError) return fail(revokeError.message, 500);
    if (c.opt_out_at || revoked?.length)
      return fail("Contact désabonné; confirmation d’envoi interdite", 403);
    if (c.status !== "prepared")
      return fail(
        "Préparez d'abord le message; l'ouverture du lien ne signifie pas un envoi",
        409,
      );
    const { data, error: updateError } = await supabase
      .from("payment_recovery_cases")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("store_id", storeId)
      .eq("status", "prepared")
      .select("*")
      .single();
    if (updateError) return fail(updateError.message, 500);
    return NextResponse.json({ case: data });
  }
  return fail("Action inconnue");
}
