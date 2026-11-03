// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/i18n";
import { StudioView } from "@/components/dashboard/sections";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const products = [
  {
    id: "ebook-excel",
    name: "Guide Excel Facile",
    description: "Guide numérique pour apprendre Excel avec des exercices.",
    image: "https://cdn.chariow.com/cover-excel.png",
    images: ["https://cdn.chariow.com/cover-excel.png"],
    category: "Éducation",
    type: "ebook",
    tags: ["Excel", "guide"],
    shop: "Kora",
  },
  {
    id: "soap-karite",
    name: "Savon Karité Kora",
    description: "Savon au karité fabriqué artisanalement.",
    image: "https://cdn.chariow.com/savon-karite.jpg",
    images: ["https://cdn.chariow.com/savon-karite.jpg"],
    category: "Beauté",
    type: "physical",
    tags: ["savon", "karité"],
    shop: "Kora",
  },
];

const reply = (data: unknown, ok = true) => ({ ok, json: async () => data });
const setup = () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return { container, root };
};
const render = async (root: Root) => act(async () => {
  root.render(<I18nProvider><StudioView products={products} /></I18nProvider>);
});
const button = (container: HTMLElement, predicate: (element: HTMLButtonElement) => boolean) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(predicate);
const click = async (target: HTMLButtonElement) => act(async () => { target.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });

