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
let assistantReplies: string[];
let resolverResult: unknown;
let resolverFails: boolean;
let pendingResources: Promise<unknown> | null;
let pendingInterestResolution: Promise<unknown> | null;
let pagesResult: Array<{ id: string; name: string }>;
let accountsResult: Array<{ id: string; name: string }>;
const payload = { name: "Test uniquement", message: "Texte de test", platform: "meta", objective: "OUTCOME_TRAFFIC", linkUrl: "https://example.com/produit", dailyBudget: 2000, currency: "XOF", callToAction: "SHOP_NOW", storeId: "store-test", productId: "product-test", interests: ["Jazz"] };
const launchReply = () => `Prêt [[LANCE_CAMPAGNE]]${JSON.stringify(payload)}`;
const exactResult = { results: [{ label: "Jazz", selected: { id: "interest-1", name: "Jazz" }, confidence: "exact", suggestions: [] }] };
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
  pagesResult = [{ id: "page-test", name: "Page fictive" }];
  accountsResult = [{ id: "account-test", name: "Compte fictif" }];
  pendingResources = null;
  pendingInterestResolution = null;
  requests = vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/ai/launch-campaign") return new Promise((resolve) => { resolveLaunch = resolve; });
    if (url === "/api/chat") {
      const content = assistantReplies.shift() ?? "Réponse en français";
      return Promise.resolve(ok({ message: { role: "assistant", content }, conversationId: "conversation-test" }));
    }
    if (url === "/api/conversations") return Promise.resolve(ok({ conversations: [] }));
    if (url === "/api/subscription") return Promise.resolve(ok({ subscription: null }));
    if (url.includes("/api/integrations/meta/accounts") || url.includes("/api/integrations/pinterest/accounts")) return Promise.resolve(ok({ accounts: accountsResult }));
    if (url.includes("/api/integrations/meta/resources?")) return pendingResources ?? Promise.resolve(ok({ pages: pagesResult }));
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

