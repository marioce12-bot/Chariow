import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

function pick<T extends Record<string, any>, K extends keyof T>(
  row: T,
  keys: K[],
) {
  return Object.fromEntries(
    keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
  ) as Pick<T, K>;
}

function safePurchaseMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return undefined;
  const source = metadata as Record<string, unknown>;
  const safe: Record<string, string | number> = {};
  if (
    typeof source.amount_xof === "number" &&
    Number.isFinite(source.amount_xof)
  )
    safe.amount_xof = source.amount_xof;
  if (source.provider === "admin_grant") safe.provider = "admin_grant";
  return Object.keys(safe).length ? safe : undefined;
}

export async function GET() {
  const { supabase, admin, response } = await requireAdmin();
  if (!admin)
    return (
      response ??
      NextResponse.json(
        { error: "Accès administrateur requis" },
        { status: 403 },
      )
    );
  const service = createAdminClient();
  const [
    profiles,
    stores,
    subscriptions,
    messages,
    metaAccounts,
    audit,
    platformAudit,
    creditPurchases,
    creditTransactions,
    paymentEvents,
    businessMetrics,
    payouts,
    launchedCampaigns,
    activeCampaigns,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,full_name,created_at,subscriptions(plan,status)", {
        count: "exact",
        head: false,
      })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("stores")
      .select(
        "id,user_id,platform,is_active,connection_status,connected_at,created_at",
        { count: "exact", head: false },
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("subscriptions")
      .select(
        "id,user_id,plan,status,messages_used_this_month,messages_limit,current_period_end,created_at",
        { count: "exact", head: false },
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("messages")
      .select("id,user_id,role,created_at", { count: "exact", head: true }),
    supabase
      .from("meta_ad_accounts")
      .select("id,user_id,is_active,last_synced_at", {
        count: "exact",
        head: false,
      })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("admin_audit_logs")
      .select("id,action,resource_type,created_at", {
        count: "exact",
        head: false,
      })
      .order("created_at", { ascending: false })
      .limit(20),
    service
      .from("platform_audit_logs")
      .select("id,action,resource_type,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    service
      .from("credit_transactions")
      .select("id,user_id,kind,credits,operation,status,metadata,created_at")
      .eq("kind", "purchase")
      .order("created_at", { ascending: false })
      .limit(200),
    service
      .from("credit_transactions")
      .select("id,user_id,kind,credits,operation,model,status,created_at")
      .eq("kind", "debit")
      .order("created_at", { ascending: false })
      .limit(200),
    service
      .from("payment_events")
      .select("id,user_id,plan,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    service.rpc("admin_business_metrics"),
    service
      .from("platform_payouts")
      .select("id,amount_xof,recipient_method,status,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("ad_campaigns")
      .select("id", { count: "exact", head: true })
      .or("status.in.(paid,submitting,review,active,paused,autopilot_paused,rejected,error,completed,archived,deleted),and(external_campaign_id.not.is.null,status.not.in.(draft,account_required,pending_payment))"),
    service
      .from("ad_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);
  const connectionMetrics = await service.rpc("admin_connection_metrics");
  if (connectionMetrics.error) {
    console.error("Admin connection metrics unavailable", {
      code: connectionMetrics.error.code ?? "unknown",
    });
  }
  if (launchedCampaigns.error) console.error("Admin launched campaign count unavailable", { code: launchedCampaigns.error.code ?? "unknown" });
  if (activeCampaigns.error) console.error("Admin active campaign count unavailable", { code: activeCampaigns.error.code ?? "unknown" });
  const firstError = [
    profiles,
    stores,
    subscriptions,
    messages,
    metaAccounts,
    audit,
    platformAudit,
    creditPurchases,
    creditTransactions,
    paymentEvents,
    businessMetrics,
    payouts,
  ].find((result) => result.error)?.error;
  if (firstError)
    return NextResponse.json({ error: "Console unavailable" }, { status: 500 });
  const safeAudit = [...(platformAudit.data ?? []), ...(audit.data ?? [])]
    .map((row) => pick(row, ["id", "action", "resource_type", "created_at"]))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 200);
  const safeUsers = (profiles.data ?? []).map((row) => {
    const { subscriptions: related, ...user } = row;
    const subscription = Array.isArray(related) ? related[0] : related;
    return {
      ...pick(user, ["id", "email", "full_name", "created_at"]),
      ...(subscription
        ? { subscription: pick(subscription, ["plan", "status"]) }
        : {}),
    };
  });
  // Match reserve_credits: spendable credits = balance - reserved, never transaction history.
  // A missing/inaccessible account is deliberately omitted so the UI can distinguish it from zero.
  const userIds = safeUsers.map((user) => user.id);
  const creditBalances = userIds.length
    ? await service
        .from("credit_accounts")
        .select("user_id,balance,reserved")
        .in("user_id", userIds)
    : { data: [], error: null };
  const balancesByUser = new Map(
    (creditBalances.error ? [] : creditBalances.data ?? [])
      .filter((row) => Number.isSafeInteger(row.balance) && Number.isSafeInteger(row.reserved) && row.reserved >= 0 && row.balance >= row.reserved)
      .map((row) => [row.user_id, row.balance - row.reserved]),
  );
  const usersWithBalances = safeUsers.map((user) => ({
    ...user,
    ...(balancesByUser.has(user.id) ? { credit_balance: balancesByUser.get(user.id) } : {}),
  }));
  return NextResponse.json({
    admin: { role: admin.role },
    metrics: {
      users: profiles.count ?? profiles.data?.length ?? 0,
      stores: stores.count ?? stores.data?.length ?? 0,
      subscriptions: subscriptions.count ?? subscriptions.data?.length ?? 0,
      messages: messages.count ?? 0,
      metaAccounts: metaAccounts.count ?? metaAccounts.data?.length ?? 0,
      connectedUsersWithStore: connectionMetrics.error ? null : Number(connectionMetrics.data?.users_with_store ?? 0),
      connectedUsersWithAdAccount: connectionMetrics.error ? null : Number(connectionMetrics.data?.users_with_ad_account ?? 0),
      connectedStores: connectionMetrics.error ? null : Number(connectionMetrics.data?.connected_stores ?? 0),
      connectedAdAccounts: connectionMetrics.error ? null : Number(connectionMetrics.data?.connected_ad_accounts ?? 0),
      campaignsLaunched: launchedCampaigns.error ? null : launchedCampaigns.count ?? null,
      campaignsActive: activeCampaigns.error ? null : activeCampaigns.count ?? null,
    },
    business: businessMetrics.data ?? {},
    users: usersWithBalances,
    stores: (stores.data ?? []).map((row) =>
      pick(row, [
        "id",
        "user_id",
        "platform",
        "is_active",
        "connection_status",
        "connected_at",
        "created_at",
      ]),
    ),
    subscriptions: subscriptions.data ?? [],
    metaAccounts: (metaAccounts.data ?? []).map((row) =>
      pick(row, ["id", "user_id", "is_active", "last_synced_at"]),
    ),
    audit: safeAudit,
    creditPurchases: (creditPurchases.data ?? []).map((row) => ({
      ...pick(row, [
        "id",
        "user_id",
        "kind",
        "credits",
        "operation",
        "status",
        "created_at",
      ]),
      ...(safePurchaseMetadata(row.metadata)
        ? { metadata: safePurchaseMetadata(row.metadata) }
        : {}),
    })),
    creditTransactions: (creditTransactions.data ?? []).map((row) =>
      pick(row, [
        "id",
        "user_id",
        "kind",
        "credits",
        "operation",
        "model",
        "status",
        "created_at",
      ]),
    ),
    paymentEvents: (paymentEvents.data ?? []).map((row) =>
      pick(row, ["id", "user_id", "plan", "status", "created_at"]),
    ),
    payouts: (payouts.data ?? []).map((row) =>
      pick(row, [
        "id",
        "amount_xof",
        "recipient_method",
        "status",
        "created_at",
      ]),
    ),
  });
}
