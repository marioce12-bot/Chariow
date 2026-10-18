// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminNotifications } from "@/components/AdminNotifications";
import { AdminFeedbackSection } from "@/components/FeedbackView";

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

const json = (body: unknown, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
} as Response);
const feedback = [{ id: "fb-1", rating: 4, message: "Excellent produit", status: "new", created_at: "2025-01-02T00:00:00.000Z", author_name: "Camille" }];
const notifications = [{ id: "n-1", title: "Mise à jour", body: "Nouvelle fonctionnalité", created_at: "2025-01-02T00:00:00.000Z", profiles: { full_name: "Camille" } }];
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
async function settle(ms = 0) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}
async function render(node: React.ReactNode) {
  await act(async () => { root.render(node); });
  await settle();
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localeState.locale = "fr";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/admin/feedback") return json({ feedback });
    if (url === "/api/admin/notifications") return json({ notifications });
    if (url === "/api/admin/users?q=&page=0") return json({ users: [], hasMore: false, total: 0 });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function chooseUsers() {
  const select = container.querySelector<HTMLSelectElement>('select')!;
  act(() => {
    select.value = "selected";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("chargement des sections admin côté client", () => {
  it("affiche feedback et notifications chargés", async () => {
    await render(<AdminFeedbackSection />);
    expect(container.textContent).toContain("Camille");
    expect(container.textContent).toContain("Excellent produit");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/feedback", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));

    await render(<AdminNotifications totalUsers={10} />);
    expect(container.textContent).toContain("Mise à jour");
    expect(container.textContent).toContain("Nouvelle fonctionnalité");
  });

  it("présente une erreur de session en français et réessaie le feedback", async () => {
    fetchMock.mockImplementationOnce(() => json({}, 401)).mockImplementationOnce(() => json({ feedback }));
    await render(<AdminFeedbackSection />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("session administrateur");
    await act(async () => { container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(); });
    await settle();
    expect(container.textContent).toContain("Excellent produit");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("signale l'erreur d'historique des notifications et réessaie", async () => {
    fetchMock.mockImplementationOnce(() => json({}, 503)).mockImplementationOnce(() => json({ notifications }));
    await render(<AdminNotifications totalUsers={10} />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Impossible de charger");
    await act(async () => { container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(); });
    await settle();
    expect(container.textContent).toContain("Mise à jour");
  });

  it("termine l'état de chargement au timeout d'une lecture qui ne répond jamais", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    await act(async () => { root.render(<AdminFeedbackSection />); });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement");
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("trop de temps");
  });

  it("débounce la recherche de destinataires et encode la query", async () => {
    vi.useFakeTimers();
    await act(async () => { root.render(<AdminNotifications totalUsers={10} />); });
    await act(async () => { container.querySelector<HTMLSelectElement>("select")!.value = "selected"; container.querySelector("select")!.dispatchEvent(new Event("change", { bubbles: true })); });
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "a b&c");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/admin/users"))).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users?q=a%20b%26c&page=0", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("annule la requête de recherche obsolète quand la query change", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: Response) => void;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/users?q=old")) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
      if (url.includes("/api/admin/users?q=new")) return json({ users: [{ id: "new", full_name: "New User", email: "new@example.test" }], hasMore: false, total: 1 });
      if (url === "/api/admin/notifications") return json({ notifications: [] });
      return json({});
    });
    await act(async () => { root.render(<AdminNotifications totalUsers={10} />); });
    await act(async () => { const select = container.querySelector<HTMLSelectElement>("select")!; select.value = "selected"; select.dispatchEvent(new Event("change", { bubbles: true })); await vi.advanceTimersByTimeAsync(250); });
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const set = (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => { set("old"); await vi.advanceTimersByTimeAsync(250); });
    const oldCall = fetchMock.mock.calls.find(([url]) => String(url).includes("q=old"));
    expect(oldCall).toBeDefined();
    const oldSignal = (oldCall![1] as RequestInit).signal as AbortSignal;
    await act(async () => { set("new"); await vi.advanceTimersByTimeAsync(250); });
    expect(oldSignal.aborted).toBe(true);
    expect(container.textContent).toContain("New User");
    await act(async () => { resolveFirst(await json({ users: [{ id: "old", full_name: "Old User", email: "old@example.test" }], hasMore: false, total: 1 })); });
    expect(container.textContent).toContain("New User");
    expect(container.textContent).not.toContain("Old User");
  });

  it("localise les erreurs timeout en anglais", async () => {
    localeState.locale = "en";
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    await act(async () => { root.render(<AdminFeedbackSection />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("The request took too long");
  });

  it("actualise les retours sans perdre le brouillon de réponse", async () => {
    await render(<AdminFeedbackSection refreshRevision={0} />);
    await act(async () => { container.querySelector<HTMLButtonElement>('article > button')!.click(); });
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Brouillon conservé');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await render(<AdminFeedbackSection refreshRevision={1} />);
    expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Brouillon conservé');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/admin/feedback')).toHaveLength(2);
  });

  it("ne transforme pas une réponse malformée en faux historique vide", async () => {
    fetchMock.mockImplementation(() => json({ unexpected: [] }));
    await render(<AdminNotifications totalUsers={10} />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger');
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
