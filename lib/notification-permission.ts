export const getNotificationPromptKey = (userId: string) => `vendeo_notification_prompt_v1:${userId}`;
export type NotificationPromptEligibility = {
  permission: NotificationPermission | null;
  savedChoice: string | null;
  supported: boolean;
  secureContext: boolean;
  isIos: boolean;
  isStandalone: boolean;
};
export function shouldShowNotificationPrompt(input: NotificationPromptEligibility): boolean {
  return input.supported && input.secureContext && input.permission === "default" && !input.savedChoice && (!input.isIos || input.isStandalone);
}
// Fallback only when persistent browser storage is unavailable.
const memoryChoices = new Map<string, string>();
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
function currentChoice(key: string, value: string, readTime: (key: string) => string | null): string | null {
  if (!["deferred", "dismissed", "requested", "unavailable"].includes(value)) return value;
  const time = Number(readTime(`${key}:at`));
  return time > 0 && Date.now() - time >= RETRY_AFTER_MS ? null : value;
}
export function readNotificationPromptChoice(userId: string): string | null {
  const key = getNotificationPromptKey(userId);
  try { const value = localStorage.getItem(key); if (value) return currentChoice(key, value, k => localStorage.getItem(k)); } catch { /* cookie fallback */ }
  try {
    const prefix = `${encodeURIComponent(key)}=`;
    const item = document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith(prefix));
    if (item) return decodeURIComponent(item.slice(prefix.length));
  } catch { /* memory fallback */ }
  return memoryChoices.get(key) ?? null;
}
export function saveNotificationPromptChoice(userId: string, choice: string) {
  const key = getNotificationPromptKey(userId);
  // Persist before opening the browser dialog, even if the page closes meanwhile.
  try { localStorage.setItem(key, choice); localStorage.setItem(`${key}:at`, String(Date.now())); return; } catch { /* cookie fallback */ }
  memoryChoices.set(key, choice);
  try { document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(choice)}; Path=/; Max-Age=31536000; SameSite=Lax${window.isSecureContext ? "; Secure" : ""}`; } catch { /* no persistent storage allowed */ }
}
