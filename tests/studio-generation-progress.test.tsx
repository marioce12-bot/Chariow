// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioView } from "../components/dashboard/sections";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const product = { id: "p1", name: "Sac", image: "https://example.test/sac.jpg" };
const response = (data: unknown, ok = true) => Promise.resolve({ ok, json: async () => data });
function render() { act(() => root.render(<StudioView products={[product]} />)); }
function progress() { return container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"); }
async function clickGenerate() {
  const textarea = container.querySelector<HTMLTextAreaElement>(".studio-prompt-box textarea")!;
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set; setter?.call(textarea, "Créer une image"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
  const button = container.querySelector<HTMLButtonElement>(".studio-generate")!;
  await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
}
function selectProduct() {
  const productButton = container.querySelectorAll<HTMLButtonElement>(".studio-product-list button")[1];
  act(() => productButton.click());
}
beforeEach(() => {
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/studio/image") return response({ imageUrl: "https://example.test/generated.png", generationId: "g1" });
    if (url === "/api/studio/credits") return response({ balance: 42 });
    if (url.startsWith("/api/studio/history")) return response({ items: [], nextCursor: null });
    return response({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("Studio image generation progress", () => {
  it("stays at or below 95 on mount, keeps estimate until image load, then shows 100", async () => {
    render();
    await clickGenerate();
    expect(Number(progress())).toBeLessThanOrEqual(95);
    const image = container.querySelector<HTMLImageElement>(".studio-media")!;
    expect(image).toBeTruthy();
    expect(progress()).toBe("95");
    await act(async () => { image.dispatchEvent(new Event("load")); });
    expect(progress()).toBe("100");
    expect(container.textContent).toContain("100%");
  });

  it("does not show completion after API failure", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url === "/api/studio/image"
      ? response({ error: "API failed" }, false) : original(url, init));
    render(); await clickGenerate();
    expect(progress()).not.toBe("100");
    expect(container.querySelector(".studio-media")).toBeNull();
    expect(container.querySelector(".form-error")?.textContent).toContain("API failed");
  });

  it("resets on a new request and keeps a failed image load below 100", async () => {
    render(); await clickGenerate();
    const image = container.querySelector<HTMLImageElement>(".studio-media")!;
    await act(async () => { image.dispatchEvent(new Event("error")); });
    expect(progress()).not.toBe("100");
    expect(container.textContent).toContain("studio.imageLoadError");
    // A second request begins with a fresh estimate, not stale completion.
    await clickGenerate();
    expect(Number(progress())).toBeLessThanOrEqual(95);
    expect(progress()).not.toBe("100");
  });

  it("sends selected product image nested in product for prompt generation", async () => {
    render();
    selectProduct();
    const insert = container.querySelector<HTMLButtonElement>(".studio-insert-btn")!;
    expect(insert).toBeTruthy();
    fetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.product.image).toBe(product.image);
      expect(payload.productImage).toBeUndefined();
      return response({ prompt: "Photo produit" });
    });
    await act(async () => { insert.click(); });
    expect(fetchMock).toHaveBeenCalledWith("/api/studio/prompt", expect.objectContaining({ method: "POST" }));
  });

  it("sends the selected product visual as a real image reference", async () => {
    render(); selectProduct(); await clickGenerate();
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/studio/image")!;
    expect(JSON.parse(String(call[1]?.body)).referenceUrls).toEqual([product.image]);
  });

  it("shows a fresh estimate while the image API is still pending", async () => {
    let complete: (value: unknown) => void = () => {};
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url === "/api/studio/image"
      ? new Promise(resolve => { complete = resolve; }) : original(url, init));
    render(); await clickGenerate();
    expect(progress()).toBe("3");
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(true);
    await act(async () => { complete({ ok: true, json: async () => ({ imageUrl: "https://example.test/result.png" }) }); });
    expect(progress()).toBe("95");
    await act(async () => { container.querySelector(".studio-media")!.dispatchEvent(new Event("load")); });
    expect(progress()).toBe("100");
  });
});
