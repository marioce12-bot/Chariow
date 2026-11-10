import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 50;
const MAX_PAGE = 19;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DbRow = Record<string, any>;
type Actor = { id: string; name: string | null; email: string | null };
type HistoryEvent = {
  id: string;
  type: "credit_purchase" | "admin_credit_gift" | "subscription_payment" | "subscription_admin_activation";
  created_at: string;
  status: string;
  plan?: string;
  credits?: number;
  amount_xof?: number;
  provider_amount?: number;
  provider_currency?: string;
  provider?: string;
  reference?: string;
  note?: string;
  author?: Actor | null;
};

type Context = { params: Promise<{ id: string }> };

function safeText(value: unknown, max = 120): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function safeAmount(value: unknown): number | undefined {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function safeReference(value: unknown): string | undefined {
  return safeText(value, 100);
}

export async function GET(request: Request, { params }: Context) {
  const { admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });

  const { id: userId } = await params;
  if (!USER_ID.test(userId)) return NextResponse.json({ error: "Identifiant utilisateur invalide." }, { status: 400 });

  const searchParams = new URL(request.url).searchParams;
  const rawPage = Number(searchParams.get("page") ?? 0);
  const page = Number.isInteger(rawPage) ? Math.max(0, Math.min(rawPage, MAX_PAGE)) : 0;
  const end = (page + 1) * PAGE_SIZE - 1;
  const service = createAdminClient();

  const [payments, credits, creditAudit, subscriptionAudit] = await Promise.all([
    service.from("payment_events")
      .select("id,transaction_id,plan,status,metadata,created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(0, end),
    service.from("credit_transactions")
      .select("id,kind,credits,operation,external_id,status,metadata,created_at", { count: "exact" })
      .eq("user_id", userId)
      .eq("kind", "purchase")
      .order("created_at", { ascending: false })
      .range(0, end),
    service.from("platform_audit_logs")
      .select("id,actor_user_id,metadata,created_at", { count: "exact" })
      .eq("resource_type", "credit_account")
      .eq("resource_id", userId)
      .eq("action", "admin_credits_granted")
      .order("created_at", { ascending: false })
      .range(0, end),
    service.from("admin_audit_logs")
      .select("id,admin_user_id,resource_id,metadata,created_at", { count: "exact" })
      .eq("resource_type", "subscription")
      .eq("action", "subscription_activated")
      .contains("metadata", { user_id: userId })
      .order("created_at", { ascending: false })
      .range(0, end),
  ]);

  const queryError = [payments, credits, creditAudit, subscriptionAudit].find((result) => result.error)?.error;
  if (queryError) {
    console.error("Admin account history unavailable", { code: queryError.code ?? "unknown" });
    return NextResponse.json({ error: "Historique indisponible." }, { status: 500 });
  }

  const paymentRows = (payments.data ?? []) as DbRow[];
  const creditRows = (credits.data ?? []) as DbRow[];
  const creditAuditRows = (creditAudit.data ?? []) as DbRow[];
  const subscriptionAuditRows = (subscriptionAudit.data ?? []) as DbRow[];
  const auditByGrantId = new Map<string, DbRow>();
  for (const row of creditAuditRows) {
    const grantId = safeText(safeMetadata(row.metadata).grant_id, 100);
    if (grantId && !auditByGrantId.has(grantId)) auditByGrantId.set(grantId, row);
  }

  const adminUserIds = [...new Set(subscriptionAuditRows.map((row) => safeText(row.admin_user_id, 80)).filter(Boolean))] as string[];
  const adminUsersResult = adminUserIds.length
    ? await service.from("admin_users").select("id,user_id").in("id", adminUserIds)
    : { data: [], error: null };
  if (adminUsersResult.error) {
    console.error("Admin account history actor lookup unavailable", { code: adminUsersResult.error.code ?? "unknown" });
    return NextResponse.json({ error: "Historique indisponible." }, { status: 500 });
  }
  const adminUsers = (adminUsersResult.data ?? []) as DbRow[];
  const profileIds = [...new Set([
    ...creditAuditRows.map((row) => safeText(row.actor_user_id, 80)),
    ...adminUsers.map((row) => safeText(row.user_id, 80)),
  ].filter(Boolean))] as string[];
  const profilesResult = profileIds.length
    ? await service.from("profiles").select("id,email,full_name").in("id", profileIds)
    : { data: [], error: null };
  if (profilesResult.error) {
    console.error("Admin account history profile lookup unavailable", { code: profilesResult.error.code ?? "unknown" });
    return NextResponse.json({ error: "Historique indisponible." }, { status: 500 });
  }

  const profiles = new Map<string, Actor>((profilesResult.data ?? []).map((profile: DbRow) => [
    profile.id,
    { id: profile.id, name: safeText(profile.full_name, 120) ?? null, email: safeText(profile.email, 254) ?? null },
  ]));
  const profileForAdminUser = new Map<string, Actor | undefined>();
  for (const row of adminUsers) profileForAdminUser.set(row.id, profiles.get(row.user_id));

  const events: HistoryEvent[] = [];
  for (const row of paymentRows) {
    const metadata = safeMetadata(row.metadata);
    const event: HistoryEvent = {
      id: `payment:${safeText(row.id, 80) ?? "unknown"}`,
      type: "subscription_payment",
      created_at: row.created_at,
      status: safeText(row.status, 40) ?? "unknown",
      reference: safeReference(row.transaction_id) ?? safeReference(row.id),
      ...(safeText(row.plan, 40) ? { plan: safeText(row.plan, 40) } : {}),
      ...(safeAmount(metadata.amount_xof) !== undefined ? { amount_xof: safeAmount(metadata.amount_xof) } : {}),
      ...(safeAmount(metadata.provider_amount) !== undefined ? { provider_amount: safeAmount(metadata.provider_amount) } : {}),
      ...(safeText(metadata.provider_currency, 10) ? { provider_currency: safeText(metadata.provider_currency, 10)?.toUpperCase() } : {}),
      ...(safeText(metadata.provider, 30) ? { provider: safeText(metadata.provider, 30) } : {}),
    };
    events.push(event);
  }

  for (const row of creditRows) {
    const metadata = safeMetadata(row.metadata);
    const isAdminGift = row.operation === "admin_grant" || metadata.provider === "admin_grant";
    const audit = isAdminGift ? auditByGrantId.get(String(row.external_id ?? "")) : undefined;
    const actorId = safeText(audit?.actor_user_id, 80);
    const event: HistoryEvent = {
      id: `credit:${safeText(row.id, 80) ?? "unknown"}`,
      type: isAdminGift ? "admin_credit_gift" : "credit_purchase",
      created_at: row.created_at,
      status: safeText(row.status, 40) ?? "unknown",
      credits: Number.isSafeInteger(row.credits) && row.credits > 0 ? row.credits : 0,
      reference: safeReference(row.external_id) ?? safeReference(row.id),
      ...(isAdminGift ? { note: safeText(metadata.reason, 200) } : {}),
      ...(!isAdminGift && safeAmount(metadata.amount_xof) !== undefined ? { amount_xof: safeAmount(metadata.amount_xof) } : {}),
      ...(!isAdminGift && safeAmount(metadata.provider_amount) !== undefined ? { provider_amount: safeAmount(metadata.provider_amount) } : {}),
      ...(!isAdminGift && safeText(metadata.provider_currency, 10) ? { provider_currency: safeText(metadata.provider_currency, 10)?.toUpperCase() } : {}),
      ...(!isAdminGift && safeText(metadata.provider, 30) ? { provider: safeText(metadata.provider, 30) } : {}),
      ...(isAdminGift ? { author: actorId ? profiles.get(actorId) ?? null : null } : {}),
    };
    events.push(event);
  }

  for (const row of subscriptionAuditRows) {
    const metadata = safeMetadata(row.metadata);
    events.push({
      id: `subscription-admin:${safeText(row.id, 80) ?? "unknown"}`,
      type: "subscription_admin_activation",
      created_at: row.created_at,
      status: "active",
      ...(safeText(metadata.plan, 40) ? { plan: safeText(metadata.plan, 40) } : {}),
      reference: safeReference(row.resource_id) ?? safeReference(row.id),
      author: profileForAdminUser.get(String(row.admin_user_id)) ?? null,
    });
  }

  events.sort((a, b) => {
    const timeDelta = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return timeDelta || a.id.localeCompare(b.id);
  });
  const total = (payments.count ?? paymentRows.length) + (credits.count ?? creditRows.length) + (subscriptionAudit.count ?? subscriptionAuditRows.length);
  const available = Math.min(total, (MAX_PAGE + 1) * PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageEvents = events.slice(start, start + PAGE_SIZE);

  return NextResponse.json({
    events: pageEvents,
    page,
    hasMore: start + pageEvents.length < available,
    truncated: total > available,
  });
}
