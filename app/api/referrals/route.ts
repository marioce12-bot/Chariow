import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REFERRAL_CREDITS_PER_SIGNUP } from "@/lib/referrals/rules";
import { SITE_URL } from "@/lib/site";

const PAGE_SIZE = 25;
const MAX_PAGE_OFFSET = 100_000;

export async function GET(request: Request) {
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const requestedOffset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(requestedOffset)
    ? Math.min(Math.max(0, requestedOffset), MAX_PAGE_OFFSET)
    : 0;

  try {
    let { data: codeRow, error: codeError } = await admin
      .from("referral_codes")
      .select("code")
      .eq("user_id", user.id)
      .maybeSingle();
    if (codeError) throw codeError;

    if (!codeRow?.code) {
      const { data: generatedCode, error: generateError } = await admin.rpc("ensure_referral_code_for_user", {
        target_user_id: user.id,
      });
      if (generateError) throw generateError;
      const code = typeof generatedCode === "string" ? generatedCode : null;
      if (!code) throw new Error("referral_code_unavailable");
      codeRow = { code };
    }

    const from = offset;
    const to = offset + PAGE_SIZE - 1;
    const [referralResult, rewardResult] = await Promise.all([
      admin
        .from("referrals")
        .select("id,referred_user_id,created_at", { count: "exact" })
        .eq("referrer_user_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, to),
      admin
        .from("referral_subscription_rewards")
        .select("id,milestone_count,created_at,activated_at,starts_on,ends_on")
        .eq("referrer_user_id", user.id)
        .order("milestone_count", { ascending: true })
        .limit(1000),
    ]);
    if (referralResult.error) throw referralResult.error;
    if (rewardResult.error) throw rewardResult.error;

    const referralRows = referralResult.data ?? [];
    const referredIds = referralRows.map((row) => row.referred_user_id);
    const profilesById = new Map<string, string>();
    if (referredIds.length) {
      const { data: profiles, error: profileError } = await admin
        .from("profiles")
        .select("id,full_name")
        .in("id", referredIds);
      if (profileError) throw profileError;
      for (const profile of profiles ?? []) {
        const firstName = typeof profile.full_name === "string" ? profile.full_name.trim().split(/\s+/)[0] : "";
        if (firstName) profilesById.set(profile.id, firstName.slice(0, 60));
      }
    }

    const rewards = (rewardResult.data ?? []).map((reward) => ({
      id: reward.id,
      milestoneCount: reward.milestone_count,
      createdAt: reward.created_at,
      activatedAt: reward.activated_at,
      startsOn: reward.starts_on,
      endsOn: reward.ends_on,
    }));
    const totalReferrals = referralResult.count ?? referralRows.length;
    const referralLink = new URL(`/register?ref=${encodeURIComponent(codeRow.code)}`, SITE_URL).toString();

    return NextResponse.json({
      referralLink,
      totalReferrals,
      referralCredits: totalReferrals * REFERRAL_CREDITS_PER_SIGNUP,
      completedMilestones: Math.floor(totalReferrals / 25),
      referrals: referralRows.map((row, index) => ({
        id: row.id,
        displayName: profilesById.get(row.referred_user_id) ?? null,
        createdAt: row.created_at,
        number: offset + index + 1,
      })),
      nextOffset: offset + referralRows.length,
      hasMore: offset + referralRows.length < totalReferrals,
      rewards,
    });
  } catch (error) {
    console.error("referral dashboard load failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Impossible de charger les informations de parrainage." }, { status: 500 });
  }
}
