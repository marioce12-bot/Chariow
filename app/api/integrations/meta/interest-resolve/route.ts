import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { searchMetaInterests } from "@/lib/meta/api";
import {
  buildInterestSearchQueries,
  normalizeInterestLabel,
  rankMetaInterestCandidates,
  resolveExactMetaInterests,
  type MetaInterestTarget,
} from "@/lib/ad-campaigns/meta-targeting";

const SEARCH_FAILED_MESSAGE = "Impossible de vérifier les centres d’intérêt auprès de Meta.";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const accountId = typeof input.accountId === "string" ? input.accountId.trim() : "";
  if (!accountId) return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });

  const labels: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(input.labels)) {
    for (const item of input.labels) {
      if (typeof item !== "string") continue;
      const label = item.trim().slice(0, 100);
      if (label.length < 2) continue;
      const normalized = normalizeInterestLabel(label);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      labels.push(label);
      if (labels.length === 10) break;
    }
  }
  const searchLocale = input.locale === "fr_FR" ? "fr_FR" : undefined;

  const { data: account } = await supabase
    .from("meta_ad_accounts")
    .select("id,access_token_encrypted")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return NextResponse.json({ code: "META_ACCOUNT_NOT_FOUND" }, { status: 400 });

  const accessToken = decryptSecret(account.access_token_encrypted);
  let successfulSearches = 0;
  let failedSearches = 0;
  const results = await Promise.all(labels.map(async (label) => {
    const queries = buildInterestSearchQueries(label);
    const searches = await Promise.allSettled(queries.map((query) => searchLocale
      ? searchMetaInterests(query, accessToken, { locale: searchLocale })
      : searchMetaInterests(query, accessToken)));
    const merged = new Map<string, MetaInterestTarget>();
    for (const search of searches) {
      if (search.status === "rejected") {
        failedSearches += 1;
        continue;
      }
      successfulSearches += 1;
      for (const option of search.value) {
        if (option && typeof option.id === "string" && !merged.has(option.id)) merged.set(option.id, option);
      }
    }
    const candidates = Array.from(merged.values());
    const exact = resolveExactMetaInterests([label], candidates).resolved[0] ?? null;
    const suggestions = exact ? [] : rankMetaInterestCandidates(label, candidates, 5);
    return { label, exact, suggestions };
  }));

  const exactCount = results.filter((result) => result.exact !== null).length;
  const suggestedCount = results.filter((result) => result.suggestions.length > 0).length;
  if (failedSearches > 0 || labels.length > 0) {
    console.info("meta_interest_resolve", {
      requested: labels.length,
      exact: exactCount,
      suggested: suggestedCount,
      failed: failedSearches,
    });
  }

  if (successfulSearches === 0 && failedSearches > 0) {
    return NextResponse.json({ code: "META_INTEREST_SEARCH_FAILED", error: SEARCH_FAILED_MESSAGE }, { status: 502 });
  }
  return NextResponse.json({ results });
}
