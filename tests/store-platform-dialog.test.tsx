import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
const language = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: language.locale }) }));
import { StorePlatformDialog } from "@/components/dashboard/StorePlatformDialog";
const { JSDOM } = require("jsdom");
let root: ReturnType<typeof createRoot> | undefined;
let dom: any;
function setup() {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://vendeo-studio.site/dashboard" });
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.getElementById("root")!);
}
async function render({ full = false, busy = false } = {}) {
  const onChoose = vi.fn();
  await act(async () => root!.render(<StorePlatformDialog full={full} busy={busy} error="" showShopifyForm={false} onChoose={onChoose} onBack={vi.fn()} onClose={vi.fn()}>{null}</StorePlatformDialog>));
  return onChoose;
}
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; dom?.window.close(); vi.unstubAllGlobals(); language.locale = "fr"; });

describe("StorePlatformDialog platform availability", () => {
  it("keeps Chariow selectable while Shopify is visibly disabled with French notice", async () => {
    setup(); const onChoose = await render();
    const chariow = document.querySelector('[aria-label="Chariow"]') as HTMLButtonElement;
    const shopify = document.querySelector('[aria-label="Shopify"]') as HTMLButtonElement;
    expect(chariow.disabled).toBe(false);
    expect(shopify.disabled).toBe(true);
    expect(shopify.className).toContain("store-platform-option-shopify");
    expect(document.querySelector('[role="status"]')?.textContent).toContain("temporairement indisponible");
    await act(async () => { shopify.click(); chariow.click(); });
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("chariow");
  });
  it("shows English temporary-unavailability copy", async () => {
    language.locale = "en"; setup(); await render();
    expect(document.querySelector('[role="status"]')?.textContent).toContain("temporarily unavailable");
    expect((document.querySelector('[aria-label="Shopify"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it("preserves Chariow disabled behavior when busy or full", async () => {
    setup(); await render({ full: true });
    expect((document.querySelector('[aria-label="Chariow"]') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('[aria-label="Shopify"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
