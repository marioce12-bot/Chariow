import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { DEFAULT_WIZARD_STATE } from "@/components/vendeo/wizard/types";
import { Step2NetworkCreative } from "@/components/vendeo/wizard/Step2NetworkCreative";
import { translate } from "@/lib/i18n/translate";
const settings = vi.hoisted(() => ({ locale: "fr" as "fr" | "en" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: settings.locale, t: (key: string, vars?: Record<string, string | number>) => translate(settings.locale, key, vars) }) }));
const { JSDOM } = require("jsdom");
let dom: any;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; dom?.window.close(); vi.unstubAllGlobals(); settings.locale = "fr"; });
const noop = () => {};

describe("actual ad flow in the landing phone", () => {
  it.each(["fr", "en"] as const)("shows the actual existing ad screen in %s with no invented media or results", locale => {
    settings.locale = locale;
    const html = renderToStaticMarkup(<Step2NetworkCreative previewMode state={DEFAULT_WIZARD_STATE} patch={noop} onFooterChange={noop} onBackToStep1={noop} onAdvanceToStep3={noop} plan="starter" />);
    expect(html).toContain(locale === "fr" ? "Nom de la publicité" : "Ad name");
    expect(html).toContain(locale === "fr" ? "aucun visuel" : "no creative");
    expect(html).not.toContain("ROAS");
  });
  it("never loads accounts, sends a draft or launches a real campaign in preview mode", async () => {
    dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://vendeo-studio.site/" });
    vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    root = createRoot(document.getElementById("root")!);
    await act(async () => root!.render(<Step2NetworkCreative previewMode state={DEFAULT_WIZARD_STATE} patch={noop} onFooterChange={noop} onBackToStep1={noop} onAdvanceToStep3={noop} plan="starter" />));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses a non-interactive real component, responsive frame and reduced-motion support", () => {
    const source = readFileSync("components/HeroPhonePreview.tsx", "utf8");
    const css = readFileSync("app/hero-phone.css", "utf8");
    expect(source).toContain("Step2NetworkCreative");
    expect(source).toContain("previewMode");
    expect(source).toContain("inert");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("hero-connected-workspace.webp");
  });
});
