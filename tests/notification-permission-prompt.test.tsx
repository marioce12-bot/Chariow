// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { ensurePushSubscription } = vi.hoisted(() => ({ ensurePushSubscription: vi.fn() }));
vi.mock("@/lib/push/browser", () => ({ ensurePushSubscription }));
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));
import { getNotificationPromptKey, shouldShowNotificationPrompt } from "@/lib/notification-permission";

function installNotification(permission: NotificationPermission = "default", request = vi.fn(async () => permission)) {
  class MockNotification {
    static permission = permission;
    static requestPermission = request;
    constructor() {}
  }
  Object.defineProperty(window, "Notification", { configurable: true, value: MockNotification });
  Object.defineProperty(globalThis, "Notification", { configurable: true, value: MockNotification });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
  Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
  Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
  return request;
}

describe("notification permission prompt", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function mount(userId: string) {
    await act(async () => {
      root.render(<NotificationPermissionPrompt userId={userId} />);
    });
  }

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    ensurePushSubscription.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    installNotification();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("uses a user-scoped key and applies the visibility contract", () => {
    expect(getNotificationPromptKey("alice")).toBe("vendeo_notification_prompt_v1:alice");
    const base = { permission: "default" as NotificationPermission, savedChoice: null, supported: true, secureContext: true, isIos: false, isStandalone: false };
    expect(shouldShowNotificationPrompt(base)).toBe(true);
    expect(shouldShowNotificationPrompt({ ...base, supported: false })).toBe(false);
    expect(shouldShowNotificationPrompt({ ...base, secureContext: false })).toBe(false);
    expect(shouldShowNotificationPrompt({ ...base, permission: "granted" })).toBe(false);
    expect(shouldShowNotificationPrompt({ ...base, savedChoice: "deferred" })).toBe(false);
    expect(shouldShowNotificationPrompt({ ...base, isIos: true, isStandalone: false })).toBe(false);
    expect(shouldShowNotificationPrompt({ ...base, isIos: true, isStandalone: true })).toBe(true);
  });

  it("does not request native permission until Activer is clicked", async () => {
    const request = installNotification("default", vi.fn(async () => "granted" as NotificationPermission));
    await mount("user-1");
    expect(request).not.toHaveBeenCalled();
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Activer"));
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(getNotificationPromptKey("user-1"))).toBe("granted");
  });

  it("persists Plus tard and stays hidden after a remount", async () => {
    await mount("user-2");
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Plus tard"));
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); });
    expect(localStorage.getItem(getNotificationPromptKey("user-2"))).toBe("deferred");
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount("user-2");
    expect(container.textContent).not.toContain("Activer");
    expect(container.textContent).not.toContain("Plus tard");
  });

  it.each(["denied", "granted"] as const)("does not prompt again for browser permission %s", async (permission) => {
    installNotification(permission);
    await mount(`permission-${permission}`);
    expect(container.textContent).not.toContain("Activer");
    expect(container.textContent).not.toContain("Plus tard");
    if (permission === "denied") expect(ensurePushSubscription).not.toHaveBeenCalled();
    else {
      expect(ensurePushSubscription).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe("");
    }
  });

  it("reports a registration failure honestly and offers retry without asking permission again", async () => {
    installNotification("granted");
    ensurePushSubscription.mockRejectedValueOnce(new Error("network"));
    await mount("registration-failure");
    expect(container.textContent).toContain("l’inscription aux notifications a échoué");
    expect(container.textContent).not.toContain("Notifications activées sur cet appareil");
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "Réessayer")).toBe(true);
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("persists the requested choice before invoking the browser prompt", async () => {
    let choiceAtRequest: string | null = null;
    const request = vi.fn(async () => {
      choiceAtRequest = localStorage.getItem(getNotificationPromptKey("user-3"));
      return "denied" as NotificationPermission;
    });
    installNotification("default", request);
    await mount("user-3");
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Activer"));
    await act(async () => { button!.click(); });
    expect(choiceAtRequest).toBe("requested");
    expect(localStorage.getItem(getNotificationPromptKey("user-3"))).toBe("denied");
  });

  it("keeps choices independent between users", async () => {
    await mount("alice");
    const later = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Plus tard"));
    await act(async () => { later!.click(); });
    await mount("bob");
    expect(container.textContent).toContain("Activer");
    expect(localStorage.getItem(getNotificationPromptKey("alice"))).toBe("deferred");
    expect(localStorage.getItem(getNotificationPromptKey("bob"))).toBeNull();
  });

  it("can invite an existing account again after seven days, never on each reload", async () => {
    localStorage.setItem(getNotificationPromptKey("existing"), "deferred");
    localStorage.setItem(`${getNotificationPromptKey("existing")}:at`, String(Date.now() - 8 * 86400000));
    await mount("existing");
    expect(container.textContent).toContain("Activer");
  });
  it("respects a native refusal even if a previous deferral has expired", async () => {
    installNotification("denied");
    localStorage.setItem(getNotificationPromptKey("existing-denied"), "deferred");
    localStorage.setItem(`${getNotificationPromptKey("existing-denied")}:at`, String(Date.now() - 8 * 86400000));
    await mount("existing-denied");
    expect(container.textContent).not.toContain("Activer");
  });
  it("silently renders nothing when the API is unsupported", async () => {
    Reflect.deleteProperty(window, "Notification");
    Reflect.deleteProperty(globalThis, "Notification");
    await mount("unsupported");
    expect(container.textContent).toBe("");
  });
});
