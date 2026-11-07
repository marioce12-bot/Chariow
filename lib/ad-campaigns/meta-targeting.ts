export type MetaGenderTarget = "male" | "female";

export interface MetaInterestTarget {
  id: string;
  name: string;
}

export interface MetaAudienceTargeting {
  gender: MetaGenderTarget | null;
  interests: MetaInterestTarget[];
}

const MAX_INTERESTS = 10;

/** Normalize labels the same way exact Meta interest matching has historically done. */
export function normalizeInterestLabel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const INTEREST_STOPWORDS = new Set(["de", "des", "du", "la", "le", "les", "l", "d", "et", "au", "aux", "avec", "son", "sa", "ses", "pour", "en", "un", "une"]);

/** Generate the full search phrase followed by up to three useful words. */
export function buildInterestSearchQueries(label: string): string[] {
  if (normalizeInterestLabel(label).length < 2) return [];
  const queries = [label];
  const seen = new Set([normalizeInterestLabel(label)]);
  for (const token of label.split(/[^\p{L}\p{N}]+/u)) {
    const normalizedToken = normalizeInterestLabel(token);
    if (token.length < 4 || normalizedToken.length < 4 || INTEREST_STOPWORDS.has(normalizedToken) || seen.has(normalizedToken)) continue;
    seen.add(normalizedToken);
    queries.push(token);
    if (queries.length === 4) break;
  }
  return queries;
}

/** Retire UN groupe entre parenthèses en fin de nom (précision de Meta). */
export function stripInterestDisambiguation(name: string): string {
  return name.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

type InterestCandidate = { id: string; name: string; audienceSize?: number };

const significantWordsOf = (normalized: string) =>
  new Set(normalized.split(/\s+/).filter((word) => word.length >= 4 && !INTEREST_STOPWORDS.has(word)));

function scoreNormalizedName(normalizedName: string, labelNormalized: string, significantWords: Set<string>): number {
  if (normalizedName === labelNormalized) return 3;
  if (normalizedName.includes(labelNormalized) || labelNormalized.includes(normalizedName)) return 2;
  const candidateWords = significantWordsOf(normalizedName);
  return Array.from(significantWords).some((word) => candidateWords.has(word)) ? 1 : 0;
}

/** Rank Meta candidates by label relevance, audience size, and name. */
export function rankMetaInterestCandidates(
  label: string,
  candidates: InterestCandidate[],
  limit = 5,
): MetaInterestTarget[] {
  const labelNormalized = normalizeInterestLabel(label);
  if (labelNormalized.length < 2) return [];
  const significantWords = significantWordsOf(labelNormalized);
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    if (seen.has(candidate.id)) return [];
    const fullScore = scoreNormalizedName(normalizeInterestLabel(candidate.name), labelNormalized, significantWords);
    const baseNormalized = normalizeInterestLabel(stripInterestDisambiguation(candidate.name));
    const baseScore = baseNormalized ? scoreNormalizedName(baseNormalized, labelNormalized, significantWords) : 0;
    const score = Math.max(fullScore, baseScore);
    if (!score) return [];
    seen.add(candidate.id);
    return [{ candidate: { id: candidate.id, name: candidate.name }, score, audienceSize: candidate.audienceSize ?? 0 }];
  }).sort((a, b) => b.score - a.score || b.audienceSize - a.audienceSize || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, Math.max(0, limit)).map(({ candidate }) => candidate);
}

export type MetaInterestConfidence = "exact" | "base" | "close";

const byAudienceThenShortestThenAlpha = (a: InterestCandidate, b: InterestCandidate) =>
  (b.audienceSize ?? 0) - (a.audienceSize ?? 0) || a.name.length - b.name.length || a.name.localeCompare(b.name);

/** Choisit l'intérêt Meta qui correspond au libellé demandé : égalité exacte,
 * puis égalité hors précision entre parenthèses, puis base contenue en mots
 * entiers. Jamais de simple sous-chaîne, jamais de candidat sans lien de mots. */
