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
let resolveResources: ((value: unknown) => void) | null;
let resolveInterests: ((value: unknown) => void) | null;
let requests: ReturnType<typeof vi.fn>;
let assistantReplies: string[];
let resolverResult: unknown;
let resolverFails: boolean;
let pendingResources: Promise<unknown> | null;
let pendingInterestResolution: Promise<unknown> | null;
const payload = { name: "Test uniquement", message: "Texte de test", platform: "meta", objective: "OUTCOME_TRAFFIC", linkUrl: "https://example.com/produit", dailyBudget: 2000, currency: "XOF", callToAction: "SHOP_NOW", storeId: "store-test", productId: "product-test", interests: ["Jazz"] };
const launchReply = () => `Prêt [[LANCE_CAMPAGNE]]${JSON.stringify(payload)}`;
const exactResult = { results: [{ label: "Jazz", exact: { id: "interest-1", name: "Jazz" }, suggestions: [] }] };
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
  assistantReplies = ["Réponse en français"];
  resolverResult = exactResult;
  resolverFails = false;
  pendingResources = null;
  pendingInterestResolution = null;
  resolveResources = null;
  resolveInterests = null;
  requests = vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/ai/launch-campaign") return new Promise((resolve) => { resolveLaunch = resolve; });
    if (url === "/api/chat") {
      const content = assistantReplies.shift() ?? "Réponse en français";
      return Promise.resolve(ok({ message: { role: "assistant", content }, conversationId: "conversation-test" }));
    }
    if (url === "/api/conversations") return Promise.resolve(ok({ conversations: [] }));
    if (url === "/api/subscription") return Promise.resolve(ok({ subscription: null }));
    if (url.includes("/api/integrations/meta/accounts") || url.includes("/api/integrations/pinterest/accounts")) return Promise.resolve(ok({ accounts: [{ id: "account-test", name: "Compte fictif" }] }));
    if (url.includes("/api/integrations/meta/resources?")) return pendingResources ?? Promise.resolve(ok({ pages: [{ id: "page-test", name: "Page fictive" }] }));
    if (url === "/api/integrations/meta/interest-resolve") return resolverFails ? Promise.reject(new Error("Meta indisponible")) : pendingInterestResolution ?? Promise.resolve(ok(resolverResult));
    if (url.startsWith("/api/integrations/meta/interest-search?")) return Promise.resolve(ok({ results: [{ id: "interest-2", name: "Jazz music" }] }));
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

async function renderChat() {
  await act(async () => root.render(<ChatView onGoToSubscription={() => {}} onUsageChange={() => {}} />));
  await flush();
}

async function openDialog(reply = launchReply()) {
  assistantReplies = [reply];
  await renderChat();
  await act(async () => container.querySelector<HTMLButtonElement>(".ai-action-card")!.click());
  await flush();
  const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog).toBeTruthy();
  return dialog!;
}

async function startSubmission() {
  const dialog = await openDialog();
  expect(dialog.querySelector<HTMLInputElement>('input[type="url"]')!.value).toBe(payload.linkUrl);
  const submit = dialog.querySelector<HTMLButtonElement>(".chat-launch-actions .btn-dark")!;
  act(() => { submit.click(); submit.click(); });
  await flush();
  return { dialog, submit };
}

async function sendText(text: string) {
  const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
  const send = container.querySelector<HTMLButtonElement>(".chat-send-button")!;
  expect(send.disabled).toBe(false);
  await act(async () => send.click());
  await flush();
}

async function startExplicitAutoLaunch(replies: string[]) {
  assistantReplies = [...replies];
  await renderChat();
  await act(async () => container.querySelector<HTMLButtonElement>(".ai-action-card")!.click());
  await flush();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await sendText("oui");
  await flush();
  return container.querySelector<HTMLElement>('[role="dialog"]');
}

