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
