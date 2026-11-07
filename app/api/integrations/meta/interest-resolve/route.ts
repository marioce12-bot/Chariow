import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { searchMetaInterests } from "@/lib/meta/api";
import {
  buildInterestSearchQueries,
  normalizeInterestLabel,
  pickBestMetaInterest,
  rankMetaInterestCandidates,
  type MetaInterestCandidate,
} from "@/lib/ad-campaigns/meta-targeting";

const SEARCH_FAILED_MESSAGE = "Impossible de vérifier les centres d’intérêt auprès de Meta.";

type Confidence = "exact" | "base" | "close";
type InterestPick = { interest: MetaInterestCandidate; confidence: Confidence } | null;

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
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

  const { data: account } = await supabase.from("meta_ad_accounts").select("id,access_token_encrypted")
    .eq("user_id", user.id).eq("is_active", true).eq("id", accountId).maybeSingle();
  if (!account) return NextResponse.json({ code: "META_ACCOUNT_NOT_FOUND" }, { status: 400 });

  const accessToken = decryptSecret(account.access_token_encrypted);
  let successfulSearches = 0;
  let failedSearches = 0;
  const search = async (query: string): Promise<MetaInterestCandidate[]> => {
    try {
      const found = searchLocale
        ? await searchMetaInterests(query, accessToken, { locale: searchLocale })
        : await searchMetaInterests(query, accessToken);
      successfulSearches += 1;
      return found;
    } catch {
      failedSearches += 1;
      return [];
    }
  };
  const results = await Promise.all(labels.map(async (label) => {
    const initial = await search(label);
    const merged = new Map<string, MetaInterestCandidate>();
    for (const candidate of initial) if (candidate && typeof candidate.id === "string" && !merged.has(candidate.id)) merged.set(candidate.id, candidate);
    let picked = pickBestMetaInterest(label, Array.from(merged.values()));
    if (picked?.confidence !== "exact" && picked?.confidence !== "base") {
      const queries = buildInterestSearchQueries(label).slice(1);
      const fallback = await Promise.all(queries.map(search));
      for (const candidates of fallback) for (const candidate of candidates) {
        if (candidate && typeof candidate.id === "string" && !merged.has(candidate.id)) merged.set(candidate.id, candidate);
      }
      picked = pickBestMetaInterest(label, Array.from(merged.values()));
    }
    const selected = picked ? { id: picked.interest.id, name: picked.interest.name } : null;
    const selectedId = selected?.id;
    const confidence = picked?.confidence ?? null;
    const suggestions = selected ? [] : rankMetaInterestCandidates(label, Array.from(merged.values()), 3)
      .filter((item) => item.id !== selectedId).slice(0, 3).map(({ id, name }) => ({ id, name }));
    return { label, selected, confidence, suggestions };
  }));

  const exactCount = results.filter((result) => result.confidence === "exact").length;
  const adaptedCount = results.filter((result) => result.confidence === "base" || result.confidence === "close").length;
  const suggestedCount = results.filter((result) => result.suggestions.length > 0).length;
  if (failedSearches > 0 || labels.length > 0) console.info("meta_interest_resolve", {
    requested: labels.length, exact: exactCount, adapted: adaptedCount, suggested: suggestedCount, failed: failedSearches,
  });

  if (successfulSearches === 0 && failedSearches > 0) {
    return NextResponse.json({ code: "META_INTEREST_SEARCH_FAILED", error: SEARCH_FAILED_MESSAGE }, { status: 502 });
  }
  return NextResponse.json({ results });
}
