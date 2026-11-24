import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidOfferEmail,
  normalizeSuppressionEmail,
  readTransactionalSuppressionList,
  sendCreditOfferConfirmation,
} from "@/lib/transactional-credit-offer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAGE_SIZE = 500;
const FIRST_BATCH_SIZE = 200;
const MAX_RECIPIENTS_PER_INVOCATION = 3;
const CREDIT_CAMPAIGN_ID = "vendeo-november-2026-100-credits";
const TRIAL_CAMPAIGN_ID = "vendeo-trial-extension-3d-2026-11";
const CREDIT_CONFIRMATION = "CONFIRM_VENDEO_NOVEMBER_CREDIT_OFFER";
const TRIAL_CONFIRMATION = "CONFIRM_VENDEO_THREE_DAY_TRIAL_EXTENSION";
const DISPATCH_TABLE = "transactional_credit_offer_recipients";

type Profile = { id: string; email: string | null; created_at: string };
type Subscription = {
  user_id: string;
  status: string;
  trial_active: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
};
type Dispatch = {
  user_id: string;
  email: string;
  account_created_at: string;
  batch_name: "first" | "remainder";
  grant_id: string;
  credit_status: "pending" | "granted" | "failed";
  email_status: "pending" | "attempting" | "accepted" | "rejected" | "unknown" | "suppressed";
  email_attempted_at: string | null;
};

type AudienceCounts = {
  total_profiles: number;
  accounts_with_email: number;
  invalid_email_accounts: number;
  transactionally_suppressed_accounts: number;
  duplicate_email_accounts_excluded: number;
  paid_or_ambiguous_accounts_excluded: number;
  eligible_accounts: number;
  first_batch_count: number;
  remainder_count: number;
};
type TrialCounts = {
  expired_trial_accounts_eligible: number;
  active_paid_accounts_excluded: number;
  ambiguous_expired_trial_records_excluded: number;
};
type PreflightResult =
  | { ok: false; error: string }
  | { ok: true; suppressionCount: number; audience: Profile[]; counts: AudienceCounts; trials: Subscription[]; trialCounts: TrialCounts; dispatches: Dispatch[] };

function isValidCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

