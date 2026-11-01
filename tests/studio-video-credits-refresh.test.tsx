// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/i18n";
import { StudioView } from "@/components/dashboard/sections";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const reply = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

const setup = () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return { container, root };
};

const flush = async () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const click = async (target: HTMLButtonElement) => act(async () => {
  target.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const chooseVideo = async (container: HTMLElement) => {
  const choice = container.querySelector<HTMLButtonElement>('article[data-studio-format="video"] button');
  expect(choice).toBeTruthy();
  await click(choice!);
  await flush();
};

const videoButton = (container: HTMLElement) => container.querySelector<HTMLButtonElement>(".studio-generate");
const videoBalanceText = (container: HTMLElement) => container.querySelector(".studio-video-cost-inline")?.textContent ?? "";

function createFetchMock(options: { getBalance: () => number; videoStatus?: number }) {
  const videoStatus = options.videoStatus ?? 200;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/studio/credits") return reply({ balance: options.getBalance(), reserved: 0 });
    if (url === "/api/studio/video") {
      return reply({ ready: videoStatus === 200, locked: videoStatus === 423 }, videoStatus);
    }
    if (url === "/api/account/preferences") return reply({ locale: "fr" });
    if (url === "/api/studio/tasks") return reply({ tasks: [] });
    if (url.startsWith("/api/studio/history")) return reply({ items: [], nextCursor: null });
    return reply({});
  });
}

const render = async (root: Root) => act(async () => {
  root.render(<I18nProvider><StudioView products={[]} /></I18nProvider>);
});

function stubViewport() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(min-width: 1200px)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  stubViewport();
});

describe("studio video credit balance refresh", () => {
  it("unlocks after a simulated recharge is reflected by a fresh balance read", async () => {
    let recharged = false;
    const fetcher = createFetchMock({ getBalance: () => recharged ? 1_200 : 400 });
    vi.stubGlobal("fetch", fetcher);
    const { container, root } = setup();

    try {
      await render(root);
      await flush();
      await chooseVideo(container);

      expect(videoButton(container)?.disabled).toBe(true);
      expect(videoBalanceText(container)).toContain("400");

      // A simulated return from checkout changes only the mocked GET response;
      // the test never submits a recharge or payment request.
      recharged = true;
      await act(async () => { window.dispatchEvent(new Event("focus")); });
      await flush();

      expect(videoBalanceText(container)).toContain("1200");
      expect(videoButton(container)?.disabled).toBe(false);
      expect(fetcher.mock.calls.some(([url, init]) => String(url) === "/api/studio/credits/checkout" || (String(url) === "/api/studio/video" && init?.method === "POST"))).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("refreshes the balance each time the user enters Video mode", async () => {
    let balance = 400;
    const fetcher = createFetchMock({ getBalance: () => balance });
    vi.stubGlobal("fetch", fetcher);
    const { container, root } = setup();

    try {
      await render(root);
      await flush();
      await chooseVideo(container);
      expect(videoButton(container)?.disabled).toBe(true);
      expect(videoBalanceText(container)).toContain("400");

      balance = 1_200;
      const imageChoice = container.querySelector<HTMLButtonElement>('article[data-studio-format="image"] button');
      expect(imageChoice).toBeTruthy();
      await click(imageChoice!);
      await chooseVideo(container);

      expect(videoBalanceText(container)).toContain("1200");
      expect(videoButton(container)?.disabled).toBe(false);
      expect(fetcher.mock.calls.filter(([url]) => String(url) === "/api/studio/credits").length).toBeGreaterThanOrEqual(3);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("shows an explicit loading state and keeps rendering disabled until the balance arrives", async () => {
    let resolveCredits: ((value: ReturnType<typeof reply>) => void) | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/studio/credits") {
        return await new Promise<ReturnType<typeof reply>>((resolve) => { resolveCredits = resolve; });
      }
      if (url === "/api/studio/video") return reply({ ready: true });
      if (url === "/api/account/preferences") return reply({ locale: "fr" });
      if (url === "/api/studio/tasks") return reply({ tasks: [] });
      if (url.startsWith("/api/studio/history")) return reply({ items: [], nextCursor: null });
      return reply({});
    });
    vi.stubGlobal("fetch", fetcher);
    const { container, root } = setup();

    try {
      await render(root);
      const choice = container.querySelector<HTMLButtonElement>('article[data-studio-format="video"] button');
      expect(choice).toBeTruthy();
      await click(choice!);
      await flush();

      expect(videoButton(container)?.disabled).toBe(true);
      expect(videoButton(container)?.textContent).toContain("Vérification du solde");
      expect(container.querySelector('[role="status"]')?.textContent).toContain("Actualisation du solde");

      await act(async () => { resolveCredits?.(reply({ balance: 1_200, reserved: 0 })); });
      await flush();
      expect(videoButton(container)?.disabled).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the server-side Preview lock even when refreshed credits are sufficient", async () => {
    let balance = 1_200;
    const fetcher = createFetchMock({ getBalance: () => balance, videoStatus: 423 });
    vi.stubGlobal("fetch", fetcher);
    const { container, root } = setup();

    try {
      await render(root);
      await flush();
      await chooseVideo(container);

      const button = videoButton(container);
      expect(button?.disabled).toBe(true);
      expect(button?.textContent).toContain("Rendu vidéo verrouillé sur cette Preview");

      balance = 5_000;
      await act(async () => { window.dispatchEvent(new Event("focus")); });
      await flush();

      expect(videoBalanceText(container)).toContain("5000");
      expect(button?.disabled).toBe(true);
      expect(button?.textContent).toContain("Rendu vidéo verrouillé sur cette Preview");
      expect(fetcher.mock.calls.some(([url, init]) => String(url) === "/api/studio/video" && init?.method === "POST")).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
