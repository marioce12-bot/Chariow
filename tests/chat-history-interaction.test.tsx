// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatView } from "@/components/ChatView";

const localeState = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", async () => {
  const { translate } = await import("@/lib/i18n/translate");
  return { useI18n: () => ({ locale: localeState.locale, setLocale: (locale: string) => { localeState.locale = locale; }, t: (key: string, vars?: Record<string, string | number>) => translate(localeState.locale as "fr" | "en", key, vars) }) };
});
vi.mock("@/components/chat/LaunchProgress", () => ({ LaunchProgress: () => null }));
vi.mock("@/components/LinkifiedText", () => ({ LinkifiedText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock("@/components/AssistantMessageText", () => ({ AssistantMessageText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock("@/lib/media/direct-upload", () => ({ uploadCampaignMedia: vi.fn() }));
vi.mock("@/lib/media/chat-attachment", () => ({ SERVER_UPLOAD_LIMIT: 5_000_000, prepareChatImage: vi.fn() }));

const session = { id: "session-safe-1", title: "Campagne de démonstration", created_at: "2025-01-01T12:00:00.000Z", updated_at: "2025-01-02T12:00:00.000Z" };
const restoredMessages = [
  { id: "m-user", role: "user", content: "Prépare une annonce pour mon produit", attachments: [{ url: "https://assets.invalid/mock-product.png", type: "image", name: "produit-demo.png" }] },
  { id: "m-assistant", role: "assistant", content: "Voici une proposition fictive." },
];
const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function render() {
  await act(async () => { root.render(<ChatView onGoToSubscription={vi.fn()} onUsageChange={vi.fn()} />); });
  await settle();
}
function click(element: HTMLElement) {
  act(() => { element.click(); });
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/conversations") return json({ conversations: [session] });
    if (url === `/api/conversations/${session.id}`) return json({ conversation: session, messages: restoredMessages });
    if (url === "/api/subscription") return json({ subscription: null });
    if (url === "/api/integrations/meta/accounts" || url === "/api/integrations/pinterest/accounts") return json({ accounts: [] });
    throw new Error(`Requête réseau inattendue: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("interaction avec l'historique du chat", () => {
  it("ouvre l'historique, restaure messages et pièce jointe, puis crée un chat local sans requête destructive", async () => {
    await render();
    const historyButton = container.querySelector<HTMLButtonElement>(".chat-history-toggle");
    expect(historyButton).not.toBeNull();
    expect(historyButton?.textContent).toContain("Historique");
    expect(historyButton?.getAttribute("aria-expanded")).toBe("false");
    click(historyButton!);

    const drawer = container.querySelector<HTMLElement>("#chat-history-drawer");
    expect(drawer).not.toBeNull();
    expect(drawer?.getAttribute("role")).toBe("dialog");
    expect(drawer?.getAttribute("aria-modal")).toBe("true");
    expect(container.textContent).toContain(session.title);

    click(Array.from(drawer!.querySelectorAll("button")).find((button) => button.textContent?.includes(session.title))!);
    await settle();
    expect(container.querySelector("#chat-history-drawer")).toBeNull();
    expect(container.textContent).toContain("Prépare une annonce pour mon produit");
    expect(container.textContent).toContain("Voici une proposition fictive.");
    expect(container.querySelector('.chat-attachments img[src="https://assets.invalid/mock-product.png"]')).not.toBeNull();

    click(historyButton!);
    click(container.querySelector<HTMLButtonElement>(".chat-history-new")!);
    expect(container.querySelector("#chat-history-drawer")).toBeNull();
    expect(container.querySelector(".chat-messages")?.textContent).not.toContain("Prépare une annonce pour mon produit");
    const calls = fetchMock.mock.calls;
    expect(calls.some(([, init]) => ["POST", "PUT", "PATCH", "DELETE"].includes(String((init as RequestInit | undefined)?.method ?? "GET").toUpperCase()))).toBe(false);
    expect(calls.some(([url]) => String(url) === "/api/chat" || String(url).includes("/api/conversations/") && String(url) !== `/api/conversations/${session.id}`)).toBe(false);
  });

  it("ferme sur Escape et rend le focus au bouton historique", async () => {
    await render();
    const historyButton = container.querySelector<HTMLButtonElement>(".chat-history-toggle")!;
    click(historyButton);
    expect(container.querySelector("#chat-history-drawer")).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(container.querySelector("#chat-history-drawer")).toBeNull();
    expect(document.activeElement).toBe(historyButton);
  });

  it("garde le focus dans le panneau et ferme au toucher du fond sans modifier les sessions", async () => {
    await render();
    const toggle = container.querySelector<HTMLButtonElement>(".chat-history-toggle")!;
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const buttons = container.querySelectorAll<HTMLButtonElement>(".chat-history-drawer button");
    expect(document.activeElement).toBe(buttons[0]);
    act(() => {
      buttons[buttons.length - 1].focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[0]);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    click(container.querySelector<HTMLElement>(".chat-history-backdrop")!);
    expect(container.querySelector("#chat-history-drawer")).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("affiche l’état vide quand aucune session n’existe", async () => {
    const originalMock = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => String(input) === "/api/conversations" ? json({ conversations: [] }) : originalMock(input, init));
    await render();
    click(container.querySelector<HTMLButtonElement>(".chat-history-toggle")!);
    expect(container.querySelector(".chat-history-empty")?.textContent).toBeTruthy();
    expect(container.querySelectorAll(".chat-history-list li")).toHaveLength(0);
    click(container.querySelector<HTMLButtonElement>(".chat-history-head button")!);
    expect(container.querySelector("#chat-history-drawer")).toBeNull();
  });
});
