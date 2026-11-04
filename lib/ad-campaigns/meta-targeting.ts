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
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const resolved: MetaInterestTarget[] = [];
  const missing: string[] = [];
  for (const name of uniqueRequested) {
    const match = available.find((option) => normalized(option.name) === normalized(name));
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
