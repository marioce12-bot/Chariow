import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { supabase, admin, response } = await requireAdmin();
    if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
    // `admin` is the admin identity ({ id, role }), not a Supabase client.
    // Platform-wide tables and the admin_business_metrics RPC (revoked for anon/authenticated)
    // must be read with the service-role client.
    const service = createAdminClient();
    const [profiles, stores, subscriptions, messages, metaAccounts, audit, platformAudit, creditPurchases, creditTransactions, paymentEvents, businessMetrics, payouts] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,created_at,updated_at,subscriptions(plan,status)", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(100),
      supabase.from("stores").select("id,user_id,platform,store_name,is_active,connection_status,connected_at,created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(100),
      supabase.from("subscriptions").select("id,user_id,plan,status,messages_used_this_month,messages_limit,current_period_end,created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(100),
      supabase.from("messages").select("id,user_id,role,created_at", { count: "exact", head: true }),
      supabase.from("meta_ad_accounts").select("id,user_id,name,meta_account_id,is_active,last_synced_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(100),
      supabase.from("admin_audit_logs").select("id,action,resource_type,resource_id,metadata,created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(20),
      service.from("platform_audit_logs").select("id,actor_user_id,action,resource_type,resource_id,metadata,created_at").order("created_at", { ascending: false }).limit(200),
      service.from("credit_transactions").select("id,user_id,kind,credits,balance_before,balance_after,operation,model,provider_cost,external_id,status,metadata,created_at").eq("kind", "purchase").order("created_at", { ascending: false }).limit(200),
      service.from("credit_transactions").select("id,user_id,kind,credits,operation,model,status,metadata,created_at").eq("kind", "debit").order("created_at", { ascending: false }).limit(200),
      service.from("payment_events").select("id,user_id,transaction_id,plan,status,created_at").order("created_at", { ascending: false }).limit(200),
      service.rpc("admin_business_metrics"),
      service.from("platform_payouts").select("id,amount_xof,recipient_name,recipient_phone,recipient_method,status,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = [profiles, stores, subscriptions, messages, metaAccounts, audit, platformAudit, creditPurchases, creditTransactions, paymentEvents, businessMetrics, payouts].find((result) => result.error)?.error;
    if (firstError) return NextResponse.json({ error: firstError.message || "Erreur de lecture des données administrateur." }, { status: 500 });
    return NextResponse.json({ admin, metrics: { users: profiles.count ?? profiles.data?.length ?? 0, stores: stores.count ?? stores.data?.length ?? 0, subscriptions: subscriptions.count ?? subscriptions.data?.length ?? 0, messages: messages.count ?? 0, metaAccounts: metaAccounts.count ?? metaAccounts.data?.length ?? 0 }, business: businessMetrics.data ?? {}, users: profiles.data ?? [], stores: stores.data ?? [], subscriptions: subscriptions.data ?? [], metaAccounts: metaAccounts.data ?? [], audit: [...(platformAudit.data ?? []), ...(audit.data ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 200), creditPurchases: creditPurchases.data ?? [], creditTransactions: creditTransactions.data ?? [], paymentEvents: paymentEvents.data ?? [], payouts: payouts.data ?? [] });
  } catch (error) {
    console.error("Admin overview failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur inattendue." }, { status: 500 });
  }
}