describe("Studio UGC prompt generation UI", () => {
  beforeEach(() => {
    localStorage.clear();
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
  });

  it.each([
    { status: 200, readiness: { ready: true, callback: true }, expectedLabel: "Créer la vidéo" },
    { status: 423, readiness: { ready: false, locked: true }, expectedLabel: "Rendu vidéo verrouillé sur cette Preview" },
  ])("uses the server render gate status $status without starting a video job", async ({ status, readiness, expectedLabel }) => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/studio/video") return { ok: status === 200, status, json: async () => readiness };
      if (url === "/api/account/preferences") return reply({ locale: "fr" });
      if (url === "/api/studio/tasks") return reply({ tasks: [] });
      if (url.startsWith("/api/studio/history")) return reply({ items: [], nextCursor: null });
      if (url === "/api/studio/credits") return reply({ balance: 2_000, reserved: 0 });
      return reply({});
    });
    vi.stubGlobal("fetch", fetcher);
    const { container, root } = setup();

    try {
      await render(root);
      const videoChoice = container.querySelector<HTMLButtonElement>('article[data-studio-format="video"] button');
      expect(videoChoice).toBeTruthy();
      await click(videoChoice!);
      const generateButton = container.querySelector<HTMLButtonElement>(".studio-generate");

      expect(generateButton?.textContent).toContain(expectedLabel);
      expect(fetcher.mock.calls.some(([url, options]) => String(url) === "/api/studio/video" && options?.method === "POST")).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("requires the fal.ai callback only for 10/15 seconds and preserves the 25-second path", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/studio/video") return { ok: true, status: 200, json: async () => ({ ready: true, callback: false }) };
      if (url === "/api/account/preferences") return reply({ locale: "fr" });
      if (url === "/api/studio/tasks") return reply({ tasks: [] });
      if (url.startsWith("/api/studio/history")) return reply({ items: [], nextCursor: null });
      if (url === "/api/studio/credits") return reply({ balance: 2_000, reserved: 0 });
      return reply({});
    });
    vi.stubGlobal("fetch", fetcher);
    const { container, root } = setup();
    try {
      await render(root);
      const videoChoice = container.querySelector<HTMLButtonElement>('article[data-studio-format="video"] button');
      await click(videoChoice!);
      const generateButton = container.querySelector<HTMLButtonElement>(".studio-generate");
      expect(generateButton?.disabled).toBe(true);
      expect(generateButton?.textContent).toContain("Callback fal.ai requis pour 10/15 s");
      const durationSelect = [...container.querySelectorAll<HTMLSelectElement>("select")].find(select => [...select.options].map(option => option.value).join(",") === "10,15,25");
      expect(durationSelect).toBeTruthy();
      await act(async () => {
        durationSelect!.value = "25";
        durationSelect!.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(generateButton?.disabled).toBe(false);
      expect(generateButton?.textContent).toContain("Créer la vidéo");
      expect(fetcher.mock.calls.some(([url, options]) => String(url) === "/api/studio/video" && options?.method === "POST")).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("shows only product-specific AI responses for selected products, with no generic seed or character-profile control", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/studio/prompt" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        const name = payload.product.name as string;
        const prompt = name === "Guide Excel Facile"
          ? "HOOK: Ouvre Guide Excel Facile sur son téléphone. SCÈNE: coin lecture; accessoires: couverture réelle et téléphone. SCRIPT: je consulte un exercice. CTA: retrouve le guide dans la boutique."
          : "HOOK: Savon Karité Kora posé près du lavabo. SCÈNE: salle de bain; accessoires: savon et serviette. SCRIPT: je découvre sa texture. CTA: découvre Savon Karité Kora dans la boutique.";
        return reply({ prompt, preparedUgc: `prepared:${name}`, locked: true, contentLanguage: { code: "fr", label: "French" }, plan: { segments: [] } });
      }
      if (url === "/api/account/preferences") return reply({ locale: "fr" });
      if (url === "/api/studio/tasks") return reply({ tasks: [] });
      if (url.startsWith("/api/studio/history")) return reply({ items: [], nextCursor: null });
      if (url === "/api/studio/credits") return reply({ balance: 0, reserved: 0 });
      return reply({});
    });
    vi.stubGlobal("fetch", fetcher);
    const { container, root } = setup();

    try {
      await render(root);
      const videoChoice = container.querySelector<HTMLButtonElement>('article[data-studio-format="video"] button');
      expect(videoChoice).toBeTruthy();
      await click(videoChoice!);

      const promptField = container.querySelector<HTMLTextAreaElement>("#studio-photo-panel textarea");
      expect(promptField).toBeTruthy();
      expect(promptField!.value).toBe("");
      expect(container.textContent).not.toContain("Mise en scène UGC naturelle et dynamique");
      expect(container.textContent).not.toContain("Profil souhaité");
      expect(container.querySelector('input[placeholder*="entrepreneuse"]')).toBeNull();

      const generatePrompt = () => button(container, (element) => element.textContent?.includes("Générer le prompt") ?? false);
      await click(generatePrompt()!);
      expect(promptField!.value).toContain("Guide Excel Facile");
      expect(promptField!.value).toContain("couverture réelle et téléphone");
      expect(promptField!.value).toContain("CTA: retrouve le guide");

      const soapProduct = button(container, (element) => element.closest(".studio-product-list") !== null && element.textContent?.includes("Savon Karité Kora") === true);
      expect(soapProduct).toBeTruthy();
      await click(soapProduct!);
      await click(generatePrompt()!);
      expect(promptField!.value).toContain("Savon Karité Kora");
      expect(promptField!.value).toContain("salle de bain");
      expect(promptField!.value).toContain("savon et serviette");
      expect(promptField!.value).toContain("CTA: découvre Savon Karité Kora");

      const promptPosts = fetcher.mock.calls.filter(([url, options]) => String(url) === "/api/studio/prompt" && options?.method === "POST");
      expect(promptPosts).toHaveLength(2);
      const firstRequest = JSON.parse(String(promptPosts[0][1]?.body));
      const secondRequest = JSON.parse(String(promptPosts[1][1]?.body));
      expect(firstRequest).toMatchObject({ mediaType: "video", videoStyle: "ugc", duration: 10, aspectRatio: "9:16", product: { name: "Guide Excel Facile", image: "https://cdn.chariow.com/cover-excel.png" } });
      expect([...container.querySelectorAll("select")].some(select => [...select.options].map(option => option.value).join(",") === "10,15,25")).toBe(true);
      expect(firstRequest.ugcOptions).not.toHaveProperty("characterProfile");
      expect(secondRequest).toMatchObject({ mediaType: "video", videoStyle: "ugc", product: { name: "Savon Karité Kora" }, previousPrompt: promptPosts[0] ? expect.any(String) : undefined });
      expect(secondRequest.ugcOptions).not.toHaveProperty("characterProfile");
      expect(fetcher.mock.calls.some(([url, options]) => String(url) === "/api/studio/video" && options?.method === "POST")).toBe(false);
      expect(fetcher.mock.calls.some(([url, options]) => String(url) === "/api/studio/tasks" && options?.method === "POST")).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("shows a safe preparation failure, blocks rendering, then succeeds on explicit retry", async () => {
    let fail = true;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/studio/prompt" && init?.method === "POST") return fail
        ? { ok: false, status: 502, json: async () => ({ code: "ugc_prompt_generation_failed", error: "Le scénario n’a pas pu être généré, réessaie.", failureRule: "provider" }) }
        : reply({ prompt: "0–3s | Accroche Guide Excel Facile. DIALOGUE EXACT: «Bonjour.»", preparedUgc: "prepared:retry", locked: true, contentLanguage: { code: "fr", label: "French" }, plan: { segments: [] } });
      if (url === "/api/studio/video") return { ok: true, status: 200, json: async () => ({ ready: true, callback: true }) };
      if (url === "/api/account/preferences") return reply({ locale: "fr" });
      if (url === "/api/studio/tasks") return reply({ tasks: [] });
      if (url.startsWith("/api/studio/history")) return reply({ items: [], nextCursor: null });
      if (url === "/api/studio/credits") return reply({ balance: 2_000, reserved: 0 });
      return reply({});
    });
    vi.stubGlobal("fetch", fetcher);
    const { container, root } = setup();
    try {
      await render(root);
      await click(container.querySelector<HTMLButtonElement>('article[data-studio-format="video"] button')!);
      const promptField = container.querySelector<HTMLTextAreaElement>("#studio-photo-panel textarea")!;
      const create = () => button(container, el => el.textContent?.includes("Créer la vidéo") ?? false);
      await click(button(container, el => el.textContent?.includes("Générer le prompt") ?? false)!);
      expect(container.textContent).toContain("Le scénario n’a pas pu être généré, réessaie.");
      expect(button(container, el => el.textContent?.includes("Régénérer") ?? false)).toBeTruthy();
      expect(create()?.disabled).toBe(true);
      expect(fetcher.mock.calls.some(([url, options]) => ["/api/studio/video", "/api/studio/tasks"].includes(String(url)) && options?.method === "POST")).toBe(false);
      fail = false;
      await click(button(container, el => el.textContent?.includes("Régénérer") ?? false)!);
      expect(promptField.value).toContain("Guide Excel Facile");
      expect(promptField.value).toContain("DIALOGUE EXACT");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
