// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatView } from "@/components/ChatView";
import { translate } from "@/lib/i18n/translate";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string, vars?: Record<string, string | number>) => translate("fr", key, vars) }) }));

let root: Root;
let container: HTMLDivElement;
let resolveLaunch: (value: unknown) => void;
let requests: ReturnType<typeof vi.fn>;
const payload = { name: "Test uniquement", message: "Texte de test", platform: "meta", objective: "OUTCOME_TRAFFIC", linkUrl: "https://example.com/produit", dailyBudget: 2000, currency: "XOF", callToAction: "SHOP_NOW", storeId: "store-test", productId: "product-test" };
const ok = (data: unknown) => ({ ok: true, json: async () => data, text: async () => JSON.stringify(data) });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  requests = vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/ai/launch-campaign") return new Promise((resolve) => { resolveLaunch = resolve; });
    if (url === "/api/chat") return Promise.resolve(ok({ message: { role: "assistant", content: `Prêt [[LANCE_CAMPAGNE]]${JSON.stringify(payload)}` } }));
    if (url === "/api/conversations") return Promise.resolve(ok({ conversations: [] }));
    if (url === "/api/subscription") return Promise.resolve(ok({ subscription: null }));
    if (url.includes("/accounts")) return Promise.resolve(ok({ accounts: [{ id: "account-test", name: "Compte fictif" }] }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", requests);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function startSubmission() {
  await act(async () => root.render(<ChatView onGoToSubscription={() => {}} onUsageChange={() => {}} />));
  await flush();
  await act(async () => container.querySelector<HTMLButtonElement>(".ai-action-card")!.click());
  await flush();
  act(() => container.querySelector<HTMLButtonElement>(".chat-launch-action")!.click());
  const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.querySelector<HTMLInputElement>('input[type="url"]')!.value).toBe(payload.linkUrl);
  const submit = dialog.querySelector<HTMLButtonElement>(".chat-launch-actions .btn-dark")!;
  act(() => { submit.click(); submit.click(); });
  await flush();
  return { dialog, submit };
}

describe("launch popup submission with mocked network only", () => {
  it("animates while waiting, submits once, and reaches 100 only after success", async () => {
    const { dialog } = await startSubmission();
    expect(requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign")).toHaveLength(1);
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    expect(dialog.querySelector<HTMLButtonElement>(".chat-launch-head button")!.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(30_000));
    const percent = Number(dialog.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow"));
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(100);
    await act(async () => resolveLaunch(ok({ dailyBudgetUsd: 4 })));
    expect(dialog.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("100");
    expect(dialog.textContent).toContain("Campagne envoyée");
    await act(async () => vi.advanceTimersByTime(500));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Test uniquement");
    const body = JSON.parse(requests.mock.calls.find(([url]) => url === "/api/ai/launch-campaign")![1]!.body as string);
    expect(body).toMatchObject({ linkUrl: payload.linkUrl, storeId: payload.storeId, productId: payload.productId });
  });
  it("removes progress on failure, shows the error and permits a retry", async () => {
    const { dialog, submit } = await startSubmission();
    await act(async () => resolveLaunch({ ok: false, json: async () => ({ error: "Erreur simulée" }) }));
    expect(dialog.querySelector('[role="progressbar"]')).toBeNull();
    expect(dialog.querySelector('[role="alert"]')!.textContent).toContain("Erreur simulée");
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    expect(requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign")).toHaveLength(2);
    expect(dialog.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("0");
  });
});
