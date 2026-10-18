const REGISTER_TIMEOUT_MS = 12_000;
let enrollment: Promise<void> | null = null;

function isSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true &&
    "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function timeout<T>(promise: Promise<T>, ms = REGISTER_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Push registration timed out.")), ms);
    promise.then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error); });
  });
}

function applicationServerKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const result = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) result[index] = bytes.charCodeAt(index);
  return result.buffer;
}

export function ensurePushSubscription(): Promise<void> {
  if (!enrollment) enrollment = enrollDevice().finally(() => { enrollment = null; });
  return enrollment;
}

async function enrollDevice(): Promise<void> {
  if (!isSupported()) throw new Error("Web Push is not supported in this browser.");
  if (Notification.permission !== "granted") throw new Error("Notification permission has not been granted.");
  const registration = await timeout(navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await timeout(navigator.serviceWorker.ready);
  const response = await timeout(fetch("/api/push/subscription", { method: "GET", credentials: "same-origin" }));
  if (!response.ok) throw new Error("Unable to retrieve push configuration.");
  const config = await response.json() as { publicKey?: string };
  if (!config.publicKey) throw new Error("Push configuration is missing its public key.");
  let subscription = await timeout(registration.pushManager.getSubscription());
  if (!subscription) subscription = await timeout(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.publicKey) }));
  const saved = await timeout(fetch("/api/push/subscription", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  }));
  if (!saved.ok) throw new Error("Unable to save push subscription.");
}

export async function disablePushSubscription(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // A late enrollment must not recreate a push binding after logout cleanup.
  if (enrollment) { try { await enrollment; } catch { /* cleanup still proceeds */ } }
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  try {
    await fetch("/api/push/subscription", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) });
  } finally {
    await subscription.unsubscribe();
  }
}
