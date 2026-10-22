// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VideoDownloadButton from "@/components/studio/VideoDownloadButton";

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const blob = new Blob(["video"], { type: "video/mp4" });
async function render() {
  await act(async () => { root.render(<VideoDownloadButton url="https://media.test/video" filename="demo" />); });
}
async function click() {
  await act(async () => { container.querySelector("button")!.click(); });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => blob });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn() });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-video");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
describe("VideoDownloadButton", () => {
  it("downloads the fetched blob using a local mp4 link", async () => {
    await render(); await click();
    expect(fetchMock).toHaveBeenCalledWith("https://media.test/video");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
  it("shares a supported iOS file and treats cancellation silently", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    vi.stubGlobal("navigator", Object.create(navigator, {
      userAgent: { configurable: true, value: "iPhone" },
      canShare: { configurable: true, value: () => true }, share: { configurable: true, value: share },
    }));
    await render(); await click();
    expect(share).toHaveBeenCalledOnce();
    expect(share.mock.calls[0][0].files[0].name).toBe("demo.mp4");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("downloads directly on Android even when file sharing is available", async () => {
    const share = vi.fn();
    vi.stubGlobal("navigator", Object.create(navigator, {
      userAgent: { configurable: true, value: "Android Chrome" },
      platform: { configurable: true, value: "Linux armv8l" },
      maxTouchPoints: { configurable: true, value: 5 },
      canShare: { configurable: true, value: () => true }, share: { configurable: true, value: share },
    }));
    await render(); await click();
    expect(share).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });
  it.each(["http", "network"])("shows an error and never creates a remote fallback for %s failure", async (failure) => {
    fetchMock.mockImplementationOnce(failure === "http"
      ? async () => ({ ok: false, status: 500 })
      : async () => { throw new TypeError("offline"); });
    await render(); await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Réessayez");
    expect(container.querySelector("a")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("disables and guards against duplicate clicks while loading", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await render();
    await act(async () => { container.querySelector("button")!.click(); });
    expect(container.querySelector("button")!.disabled).toBe(true);
    await click(); expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => { resolve({ ok: true, status: 200, blob: async () => blob }); });
    expect(container.querySelector("button")!.disabled).toBe(false);
  });
  it("revokes the temporary object URL after 30 seconds", async () => {
    vi.useFakeTimers(); await render(); await click();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-video");
  });
});
