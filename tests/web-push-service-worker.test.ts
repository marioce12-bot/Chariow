import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const showNotification = vi.fn(async (_title: string, _options: any) => undefined);
  const focus = vi.fn(async () => undefined);
  const navigate = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const self = { location: { origin: "https://www.vendeo-studio.site" }, addEventListener: (name: string, fn: any) => { handlers[name] = fn; }, registration: { showNotification }, clients: { matchAll: vi.fn(async () => [{ url: "https://www.vendeo-studio.site/dashboard", navigate, focus }]), openWindow }, skipWaiting: vi.fn() };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL, Date, Response, Set });
  return { handlers, showNotification, focus, navigate, openWindow };
}
describe("real web push service worker", () => {
  it("displays a system notification with Vendeo icon and Android badge only for received push", async () => {
    const w = worker();
    expect(w.showNotification).not.toHaveBeenCalled();
    let pending: Promise<unknown> | undefined;
    w.handlers.push({ data: { json: () => ({ title: "Nouvelle info", body: "Texte", url: "/dashboard", tag: "broadcast-1" }) }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(w.showNotification).toHaveBeenCalledWith("Nouvelle info", expect.objectContaining({ body: "Texte", icon: "/icons/icon-192.png", badge: "/icons/notification-badge-96.png", silent: false, tag: "broadcast-1", vibrate: [180, 80, 180] }));
  });
  it("sanitizes external targets and survives malformed payloads", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.handlers.push({ data: { json: () => ({ title: "Vendeo", url: "https://external.invalid/phishing" }) }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(w.showNotification.mock.calls[0][1].data.url).toBe("https://www.vendeo-studio.site/dashboard");
    w.handlers.push({ data: { json: () => { throw new Error("invalid"); } }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(w.showNotification).toHaveBeenLastCalledWith("Vendeo", expect.objectContaining({ body: "Vous avez une nouvelle notification." }));
  });
  it("opens a safe in-app destination when a notification is touched", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    const close = vi.fn();
    w.handlers.notificationclick({ notification: { close, data: { url: "/dashboard" } }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(close).toHaveBeenCalled(); expect(w.navigate).toHaveBeenCalledWith("https://www.vendeo-studio.site/dashboard"); expect(w.focus).toHaveBeenCalled();
  });
});
