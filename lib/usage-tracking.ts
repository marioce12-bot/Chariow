export const USAGE_SESSION_IDLE_MS = 30 * 60 * 1000;

export type UsageSessionState = { id: string; lastActivityAt: number };

/** Reuse a session only while recent activity remains within the same UTC day. */
export function shouldRotateUsageSession(
  session: UsageSessionState | null,
  now: number,
  idleMs = USAGE_SESSION_IDLE_MS,
): boolean {
  if (!session) return true;
  if (!Number.isFinite(session.lastActivityAt) || now - session.lastActivityAt >= idleMs) return true;
  return new Date(now).toISOString().slice(0, 10) !== new Date(session.lastActivityAt).toISOString().slice(0, 10);
}
