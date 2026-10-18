// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminHeaderNavigation, AdminNavigation } from "@/components/AdminNavigation";


vi.mock("@/lib/i18n/i18n", async () => { const { translate } = await import("@/lib/i18n/translate"); return { useI18n: () => ({ locale: "fr", setLocale: () => {}, t: (key: string, vars?: Record<string, string | number>) => translate("fr", key, vars) }) }; });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("admin navigation", () => {
  it("places all three platform tools in the desktop header with the active state", () => {
    const onChange = vi.fn();
    act(() => root.render(<AdminHeaderNavigation active="integrations" onChange={onChange} />));
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["Notifications", "Intégrations", "Journal d’audit", "Retours & notes"]);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Intégrations");
    act(() => buttons[0].click());
    expect(onChange).toHaveBeenCalledWith("notifications");
  });

  it("retains all ten destinations including feedback in the mobile drawer, closes on selection and restores scrolling", () => {
    const onChange = vi.fn();
    act(() => root.render(<AdminNavigation active="overview" onChange={onChange} />));
    expect(container.querySelectorAll(".admin-nav-group button")).toHaveLength(10);
    expect(container.querySelectorAll(".admin-nav-platform button")).toHaveLength(4);
    expect(Array.from(container.querySelectorAll(".admin-nav-group button")).some((button) => button.textContent?.includes("Retours & notes"))).toBe(true);
    const trigger = container.querySelector<HTMLButtonElement>(".admin-nav-trigger")!;
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>(".admin-nav-platform button")!.click());
    expect(onChange).toHaveBeenCalledWith("notifications");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the drawer with Escape and returns focus to its trigger", () => {
    act(() => root.render(<AdminNavigation active="audit" onChange={() => {}} />));
    const trigger = container.querySelector<HTMLButtonElement>(".admin-nav-trigger")!;
    act(() => trigger.click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});
