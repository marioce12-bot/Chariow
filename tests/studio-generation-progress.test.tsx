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
    if (url === "/api/studio/tasks" && init?.method === "POST") return response({ task: { id: "task1", kind: "image", status: "completed", result: { imageUrl: "https://example.test/generated.png", generationId: "g1" } } });
    if (url === "/api/studio/tasks") return response({ tasks: [] });
    if (url === "/api/studio/credits") return response({ balance: 42 });
    if (url.startsWith("/api/studio/history")) return response({ items: [], nextCursor: null });
    return response({});
  });
  vi.stubGlobal("fetch", fetchMock);



});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url === "/api/studio/tasks" && init?.method === "POST"
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
    const call = fetchMock.mock.calls.find(([url, init]) => url === "/api/studio/tasks" && init?.method === "POST")!;
    const body = JSON.parse(String(call[1]?.body));
    expect(body.kind).toBe("image");
    expect(body.input.referenceUrls).toEqual([product.image]);
  });

  it("shows a fresh estimate while the image API is still pending", async () => {
    let complete: (value: unknown) => void = () => {};
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url === "/api/studio/tasks" && init?.method === "POST"
      ? new Promise(resolve => { complete = resolve; }) : original(url, init));
    render(); await clickGenerate();
    expect(progress()).toBe("3");
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(true);
    await act(async () => { complete({ ok: true, json: async () => ({ task: { id: "pending", status: "completed", result: { imageUrl: "https://example.test/result.png" } } }) }); });
    expect(progress()).toBe("95");
    await act(async () => { container.querySelector(".studio-media")!.dispatchEvent(new Event("load")); });
    expect(progress()).toBe("100");
  });

  it("restores a processing task after remount and completes it without another POST", async () => {
    let postCount = 0;
    let pollCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/studio/tasks" && init?.method === "POST") { postCount++; return response({ task: { id: "durable", status: "processing" } }); }
      if (url === "/api/studio/tasks" || url.startsWith("/api/studio/tasks?id=")) { if (postCount === 0) return response({ tasks: [] }); pollCount++; return response({ tasks: [{ id: "durable", kind: "image", status: pollCount > 2 ? "completed" : "processing", result: pollCount > 2 ? { imageUrl: "https://example.test/recovered.png", generationId: "g2" } : undefined }] }); }
      if (url.startsWith("/api/studio/history")) return response({ items: [], nextCursor: null });
      return response({ balance: 42 });
    });
    render();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const textarea = container.querySelector<HTMLTextAreaElement>(".studio-prompt-box textarea")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "Créer une image"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { container.querySelector<HTMLButtonElement>(".studio-generate")!.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(postCount).toBe(1);
    act(() => root.unmount());
    root = createRoot(container); render();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(true);
    expect(postCount).toBe(1);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 4_100)); });
    expect(container.querySelector<HTMLImageElement>(".studio-media")?.src).toContain("recovered.png");
    expect(postCount).toBe(1);
  });


  it("shows a tracking outage instead of a frozen estimate, backs off and recovers with GET only", async () => {
    vi.useFakeTimers();
    let polls = 0;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/studio/tasks") return response({ tasks: [{ id: "outage", kind: "image", status: "processing" }] });
      if (url === "/api/studio/tasks?id=outage") {
        polls++;
        if (polls === 1) return response({ error: "Storage 429" }, false);
        return response({ tasks: [{ id: "outage", kind: "image", status: "completed", result: { imageUrl: "https://example.test/restored.png", generationId: "saved" } }] });
      }
      return original(url, init);
    });
    await act(async () => { render(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(container.textContent).toContain("Suivi temporairement indisponible");
    expect(progress()).toBeUndefined();
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(7_999); });
    expect(polls).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(polls).toBe(2);
    expect(container.querySelector<HTMLImageElement>(".studio-media")?.src).toContain("restored.png");
    expect(container.textContent).not.toContain("Suivi temporairement indisponible");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("distinguishes a completed image awaiting a link and retrieves it without regeneration", async () => {
    vi.useFakeTimers();
    let available = false;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const task = { id: "media", kind: "image", status: "completed", mediaPending: !available, result: { generationId: "saved", imageUrl: available ? "https://example.test/ready.png" : null } };
      if (url === "/api/studio/tasks" || url === "/api/studio/tasks?id=media") return response({ tasks: [task] });
      return original(url, init);
    });
    await act(async () => { render(); });
    expect(container.textContent).toContain("Image créée");
    expect(container.textContent).toContain("Récupération de l’image enregistrée");
    expect(progress()).toBeUndefined();
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(container.textContent).toContain("Image créée");
    available = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    const image = container.querySelector<HTMLImageElement>(".studio-media")!;
    expect(image.src).toContain("ready.png");
    expect(progress()).toBe("95");
    await act(async () => { image.dispatchEvent(new Event("load")); });
    expect(progress()).toBe("100");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("does not overlap slow polling requests and cancels an in-flight read on unmount", async () => {
    vi.useFakeTimers();
    let resolveRead: (value: any) => void = () => {};
    let signal: AbortSignal | null | undefined;
    let polls = 0;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/studio/tasks") return response({ tasks: [{ id: "slow", kind: "image", status: "processing" }] });
      if (url === "/api/studio/tasks?id=slow") { polls++; signal = init?.signal; return new Promise(resolve => { resolveRead = resolve; }); }
      return original(url, init);
    });
    await act(async () => { render(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(polls).toBe(1);
    act(() => root.unmount());
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolveRead({ ok: true, json: async () => ({ tasks: [] }) }); });
    root = createRoot(container);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(polls).toBe(1);
  });

  it("treats an isolated task read error as unavailable tracking, not as a failed generation", async () => {
    vi.useFakeTimers();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/studio/tasks") return response({ tasks: [{ id: "isolated", kind: "image", status: "processing" }] });
      if (url === "/api/studio/tasks?id=isolated") return response({ tasks: [{ id: "isolated", kind: "image", status: "tracking_unavailable", trackingUnavailable: true }] });
      return original(url, init);
    });
    await act(async () => { render(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(container.textContent).toContain("Suivi temporairement indisponible");
    expect(container.querySelector(".form-error")).toBeNull();
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(true);
  });

  it("stops polling a deliberately deleted result without claiming it was generated again", async () => {
    vi.useFakeTimers();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/studio/tasks") return response({ tasks: [{ id: "deleted", kind: "image", status: "processing" }] });
      if (url === "/api/studio/tasks?id=deleted") return response({ tasks: [{ id: "deleted", kind: "image", status: "completed", result: null, mediaPending: false }] });
      return original(url, init);
    });
    await act(async () => { render(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(container.textContent).toContain("Cette image n’est plus disponible");
    expect(container.querySelector(".studio-media")).toBeNull();
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(false);
    const reads = fetchMock.mock.calls.filter(([url]) => url.includes("?id=deleted")).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("?id=deleted"))).toHaveLength(reads);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("reports a deleted completed result found on mount instead of silently showing an empty result", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url === "/api/studio/tasks" && !init?.method
      ? response({ tasks: [{ id: "deleted-on-mount", kind: "image", status: "completed", result: null }] }) : original(url, init));
    await act(async () => { render(); });
    expect(container.textContent).toContain("Cette image n’est plus disponible");
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(false);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("reports a completed POST response with no saved image and does not poll or regenerate", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url === "/api/studio/tasks" && init?.method === "POST"
      ? response({ task: { id: "deleted-response", kind: "image", status: "completed", result: null } }) : original(url, init));
    render(); await clickGenerate();
    expect(container.textContent).toContain("Cette image n’est plus disponible");
    expect(progress()).not.toBe("100");
    expect(container.querySelector<HTMLButtonElement>(".studio-generate")?.disabled).toBe(false);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("?id="))).toHaveLength(0);
  });

});