const launchCalls = () => requests.mock.calls.filter(([url]) => url === "/api/ai/launch-campaign");
const launchBody = () => JSON.parse(launchCalls()[0][1]!.body as string);
const selectWith = (root: ParentNode, text: string) => [...root.querySelectorAll<HTMLSelectElement>("select")].find((select) => [...select.options].some((option) => option.textContent?.includes(text)))!;
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await flush();
}
async function answerYesToLaunchCard() {
  assistantReplies = ["Confirme-tu que je lance cette campagne ?", launchReply()];
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

  it("lists an unmatched label under « Introuvable chez Meta » with at most 3 suggestions and no preselection", async () => {
    resolverResult = { results: [{ label: "Jazz", selected: null, confidence: null, suggestions: [
      { id: "interest-2", name: "Jazz music" }, { id: "interest-3", name: "Jazz club" }, { id: "interest-4", name: "Jazz piano" }, { id: "interest-5", name: "Jazz guitar" },
    ] }] };
    const dialog = await openDialog();
    expect(dialog.textContent).toContain("Introuvable chez Meta : Jazz");
    expect(dialog.textContent).toContain("Choisir une suggestion");
    expect(dialog.querySelectorAll(".chat-launch-interest-chip")).toHaveLength(0);
    expect(dialog.querySelector('button[aria-label^="Retirer"]')).toBeNull();
    expect(dialog.querySelectorAll(".chat-launch-interest-suggest")).toHaveLength(3);
    expect(dialog.textContent).not.toContain("n’a pas été trouvé");
    const suggestion = [...dialog.querySelectorAll<HTMLButtonElement>(".chat-launch-interest-suggest")].find((button) => button.textContent?.trim() === "Jazz music");
    act(() => suggestion!.click());
    await flush();
    expect(dialog.querySelector('button[aria-label="Retirer Jazz music"]')).toBeTruthy();
    expect(dialog.textContent).not.toContain("Introuvable chez Meta");
    expect(launchCalls()).toHaveLength(0);
    act(() => dialog.querySelector<HTMLButtonElement>(".chat-launch-actions .btn-dark")!.click());
    expect(launchBody().interests).toEqual([{ id: "interest-2", name: "Jazz music" }]);
  });

  it("preselects a close Meta match as a chip and lists it in the collapsed adaptations details", async () => {
    resolverResult = { results: [{ label: "Jazz", selected: { id: "interest-9", name: "Jazz (musique)" }, confidence: "close", suggestions: [] }] };
    const dialog = await openDialog();
    expect(dialog.querySelector('button[aria-label="Retirer Jazz (musique)"]')).toBeTruthy();
    const details = dialog.querySelector<HTMLDetailsElement>("details.chat-launch-interest-details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("1 intérêt(s) adapté(s) à Meta");
    expect(details.textContent).toContain("Jazz → Jazz (musique)");
    act(() => dialog.querySelector<HTMLButtonElement>(".chat-launch-actions .btn-dark")!.click());
    expect(launchBody().interests).toEqual([{ id: "interest-9", name: "Jazz (musique)" }]);
  });

  it("shows resolver failures as a discreet line, never as an alert, and still allows a manual launch", async () => {
    resolverFails = true;
    const dialog = await openDialog();
    const note = [...dialog.querySelectorAll(".chat-launch-interest-muted")].find((node) => node.textContent?.includes("pas pu être vérifiés"));
    expect(note).toBeTruthy();
    expect(note!.getAttribute("role")).toBeNull();
    expect(dialog.querySelector('[role="alert"]')).toBeNull();
    const submit = dialog.querySelector<HTMLButtonElement>(".chat-launch-actions .btn-dark")!;
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    expect(launchCalls()).toHaveLength(1);
    expect(launchBody().interests).toEqual([]);
  });

  it("keeps the interest search behind an « Ajouter » button", async () => {
    const dialog = await openDialog();
    expect(dialog.querySelector('input[type="search"]')).toBeNull();
    const add = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Ajouter un centre d’intérêt"))!;
    act(() => add.click());
    expect(dialog.querySelector('input[type="search"]')).toBeTruthy();
    expect(launchCalls()).toHaveLength(0);
  });

  it("opens the card after a « oui » in the chat without calling the launch endpoint", async () => {
    const dialog = await answerYesToLaunchCard();
    expect(dialog).toBeTruthy();
    await flush();
    expect(launchCalls()).toHaveLength(0);
  });

  it("does not launch when a Facebook page is selected", async () => {
    pagesResult = [{ id: "page-1", name: "Page un" }, { id: "page-2", name: "Page deux" }];
    const dialog = await answerYesToLaunchCard();
    expect(dialog).toBeTruthy();
    await flush();
    const pageSelect = selectWith(dialog!, "Page un");
    await choose(pageSelect, "page-2");
    expect(pageSelect.value).toBe("page-2");
    await flush();
    expect(launchCalls()).toHaveLength(0);
  });

  it("does not launch when the account, the call-to-action button or an interest changes", async () => {
    accountsResult = [{ id: "account-test", name: "Compte fictif" }, { id: "account-2", name: "Compte deux" }];
    const dialog = await answerYesToLaunchCard();
    expect(dialog).toBeTruthy();
    await flush();
    await choose(selectWith(dialog!, "Compte deux"), "account-2");
    await choose(selectWith(dialog!, "Acheter"), "LEARN_MORE");
    const remove = dialog!.querySelector<HTMLButtonElement>('button[aria-label="Retirer Jazz"]');
    if (remove) { act(() => remove.click()); await flush(); }
    expect(launchCalls()).toHaveLength(0);
  });

  it("sends exactly one launch call with interest objects on a single click on « Confirmer et lancer »", async () => {
    const dialog = await openDialog();
    const submit = dialog.querySelector<HTMLButtonElement>(".chat-launch-actions .btn-dark")!;
    expect(submit.textContent).toContain("Confirmer et lancer");
    expect(launchCalls()).toHaveLength(0);
    act(() => submit.click());
    await flush();
    expect(launchCalls()).toHaveLength(1);
    expect(launchBody().interests).toEqual([{ id: "interest-1", name: "Jazz" }]);
  });
});