export function pickBestMetaInterest(
  label: string,
  candidates: InterestCandidate[],
): { interest: MetaInterestTarget; confidence: MetaInterestConfidence } | null {
  const labelNormalized = normalizeInterestLabel(label);
  if (labelNormalized.length < 2) return null;
  const valid = candidates.filter((candidate) => candidate && typeof candidate.id === "string" && typeof candidate.name === "string");
  const toResult = (candidate: InterestCandidate, confidence: MetaInterestConfidence) => ({
    interest: { id: candidate.id, name: candidate.name },
    confidence,
  });

  const exact = valid.filter((candidate) => normalizeInterestLabel(candidate.name) === labelNormalized).sort(byAudienceThenShortestThenAlpha);
  if (exact.length) return toResult(exact[0], "exact");

  const base = valid.filter((candidate) => normalizeInterestLabel(stripInterestDisambiguation(candidate.name)) === labelNormalized)
    .sort(byAudienceThenShortestThenAlpha);
  if (base.length) return toResult(base[0], "base");

  const paddedLabel = ` ${labelNormalized} `;
  const labelWords = new Set(labelNormalized.split(/\s+/).filter((word) => word.length >= 4));
  const parenthesisOverlap = (name: string) => {
    const group = name.match(/\(([^()]*)\)\s*$/)?.[1] ?? "";
    return normalizeInterestLabel(group).split(/\s+/).some((word) => word.length >= 4 && labelWords.has(word)) ? 1 : 0;
  };
  const close = valid.flatMap((candidate) => {
    const baseNormalized = normalizeInterestLabel(stripInterestDisambiguation(candidate.name));
    if (baseNormalized.length < 5 || !paddedLabel.includes(` ${baseNormalized} `)) return [];
    return [{ candidate, baseLength: baseNormalized.length, overlap: parenthesisOverlap(candidate.name) }];
  }).sort((a, b) => b.baseLength - a.baseLength
    || (b.candidate.audienceSize ?? 0) - (a.candidate.audienceSize ?? 0)
    || b.overlap - a.overlap
    || a.candidate.name.length - b.candidate.name.length
    || a.candidate.name.localeCompare(b.candidate.name));
  return close.length ? toResult(close[0].candidate, "close") : null;
}

/** Accepte uniquement les identifiants d’intérêts renvoyés par Meta et les deux
 * choix de genre exposés par le ciblage publicitaire Meta. Valeurs absentes =
 * aucun filtre de genre ou d’intérêt. */
export function sanitizeMetaTargeting(value: unknown): MetaAudienceTargeting | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const gender = input.gender === "male" || input.gender === "female" ? input.gender : null;
  const seen = new Set<string>();
  const interests = Array.isArray(input.interests)
    ? input.interests.flatMap((item): MetaInterestTarget[] => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const candidate = item as Record<string, unknown>;
        const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
        const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 100) : "";
        if (!/^\d{1,30}$/.test(id) || !name || seen.has(id)) return [];
        seen.add(id);
        return [{ id, name }];
      }).slice(0, MAX_INTERESTS)
    : [];
  return { gender, interests };
}

/** Le chat conserve les libellés en langage naturel. On les convertit en choix
 * Meta exacts avant toute création de campagne; aucun intérêt ambigu n’est
 * sélectionné silencieusement. */
export function resolveExactMetaInterests(
  requested: string[],
  available: MetaInterestTarget[],
): { resolved: MetaInterestTarget[]; missing: string[] } {
  const uniqueRequested = Array.from(new Set(requested.map((name) => name.trim()).filter(Boolean))).slice(0, MAX_INTERESTS);
  const resolved: MetaInterestTarget[] = [];
  const missing: string[] = [];
  for (const name of uniqueRequested) {
    const match = available.find((option) => normalizeInterestLabel(option.name) === normalizeInterestLabel(name));
    if (match) resolved.push(match);
    else missing.push(name);
  }
  return { resolved, missing };
}

/** Convertit les choix UI en champs reconnus dans l’objet targeting de Meta. */
export function buildMetaAudienceFields(value: Partial<MetaAudienceTargeting>): Record<string, unknown> {
  const normalized = sanitizeMetaTargeting(value) ?? { gender: null, interests: [] };
  const targeting: Record<string, unknown> = {};
  if (normalized.gender === "male") targeting.genders = [1];
  if (normalized.gender === "female") targeting.genders = [2];
  if (normalized.interests.length) {
    targeting.flexible_spec = [{ interests: normalized.interests.map(({ id, name }) => ({ id, name })) }];
  }
  return targeting;
}
