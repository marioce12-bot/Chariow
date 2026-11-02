"use client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const PENDING_KEY = "vendeo_meta_registration_pending";
const SENT_KEY_PREFIX = "vendeo_meta_registration_sent:";

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function trackCompleteRegistration(registrationId: string) {
  const storage = getStorage();
  if (!storage || typeof window.fbq !== "function") return false;

  const sentKey = `${SENT_KEY_PREFIX}${registrationId}`;
  if (storage.getItem(sentKey) === "1") return true;

  window.fbq("track", "CompleteRegistration", { content_name: "signup", status: true });
  storage.setItem(sentKey, "1");
  if (storage.getItem(PENDING_KEY) === registrationId) storage.removeItem(PENDING_KEY);
  return true;
}

export function trackSuccessfulRegistration() {
  const storage = getStorage();
  if (!storage) return;

  const registrationId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage.setItem(PENDING_KEY, registrationId);
  trackCompleteRegistration(registrationId);
}

export function trackPendingRegistration() {
  const storage = getStorage();
  const registrationId = storage?.getItem(PENDING_KEY);
  if (registrationId) trackCompleteRegistration(registrationId);
}