async function readProfiles(service: ReturnType<typeof createAdminClient>) {
  const rows: Profile[] = [];
  for (let offset = 0; offset < 50_000; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from("profiles")
      .select("id,email,created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows: [], error };
    const page = (data ?? []) as Profile[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, error: null };
  }
  return { rows: [], error: new Error("profile_read_limit") };
}

async function readSubscriptions(service: ReturnType<typeof createAdminClient>) {
  const rows: Subscription[] = [];
  for (let offset = 0; offset < 50_000; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from("subscriptions")
      .select("user_id,status,trial_active,trial_ends_at,current_period_end")
      .order("user_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows: [], error };
    const page = (data ?? []) as Subscription[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, error: null };
  }
  return { rows: [], error: new Error("subscription_read_limit") };
}

async function readDispatches(service: ReturnType<typeof createAdminClient>) {
  const rows: Dispatch[] = [];
  for (let offset = 0; offset < 50_000; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from(DISPATCH_TABLE)
      .select("user_id,email,account_created_at,batch_name,grant_id,credit_status,email_status,email_attempted_at")
      .eq("campaign_id", CREDIT_CAMPAIGN_ID)
      .order("account_created_at", { ascending: true })
      .order("user_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows: [], error };
    const page = (data ?? []) as Dispatch[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, error: null };
  }
  return { rows: [], error: new Error("dispatch_read_limit") };
}

function buildAudience(profiles: Profile[], blockedEmails: Set<string>, subscriptions: Subscription[], now: Date) {
  const withEmail = profiles.filter((profile) => typeof profile.email === "string" && profile.email.trim() !== "");
  const valid = withEmail.filter((profile) => isValidOfferEmail(profile.email ?? ""));
  const invalidEmailAccounts = withEmail.length - valid.length;
  const suppressed = valid.filter((profile) => blockedEmails.has(normalizeSuppressionEmail(profile.email ?? "")));
  // Exclude paid active accounts and the ambiguous past-due non-trial state.
  // This is a read-only audience rule; the credits path never changes trials.
  const excludedAccountIds = new Set(subscriptions.filter((row) =>
    (row.status === "active" && row.trial_active !== true)
    || (row.status === "past_due" && row.trial_active === false && row.trial_ends_at !== null
      && (!Number.isFinite(new Date(row.trial_ends_at).getTime()) || new Date(row.trial_ends_at).getTime() < now.getTime())),
  ).map((row) => row.user_id));

  const emailCounts = new Map<string, number>();
  for (const profile of valid) {
    const email = normalizeSuppressionEmail(profile.email ?? "");
    emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }
  const duplicateEmails = new Set([...emailCounts].filter(([, count]) => count > 1).map(([email]) => email));
  const duplicateEmailAccounts = valid.filter((profile) => duplicateEmails.has(normalizeSuppressionEmail(profile.email ?? "")));
  const eligible = valid.filter((profile) =>
    !blockedEmails.has(normalizeSuppressionEmail(profile.email ?? ""))
    && !duplicateEmails.has(normalizeSuppressionEmail(profile.email ?? ""))
    && !excludedAccountIds.has(profile.id),
  );

  return {
    eligible,
    counts: {
      total_profiles: profiles.length,
      accounts_with_email: withEmail.length,
      invalid_email_accounts: invalidEmailAccounts,
      transactionally_suppressed_accounts: suppressed.length,
      duplicate_email_accounts_excluded: duplicateEmailAccounts.length,
      paid_or_ambiguous_accounts_excluded: valid.filter((profile) => excludedAccountIds.has(profile.id)).length,
      eligible_accounts: eligible.length,
      first_batch_count: Math.min(FIRST_BATCH_SIZE, eligible.length),
      remainder_count: Math.max(0, eligible.length - FIRST_BATCH_SIZE),
    },
  };
}

function summarizeTrials(rows: Subscription[], now: Date) {
  const activePaidIds = new Set(rows
    .filter((row) => row.status === "active" && row.trial_active === false && row.current_period_end !== null && row.current_period_end >= now.toISOString().slice(0, 10))
    .map((row) => row.user_id));
  const expiredTrialRows = rows.filter((row) =>
    row.status === "past_due"
    && row.trial_active === true
    && typeof row.trial_ends_at === "string"
    && new Date(row.trial_ends_at).getTime() < now.getTime()
    && !activePaidIds.has(row.user_id),
  );
  const ambiguousRows = rows.filter((row) =>
    row.status === "past_due"
    && row.trial_active === false
    && typeof row.trial_ends_at === "string"
    && new Date(row.trial_ends_at).getTime() < now.getTime(),
  );
  return {
    eligible_expired_trials: expiredTrialRows,
    counts: {
      expired_trial_accounts_eligible: expiredTrialRows.length,
      active_paid_accounts_excluded: activePaidIds.size,
      ambiguous_expired_trial_records_excluded: ambiguousRows.length,
    },
  };
}

function blockedListUnavailable(code: string) {
  return NextResponse.json({
    error: "Impossible de vérifier complètement les blocages transactionnels Brevo; aucune audience n’est présentée et aucun traitement ne peut démarrer.",
    code,
  }, { status: 503 });
}

async function getPreflight(service: ReturnType<typeof createAdminClient>): Promise<PreflightResult> {
  const suppression = await readTransactionalSuppressionList();
  if (!suppression.ok) return { ok: false, error: suppression.code };
  const [profilesResult, subscriptionsResult, dispatchesResult] = await Promise.all([
    readProfiles(service),
    readSubscriptions(service),
    readDispatches(service),
  ]);
  if (profilesResult.error || subscriptionsResult.error || dispatchesResult.error) {
    return { ok: false, error: "audience_read_failed" };
  }
  const now = new Date();
  const audience = buildAudience(profilesResult.rows, suppression.blockedEmails, subscriptionsResult.rows, now);
  const trials = summarizeTrials(subscriptionsResult.rows, now);
  const stored = dispatchesResult.rows;
  return {
    ok: true,
    suppressionCount: suppression.count,
    audience: audience.eligible,
    counts: audience.counts,
    trials: trials.eligible_expired_trials,
    trialCounts: trials.counts,
    dispatches: stored,
  };
}

function countDispatchStatuses(rows: Dispatch[]) {
  return {
    assigned: rows.length,
    credits_granted: rows.filter((row) => row.credit_status === "granted").length,
    credit_pending_or_failed: rows.filter((row) => row.credit_status !== "granted").length,
    emails_accepted: rows.filter((row) => row.email_status === "accepted").length,
    emails_rejected: rows.filter((row) => row.email_status === "rejected").length,
    emails_unknown: rows.filter((row) => row.email_status === "unknown" || row.email_status === "attempting").length,
    emails_suppressed: rows.filter((row) => row.email_status === "suppressed").length,
  };
}

export async function GET() {
  const { admin, response } = await requireAdmin(["super_admin"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès super administrateur requis" }, { status: 403 });
  const service = createAdminClient();
  const result = await getPreflight(service);
  if (!result.ok) {
    if (result.error.startsWith("brevo_")) return blockedListUnavailable(result.error);
    console.error("Credit offer preflight failed", { code: result.error });
    return NextResponse.json({ error: "Prévisualisation indisponible." }, { status: 500 });
  }
  const firstBatch = result.dispatches.filter((row) => row.batch_name === "first");
  const remainder = result.dispatches.filter((row) => row.batch_name === "remainder");
  return NextResponse.json({
    campaign_id: CREDIT_CAMPAIGN_ID,
    selection_rule: "created_at croissant, puis id croissant; comptes payants actifs, essais ambigus, adresses invalides, doublons et blocages transactionnels Brevo exclus",
    sender_scope: "Liste transactionnelle complète sans filtre d’expéditeur; toute adresse bloquée est exclue par précaution",
    counts: result.counts,
    trials: result.trialCounts,
    already_assigned: {
      first_batch: countDispatchStatuses(firstBatch),
      remainder: countDispatchStatuses(remainder),
    },
    approval_required: true,
    email_copy: {
      subject: "Confirmation : 100 crédits ajoutés à votre compte Vendeo",
      body: "Bonjour,\n\nPour clôturer novembre en beauté, 100 crédits gratuits ont été ajoutés à votre compte Vendeo. Vous pouvez les utiliser dès maintenant dans le Studio.\n\nÀ bientôt,\nL’équipe Vendeo.",
    },
  });
}

export async function POST(request: Request) {
  const { admin, response } = await requireAdmin(["super_admin"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès super administrateur requis" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  const service = createAdminClient();
  const preflight = await getPreflight(service);
  if (!preflight.ok) {
    if (preflight.error.startsWith("brevo_")) return blockedListUnavailable(preflight.error);
    console.error("Credit offer preflight failed", { code: preflight.error });
    return NextResponse.json({ error: "Prévalidation indisponible; aucune modification effectuée." }, { status: 500 });
  }

  if (body.action === "credits") {
    if (body.confirmation !== CREDIT_CONFIRMATION) return NextResponse.json({ error: "Confirmation explicite requise." }, { status: 400 });
    if (body.batch !== "first" && body.batch !== "remainder") return NextResponse.json({ error: "Lot invalide." }, { status: 400 });
    if (!isValidCount(body.expectedEligibleCount) || !isValidCount(body.expectedBatchCount)) {
      return NextResponse.json({ error: "Les effectifs approuvés doivent être fournis." }, { status: 400 });
    }
    if (body.expectedEligibleCount !== preflight.counts.eligible_accounts) {
      return NextResponse.json({ error: "L’audience a changé depuis l’approbation; aucun traitement effectué.", current_counts: preflight.counts }, { status: 409 });
    }

    const existing = preflight.dispatches;
    const firstRows = existing.filter((row) => row.batch_name === "first");
    const currentBatchRows = existing.filter((row) => row.batch_name === body.batch);
    let selected: Dispatch[] = currentBatchRows;

    if (body.batch === "first") {
      const expectedCount = preflight.counts.first_batch_count;
      if (preflight.counts.eligible_accounts < FIRST_BATCH_SIZE || expectedCount !== FIRST_BATCH_SIZE) {
        return NextResponse.json({ error: "Le premier lot ne peut démarrer que si au moins 200 destinataires sont admissibles.", total: 0, remaining: 0 }, { status: 409 });
      }
      if (body.expectedBatchCount !== expectedCount) return NextResponse.json({ error: "L’effectif du premier lot ne correspond plus; aucun traitement effectué.", current_counts: preflight.counts }, { status: 409 });
      if (currentBatchRows.length > 0 && currentBatchRows.length !== expectedCount) {
        return NextResponse.json({ error: "Le premier lot est déjà partiellement figé; aucune substitution automatique n’est sûre." }, { status: 409 });
      }
      if (currentBatchRows.length === 0) {
        if (existing.length !== 0) return NextResponse.json({ error: "La campagne contient déjà des affectations incohérentes; aucun octroi commencé." }, { status: 409 });
        const assignedIds = new Set(existing.map((row) => row.user_id));
        const accounts = preflight.audience.filter((profile) => !assignedIds.has(profile.id)).slice(0, expectedCount);
        if (accounts.length !== expectedCount) return NextResponse.json({ error: "Le premier lot ne peut pas être figé au nombre approuvé." }, { status: 409 });
        const rows = accounts.map((profile) => ({
          campaign_id: CREDIT_CAMPAIGN_ID,
          user_id: profile.id,
          email: profile.email!,
          account_created_at: profile.created_at,
          batch_name: "first" as const,
          grant_id: `${CREDIT_CAMPAIGN_ID}:100:${profile.id}`,
        }));
        const { error } = await service.from(DISPATCH_TABLE).upsert(rows, { onConflict: "campaign_id,user_id", ignoreDuplicates: true });
        if (error) {
          console.error("Credit offer batch assignment failed", { code: error.code ?? "database_error" });
          return NextResponse.json({ error: "Impossible de figer le premier lot; aucun octroi n’a commencé." }, { status: 500 });
        }
        const refreshed = await readDispatches(service);
        if (refreshed.error) return NextResponse.json({ error: "Impossible de relire le lot figé; aucun octroi n’a commencé." }, { status: 500 });
        selected = refreshed.rows.filter((row) => row.batch_name === "first");
        if (selected.length !== expectedCount) return NextResponse.json({ error: "Le lot figé ne correspond pas au nombre approuvé; aucun octroi n’a commencé." }, { status: 409 });
      }
    } else {
      const expectedCount = Math.max(0, preflight.counts.eligible_accounts - firstRows.length);
      if (firstRows.length !== preflight.counts.first_batch_count) {
        return NextResponse.json({ error: "Le premier lot n’est pas figé au complet; le lot restant est bloqué." }, { status: 409 });
      }
      if (body.expectedBatchCount !== expectedCount) return NextResponse.json({ error: "L’effectif restant ne correspond plus; aucun traitement effectué.", current_counts: { ...preflight.counts, remainder_available: expectedCount } }, { status: 409 });
      if (currentBatchRows.length > 0 && currentBatchRows.length !== expectedCount) {
        return NextResponse.json({ error: "Le lot restant est déjà partiellement figé; aucune substitution automatique n’est sûre." }, { status: 409 });
      }
      if (currentBatchRows.length === 0 && expectedCount > 0) {
        const assignedIds = new Set(existing.map((row) => row.user_id));
        const accounts = preflight.audience.filter((profile) => !assignedIds.has(profile.id));
        if (accounts.length !== expectedCount) return NextResponse.json({ error: "Le lot restant ne peut pas être figé au nombre approuvé." }, { status: 409 });
        const rows = accounts.map((profile) => ({
          campaign_id: CREDIT_CAMPAIGN_ID,
          user_id: profile.id,
          email: profile.email!,
          account_created_at: profile.created_at,
          batch_name: "remainder" as const,
          grant_id: `${CREDIT_CAMPAIGN_ID}:100:${profile.id}`,
        }));
        const { error } = await service.from(DISPATCH_TABLE).upsert(rows, { onConflict: "campaign_id,user_id", ignoreDuplicates: true });
        if (error) {
          console.error("Credit offer remainder assignment failed", { code: error.code ?? "database_error" });
          return NextResponse.json({ error: "Impossible de figer le lot restant; aucun octroi n’a commencé." }, { status: 500 });
        }
        const refreshed = await readDispatches(service);
        if (refreshed.error) return NextResponse.json({ error: "Impossible de relire le lot restant; aucun octroi n’a commencé." }, { status: 500 });
        selected = refreshed.rows.filter((row) => row.batch_name === "remainder");
        if (selected.length !== expectedCount) return NextResponse.json({ error: "Le lot restant figé ne correspond pas au nombre approuvé; aucun octroi n’a commencé." }, { status: 409 });
      }
    }

    const currentProfiles = new Map(preflight.audience.map((profile) => [profile.id, profile]));
    const total = selected.length;
    // Reprises manuelles uniquement pour un travail encore pending. Tous les états
    // d’email tentés (accepted/rejected/unknown/attempting) restent non-rejouables.
    const pending = selected.filter((row) => row.email_status === "pending" && row.email_attempted_at === null
      && (row.credit_status === "pending" || row.credit_status === "granted"));
    const segment = pending.slice(0, MAX_RECIPIENTS_PER_INVOCATION);
    const grantedIds = new Set<string>();
    let creditFailures = 0;
    let emailsAccepted = 0;
    let emailRejected = 0;
    let emailUnknown = 0;
    let emailSuppressed = 0;
    let emailAlreadyAttempted = 0;

    for (const recipient of segment) {
      const normalized = normalizeSuppressionEmail(recipient.email);
      const currentProfile = currentProfiles.get(recipient.user_id);
      if (!currentProfile || currentProfile.email !== recipient.email) {
        await service.from(DISPATCH_TABLE).update({ email_status: "suppressed", last_error_code: "recipient_no_longer_eligible", updated_at: new Date().toISOString() })
          .eq("campaign_id", CREDIT_CAMPAIGN_ID).eq("user_id", recipient.user_id).eq("email_status", "pending").is("email_attempted_at", null);
        emailSuppressed += 1;
        continue;
      }
      // The current audience list already excludes every transactionally blocked address.
      // Keep this explicit equality guard in case data is changed between reads.
      if (!isValidOfferEmail(recipient.email) || !normalized) {
        await service.from(DISPATCH_TABLE).update({ email_status: "suppressed", last_error_code: "invalid_frozen_email", updated_at: new Date().toISOString() })
          .eq("campaign_id", CREDIT_CAMPAIGN_ID).eq("user_id", recipient.user_id).eq("email_status", "pending").is("email_attempted_at", null);
        emailSuppressed += 1;
        continue;
      }

      if (recipient.credit_status !== "granted") {
      const { data: creditResult, error: creditError } = await service.rpc("admin_grant_credits", {
        target_user_id: recipient.user_id,
        amount: 100,
        grant_id: recipient.grant_id,
        reason: "Offre de clôture de novembre 2026",
      });
      const creditPayload = creditResult as { ok?: boolean; duplicate?: boolean } | null;
      if (creditError || !creditPayload?.ok) {
        creditFailures += 1;
        await service.from(DISPATCH_TABLE).update({ credit_status: "failed", last_error_code: creditError?.code ?? "credit_grant_failed", updated_at: new Date().toISOString() })
          .eq("campaign_id", CREDIT_CAMPAIGN_ID).eq("user_id", recipient.user_id);
        continue;
      }

      const grantedAt = new Date().toISOString();
      const { error: markCreditError } = await service.from(DISPATCH_TABLE)
        .update({ credit_status: "granted", credit_granted_at: grantedAt, last_error_code: null, updated_at: grantedAt })
        .eq("campaign_id", CREDIT_CAMPAIGN_ID).eq("user_id", recipient.user_id);
      if (markCreditError) {
        // Retry is safe: the stable RPC grant_id prevents a second credit.
        creditFailures += 1;
        continue;
      }
      }
      grantedIds.add(recipient.user_id);

      const { data: claim, error: claimError } = await service.from(DISPATCH_TABLE)
        .update({ email_status: "attempting", email_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("campaign_id", CREDIT_CAMPAIGN_ID)
        .eq("user_id", recipient.user_id)
        .eq("credit_status", "granted")
        .is("email_attempted_at", null)
        .select("user_id")
        .maybeSingle();
      if (claimError || !claim) {
        emailAlreadyAttempted += 1;
        continue;
      }

      // Individual notification, only after the idempotent credit RPC succeeded.
      const mail = await sendCreditOfferConfirmation(recipient.email);
      const mailAt = new Date().toISOString();
      const update = {
        email_status: mail.status,
        email_accepted_at: mail.status === "accepted" ? mailAt : null,
        email_message_id: mail.status === "accepted" ? mail.messageId : null,
        last_error_code: mail.status === "accepted" ? null : mail.code,
        updated_at: mailAt,
      };
      const { error: markEmailError } = await service.from(DISPATCH_TABLE).update(update)
        .eq("campaign_id", CREDIT_CAMPAIGN_ID).eq("user_id", recipient.user_id);
      if (markEmailError || mail.status === "unknown") emailUnknown += 1;
      else if (mail.status === "accepted") emailsAccepted += 1;
      else emailRejected += 1;
    }

    const refreshedDispatches = await readDispatches(service);
    const refreshedBatch = refreshedDispatches.error ? selected : refreshedDispatches.rows.filter((row) => row.batch_name === body.batch);
    const remaining = refreshedBatch.filter((row) => row.email_status === "pending" && row.email_attempted_at === null && row.credit_status !== "failed").length;

    return NextResponse.json({
      ok: true,
      action: "credits",
      batch: body.batch,
      assigned: total,
      processed_this_invocation: segment.length,
      total,
      remaining,
      credit_grants_succeeded_this_run: grantedIds.size,
      credit_grants_failed_or_state_update_failed: creditFailures,
      transactional_emails_accepted_this_run: emailsAccepted,
      transactional_emails_rejected: emailRejected,
      transactional_emails_unknown: emailUnknown,
      suppressed_before_grant: emailSuppressed,
      email_attempts_not_repeated: emailAlreadyAttempted,
      grant_idempotency: "stable per campaign and user",
      email_retry_policy: "at-most-once; ambiguous outcomes are never retried automatically",
    });
  }

  if (body.action === "trials") {
    if (body.confirmation !== TRIAL_CONFIRMATION || !isValidCount(body.expectedTrialCount)) {
      return NextResponse.json({ error: "Confirmation explicite et effectif approuvé requis." }, { status: 400 });
    }
    if (body.expectedTrialCount !== preflight.trialCounts.expired_trial_accounts_eligible) {
      return NextResponse.json({ error: "Le nombre d’essais admissibles a changé; aucune modification effectuée.", current_counts: preflight.trialCounts }, { status: 409 });
    }
    let extended = 0;
    let duplicates = 0;
    let ineligible = 0;
    let failures = 0;
    for (const subscription of preflight.trials) {
      const { data, error } = await service.rpc("admin_extend_expired_trial_three_days", { target_user_id: subscription.user_id });
      if (error) {
        failures += 1;
        continue;
      }
      const result = data as { ok?: boolean; duplicate?: boolean; eligible?: boolean } | null;
      if (!result?.ok && result?.eligible === false) ineligible += 1;
      else if (!result?.ok) failures += 1;
      else if (result.duplicate) duplicates += 1;
      else extended += 1;
    }
    return NextResponse.json({
      ok: failures === 0 && ineligible === 0,
      action: "trials",
      eligible_count: preflight.trials.length,
      extended_this_run: extended,
      already_extended: duplicates,
      no_longer_eligible: ineligible,
      failures,
      idempotency: "campaign and user are recorded once; original trial end is preserved in the audit table",
    });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
