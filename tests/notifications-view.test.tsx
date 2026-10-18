// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({
    locale: "fr",
    t: (key: string) => ({
      "notifications.back": "Retour",
      "notifications.markAll": "Tout marquer comme lu",
      "notifications.loading": "Chargement…",
      "notifications.empty": "Aucune notification",
      "notifications.open": "Ouvrir",
    }[key] ?? key),
  }),
}));

const notifications = [
  { id: "unread-id", type: "system", title: "Notification non lue", body: "À lire", action_url: null, read_at: null, created_at: "2025-01-10T10:00:00Z" },
  { id: "read-id", type: "admin", title: "Notification déjà lue", body: "Déjà consultée", action_url: null, read_at: "2025-01-09T10:00:00Z", created_at: "2025-01-09T10:00:00Z" },
];

let root: Root;
let container: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;

async function renderAndLoad() {
  const { NotificationsView } = await import("@/components/NotificationsView");
  await act(async () => {
    root.render(React.createElement(NotificationsView, { onBack: vi.fn() }));
  });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({ notifications }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("NotificationsView", () => {
  it("renders notification titles, read statuses, and distinct card classes", async () => {
    await renderAndLoad();

    expect(container.textContent).toContain("Notification non lue");
    expect(container.textContent).toContain("Notification déjà lue");
    const list = container.querySelector('[aria-label="Liste des notifications"]');
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll("span")).toHaveLength(2);
    expect(Array.from(list!.querySelectorAll("span")).map((span) => span.textContent?.trim())).toEqual(["Non lue", "Lue"]);
    expect(list!.querySelector(".notifications-page-item.unread")?.textContent).toContain("Notification non lue");
    expect(list!.querySelector(".notifications-page-item.read")?.textContent).toContain("Notification déjà lue");
  });

  it("marks an unread button card as read and PATCHes its id", async () => {
    await renderAndLoad();
    const unreadCard = container.querySelector<HTMLButtonElement>("button.notifications-page-item.unread");
    expect(unreadCard).not.toBeNull();

    await act(async () => {
      unreadCard!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ id: "unread-id" }),
    }));
    expect(container.querySelector(".notifications-page-item.unread")).toBeNull();
    expect(container.querySelector(".notifications-page-item.read")?.textContent).toContain("Notification non lue");
  });

  it("PATCHes all=true when the mark-all button is clicked", async () => {
    await renderAndLoad();
    const markAll = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Tout marquer comme lu"));
    expect(markAll).toBeDefined();

    await act(async () => {
      markAll!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ all: true }),
    }));
  });
});
