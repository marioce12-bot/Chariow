import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MetaAccountSkeleton } from "./MetaAccountSkeleton";
import { I18nProvider } from "@/lib/i18n/i18n";
vi.mock("@/lib/i18n/i18n", async (importOriginal) => { const actual = await importOriginal<typeof import("@/lib/i18n/i18n")>(); const { translate } = await import("@/lib/i18n/translate"); return { ...actual, useI18n: () => ({ locale: "fr", setLocale: () => {}, t: (key: string, vars?: Record<string, string | number>) => translate("fr", key, vars) }) }; });
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options: { url: string }) => any };
let dom: any;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  dom?.window.close();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { HTMLElement?: unknown }).HTMLElement;
});

describe("MetaAccountSkeleton", () => {
  it("renders only the accessible account-content placeholder with five KPIs, chart, activity and pixel rows", () => {
    dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
    const container = dom.window.document.getElementById("root");
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    act(() => root!.render(createElement(I18nProvider, null, createElement(MetaAccountSkeleton))));

    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-label")).toBe("Chargement des données du compte Meta");
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(status?.querySelectorAll(":scope > .mas-kpis > .mas-kpi").length).toBe(5);
    expect(status?.querySelectorAll(":scope > .mas-activity svg").length).toBe(1);
    expect(status?.querySelectorAll(":scope > .mas-pixels .mas-pixel-row").length).toBe(3);
    expect(status?.querySelectorAll(":scope > .mas-table .mas-table-row").length).toBe(3);
    expect(status?.querySelectorAll(":scope > [aria-hidden='true']").length).toBe(4);
    expect(status?.querySelector(".meta-toolbar, select, button")).toBeNull();
  });

  it("defines scoped visible shimmer, responsive KPI layouts and reduced-motion behavior", () => {
    const css = readFileSync(join(process.cwd(), "app/styles/meta-account-skeleton.css"), "utf8");
    expect(css).toContain("#e3e8ef");
    expect(css).toContain("#f2f4f7");
    expect(css).toContain("@keyframes mas-shimmer");
    expect(css).toContain("1.7s");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(css).toContain("width: 100%");
    expect(css).toContain("min-width: 0");
    expect(css.split("\n").filter((line) => line.includes("{" ) && !line.trim().startsWith("@") ).every((line) => line.trimStart().startsWith(".meta-account-skeleton"))).toBe(true);
  });
});
