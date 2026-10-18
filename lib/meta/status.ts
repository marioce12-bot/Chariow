export const META_PAUSE_REASON_PREFIX = "META_PAUSED:";

export function markMetaPausedReason(reason: string): string {
  return `${META_PAUSE_REASON_PREFIX}${reason}`;
}

export function isMetaPausedReason(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(META_PAUSE_REASON_PREFIX);
}

export function getMetaPausedReason(value: unknown): string | null {
  return isMetaPausedReason(value) ? value.slice(META_PAUSE_REASON_PREFIX.length).trim() : null;
}

/** Classifies lifecycle evidence without treating vague errors as terminal. */
export function getMetaCampaignLifecycle(status: string, externalError: unknown): "archived" | "deleted" | "unavailable" | null {
  const normalized = status.trim().toLowerCase();
  if (["archived", "campaign_archived", "adset_archived", "ad_archived"].includes(normalized)) return "archived";
  if (["deleted", "campaign_deleted", "adset_deleted", "ad_deleted"].includes(normalized)) return "deleted";
  if (typeof externalError !== "string") return null;
  if (externalError.startsWith("META_ARCHIVED:")) return "archived";
  if (externalError.startsWith("META_DELETED:")) return "deleted";
  if (externalError.startsWith("META_UNAVAILABLE:")) return "unavailable";
  // Older rows stored the full Meta sentence unmarked. Deliberately require an
  // affirmative resource-archived/deleted phrase; e.g. "not archived" is not evidence.
  if (/\b(?:(?:is|has been)|est) archived\b/i.test(externalError) || /\b(?:est|a été) archivée?\b/i.test(externalError)) return "archived";
  if (/\b(?:(?:is|has been)|est) deleted\b/i.test(externalError) || /\b(?:est|a été) supprimée?\b/i.test(externalError)) return "deleted";
  return null;
}
