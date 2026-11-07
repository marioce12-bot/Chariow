import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const REFERRAL_PAGE_SIZE = 500;
const PROFILE_BATCH_SIZE = 250;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

type ReferralRow = {
  referrer_user_id: string;
  referred_user_id: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type ReferralAccount = {
  userId: string;
  email: string | null;
  fullName: string | null;
};

type ReferrerSummary = ReferralAccount & {
  referralCount: number;
  referredAccounts: ReferralAccount[];
};

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error))
    return "unknown";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "unknown";
}

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (!admin) {
    const denied =
      response ??
      NextResponse.json(
        { error: "Accès administrateur requis" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    denied.headers.set("Cache-Control", "private, no-store");
    return denied;
  }

  try {
    const service = createAdminClient();
    const referralRows: ReferralRow[] = [];
    let totalCount: number | null = null;
    let offset = 0;

    while (true) {
      const { data, count, error } = await service
        .from("referrals")
        .select(
          "referrer_user_id,referred_user_id,created_at",
          offset === 0 ? { count: "exact" } : {},
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + REFERRAL_PAGE_SIZE - 1);
      if (error) throw error;
      if (offset === 0) totalCount = typeof count === "number" ? count : null;

      const page = (data ?? []) as ReferralRow[];
      referralRows.push(...page);
      if (
        page.length < REFERRAL_PAGE_SIZE ||
        (totalCount !== null && referralRows.length >= totalCount)
      )
        break;
      offset += REFERRAL_PAGE_SIZE;
    }

    // The referred-user uniqueness constraint makes this a safe completeness check
    // if rows change while a large result is being paged.
    const uniqueRows = Array.from(
      new Map(referralRows.map((row) => [row.referred_user_id, row])).values(),
    );
    if (totalCount !== null && uniqueRows.length !== totalCount) {
      return NextResponse.json(
        { error: "Parrainages temporairement indisponibles" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const profileIds = Array.from(
      new Set(
        uniqueRows.flatMap((row) => [
          row.referrer_user_id,
          row.referred_user_id,
        ]),
      ),
    );
    const profilesById = new Map<string, ProfileRow>();
    for (let start = 0; start < profileIds.length; start += PROFILE_BATCH_SIZE) {
      const ids = profileIds.slice(start, start + PROFILE_BATCH_SIZE);
      const { data, error } = await service
        .from("profiles")
        .select("id,email,full_name")
        .in("id", ids);
      if (error) throw error;
      for (const profile of (data ?? []) as ProfileRow[])
        profilesById.set(profile.id, profile);
    }

    const accountFor = (userId: string): ReferralAccount => {
      const profile = profilesById.get(userId);
      return {
        userId,
        email: profile?.email ?? null,
        fullName: profile?.full_name ?? null,
      };
    };
    const grouped = new Map<string, ReferrerSummary>();
    for (const row of uniqueRows) {
      let referrer = grouped.get(row.referrer_user_id);
      if (!referrer) {
        referrer = {
          ...accountFor(row.referrer_user_id),
          referralCount: 0,
          referredAccounts: [],
        };
        grouped.set(row.referrer_user_id, referrer);
      }
      referrer.referralCount += 1;
      referrer.referredAccounts.push(accountFor(row.referred_user_id));
    }

    const referrers = Array.from(grouped.values()).sort(
      (a, b) =>
        b.referralCount - a.referralCount ||
        (a.fullName ?? a.email ?? a.userId).localeCompare(
          b.fullName ?? b.email ?? b.userId,
        ),
    );

    return NextResponse.json(
      {
        totalReferred: uniqueRows.length,
        referrerCount: referrers.length,
        referrers,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Admin referral data unavailable", {
      code: errorCode(error),
    });
    return NextResponse.json(
      { error: "Parrainages temporairement indisponibles" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