describe("launch popup submission with mocked network only", () => {
  it("puts the new campaign suggestion first and starts conversation without launching", async () => {
    await renderChat();
    expect(container.textContent).toContain("Que veux-tu faire aujourd'hui ?");
    const suggestion = container.querySelector<HTMLButtonElement>(".ai-action-card");
    expect(suggestion?.textContent).toContain(translate("fr", "chat.launchSuggestion"));
    act(() => suggestion!.click());
    await flush();
    const chatRequests = requests.mock.calls.filter(([url]) => url === "/api/chat");
    expect(chatRequests).toHaveLength(1);
    expect(JSON.parse(chatRequests[0][1]!.body as string).message).toContain("sans la lancer");
    expect(requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign")).toHaveLength(0);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

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

  it("resolves Meta interest objects scoped to the selected account and permits explicit removal", async () => {
    await openDialog();
    const call = requests.mock.calls.find(([url]) => url === "/api/integrations/meta/interest-resolve")!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({ accountId: "account-test", labels: ["Jazz"] });
    expect(container.textContent).toContain("Jazz");
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Retirer Jazz"]');
    expect(remove).toBeTruthy();
    act(() => remove!.click());
    expect(container.textContent).toContain("Aucun filtre supplémentaire");
  });

  it("submits resolved interest objects, not natural-language labels", async () => {
    await startSubmission();
    const body = JSON.parse(requests.mock.calls.find(([url]) => url === "/api/ai/launch-campaign")![1]!.body as string);
    expect(body.interests).toEqual([{ id: "interest-1", name: "Jazz" }]);
  });

  it("does not preselect approximate Meta suggestions, but lets the user explicitly add one", async () => {
    resolverResult = { results: [{ label: "Jazz", exact: null, suggestions: [{ id: "interest-2", name: "Jazz music" }] }] };
    const dialog = await openDialog();
    expect(dialog.textContent).toContain("« Jazz » n’a pas été trouvé");
    expect(dialog.querySelector('button[aria-label="Retirer Jazz music"]')).toBeNull();
    const suggestion = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Jazz music");
    expect(suggestion).toBeTruthy();
    act(() => suggestion!.click());
    await flush();
    expect(dialog.querySelector('button[aria-label="Retirer Jazz music"]')).toBeTruthy();
    const submit = dialog.querySelector<HTMLButtonElement>(".chat-launch-actions .btn-dark")!;
    act(() => submit.click());
    const body = JSON.parse(requests.mock.calls.find(([url]) => url === "/api/ai/launch-campaign")![1]!.body as string);
    expect(body.interests).toEqual([{ id: "interest-2", name: "Jazz music" }]);
  });

  it("shows resolver failures as a soft notice and still allows a manual launch", async () => {
    resolverFails = true;
    const dialog = await openDialog();
    expect(dialog.textContent).toContain("Les centres d’intérêt n’ont pas pu être vérifiés et ne seront pas appliqués");
    expect(dialog.querySelector('[role="alert"]')).toBeNull();
    const submit = dialog.querySelector<HTMLButtonElement>(".chat-launch-actions .btn-dark")!;
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    expect(requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign")).toHaveLength(1);
    const body = JSON.parse(requests.mock.calls.find(([url]) => url === "/api/ai/launch-campaign")![1]!.body as string);
    expect(body.interests).toEqual([]);
  });

  it("waits for Facebook pages and Meta interest resolution before the one automatic launch", async () => {
    pendingResources = new Promise((resolve) => { resolveResources = (value) => resolve(ok(value)); });
    pendingInterestResolution = new Promise((resolve) => { resolveInterests = (value) => resolve(ok(value)); });
    const dialog = await startExplicitAutoLaunch(["Confirme-tu que je lance cette campagne ?", launchReply()]);
    expect(dialog).toBeTruthy();
    expect(requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign")).toHaveLength(0);
    await act(async () => resolveResources!({ pages: [{ id: "page-test", name: "Page fictive" }] }));
    await flush();
    expect(requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign")).toHaveLength(0);
    await act(async () => resolveInterests!(exactResult));
    await flush();
    expect(requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign")).toHaveLength(1);
  });

  it("cancels a pending auto-launch when the confirmation card is closed", async () => {
    pendingResources = new Promise((resolve) => { resolveResources = (value) => resolve(ok(value)); });
    pendingInterestResolution = new Promise((resolve) => { resolveInterests = (value) => resolve(ok(value)); });
    const dialog = await startExplicitAutoLaunch(["Confirme-tu que je lance cette campagne ?", launchReply()]);
    expect(dialog).toBeTruthy();
    act(() => dialog!.querySelector<HTMLButtonElement>(".chat-launch-head button")!.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => resolveResources!({ pages: [{ id: "page-test", name: "Page fictive" }] }));
    await act(async () => resolveInterests!(exactResult));
    await flush();
    expect(requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign")).toHaveLength(0);
  });
});
