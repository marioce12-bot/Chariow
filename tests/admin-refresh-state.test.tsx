// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminNotifications } from "@/components/AdminNotifications";

const localeState = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", async () => {
  const { translate } = await import("@/lib/i18n/translate");
  return {
    useI18n: () => ({
      locale: localeState.locale,
      setLocale: (locale: string) => { localeState.locale = locale; },
      t: (key: string, vars?: Record<string, string | number>) =>
        translate(localeState.locale as "fr" | "en", key, vars),
    }),
  };
});

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

async function settle(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function changeNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const view = element.ownerDocument.defaultView!;
  const prototype = element.tagName === "INPUT"
    ? view.HTMLInputElement.prototype
    : view.HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Native value setter unavailable");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new view.Event(element.tagName === "INPUT" ? "input" : "change", { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  localeState.locale = "fr";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/admin/users") {
      const page = url.searchParams.get("page");
      const users = page === "1"
        ? [{ id: "bob-2", full_name: "Bob Two", email: "bob.two@example.test" }]
        : [{ id: "bob-1", full_name: "Bob One", email: "bob.one@example.test" }];
      return json({ users, hasMore: page !== "1", total: 2 });
    }
    return json({ notifications: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("préservation d’état après actualisation admin", () => {
  it("conserve recherche, page et destinataires choisis quand l’historique est actualisé", async () => {
    await act(async () => { root.render(<AdminNotifications totalUsers={2} refreshRevision={0} />); });
    await settle();
    const audience = container.querySelectorAll<HTMLSelectElement>(".admin-notification-form select")[1];
    changeNativeValue(audience, "selected");
    await settle(300);

    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    changeNativeValue(search, "bob");
    await settle(300);
    const firstRecipient = container.querySelector<HTMLInputElement>(".admin-recipient-results input[type=checkbox]")!;
    await act(async () => { firstRecipient.click(); });
    await settle();

    const next = container.querySelector<HTMLButtonElement>(".admin-recipient-pagination button:last-child")!;
    await act(async () => { next.click(); });
    await settle(300);
    const userRequestCount = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/users?")).length;
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("bob");
    expect(container.querySelector(".admin-recipient-chips")?.textContent).toContain("bob.one@example.test");
    expect(container.querySelector<HTMLButtonElement>(".admin-recipient-pagination button:first-child")?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>(".admin-recipient-pagination button:last-child")?.disabled).toBe(true);

    await act(async () => { root.render(<AdminNotifications totalUsers={2} refreshRevision={1} />); });
    await settle();
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("bob");
    expect(container.querySelector(".admin-recipient-chips")?.textContent).toContain("bob.one@example.test");
    expect(container.querySelector<HTMLButtonElement>(".admin-recipient-pagination button:first-child")?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>(".admin-recipient-pagination button:last-child")?.disabled).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/users?")).length).toBe(userRequestCount);
  });
});
