import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { searchMetaInterests } from "@/lib/meta/api";
import {
  buildInterestSearchQueries,
  normalizeInterestLabel,
  pickBestMetaInterest,
  rankMetaInterestCandidates,
  type MetaInterestConfidence,
  type MetaInterestTarget,
} from "@/lib/ad-campaigns/meta-targeting";

type InterestOption = Awaited<ReturnType<typeof searchMetaInterests>>[number];

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
  const search = (query: string) => searchLocale
    ? searchMetaInterests(query, accessToken, { locale: searchLocale })
    : searchMetaInterests(query, accessToken);
  const results = await Promise.all(labels.map(async (label) => {
    const merged = new Map<string, InterestOption>();
    const collect = (outcomes: PromiseSettledResult<InterestOption[]>[]) => {
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          failedSearches += 1;
          continue;
        }
        successfulSearches += 1;
        for (const option of outcome.value) {
          if (option && typeof option.id === "string" && !merged.has(option.id)) merged.set(option.id, option);
        }
      }
    };

    // Étape 1 : uniquement le libellé complet. Étape 2 (repli) seulement si l'étape 1
    // ne donne ni correspondance exacte ni correspondance hors précision de Meta.
    collect(await Promise.allSettled([search(label)]));
    let pick = pickBestMetaInterest(label, Array.from(merged.values()));
    if (pick?.confidence !== "exact" && pick?.confidence !== "base") {
      const fallbackQueries = buildInterestSearchQueries(label).slice(1);
      if (fallbackQueries.length) {
        collect(await Promise.allSettled(fallbackQueries.map(search)));
        pick = pickBestMetaInterest(label, Array.from(merged.values()));
      }
    }

    const selected: MetaInterestTarget | null = pick ? { id: pick.interest.id, name: pick.interest.name } : null;
    const confidence: MetaInterestConfidence | null = pick?.confidence ?? null;
    const suggestions = selected
      ? []
      : rankMetaInterestCandidates(label, Array.from(merged.values()), 3);
    return { label, selected, confidence, suggestions };
  }));

  const exactCount = results.filter((result) => result.confidence === "exact").length;
  const adaptedCount = results.filter((result) => result.confidence === "base" || result.confidence === "close").length;
  const suggestedCount = results.filter((result) => result.suggestions.length > 0).length;
  if (failedSearches > 0 || labels.length > 0) {
    console.info("meta_interest_resolve", {
      requested: labels.length,
      exact: exactCount,
      adapted: adaptedCount,
      suggested: suggestedCount,
      failed: failedSearches,
    });
  }

  if (successfulSearches === 0 && failedSearches > 0) {
    return NextResponse.json({ code: "META_INTEREST_SEARCH_FAILED", error: SEARCH_FAILED_MESSAGE }, { status: 502 });
  }
  return NextResponse.json({ results });
}
