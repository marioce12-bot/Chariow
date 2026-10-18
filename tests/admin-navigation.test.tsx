// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminHeaderNavigation,
  AdminNavigation,
  adminSectionKeys,
} from "@/components/AdminNavigation";

const localeState = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", async () => {
  const { translate } = await import("@/lib/i18n/translate");
  return {
    useI18n: () => ({
      locale: localeState.locale,
      setLocale: vi.fn(),
      t: (key: string, vars?: Record<string, string | number>) =>
        translate(localeState.locale as "fr" | "en", key, vars),
    }),
  };
});

let container: HTMLDivElement;
let root: Root;
let media: MediaQueryList;
let addListener: ReturnType<typeof vi.fn>;
let removeListener: ReturnType<typeof vi.fn>;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localeState.locale = "fr";
  addListener = vi.fn();
  removeListener = vi.fn();
  media = {
    matches: false,
    media: "(min-width: 901px)",
    onchange: null,
    addEventListener: addListener,
    removeEventListener: removeListener,
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    [Symbol.toStringTag]: "MediaQueryList",
  } as unknown as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("navigation propriétaire", () => {
  it("expose dix destinations dans les groupes Observation, Contrôle et Gestion, avec aria-current", () => {
    act(() =>
      root.render(<AdminNavigation active="users" onChange={vi.fn()} />),
    );
    expect(adminSectionKeys).toHaveLength(10);
    expect(
      Array.from(container.querySelectorAll(".admin-nav-group-label")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["Observation", "Contrôle", "Gestion"]);
    expect(container.querySelectorAll(".admin-nav-group button")).toHaveLength(
      10,
    );
    expect(
      container.querySelector('[aria-current="page"] span')?.textContent,
    ).toBe("Comptes utilisateurs");
    localeState.locale = "en";
    act(() =>
      root.render(<AdminNavigation active="overview" onChange={vi.fn()} />),
    );
    expect(
      Array.from(container.querySelectorAll(".admin-nav-group-label")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["Observation", "Control", "Management"]);
    expect(
      container.querySelector('[aria-current="page"] span')?.textContent,
    ).toBe("Overview");
  });

  it("keeps the legacy header navigation empty", () => {
    act(() =>
      root.render(
        <AdminHeaderNavigation active="overview" onChange={vi.fn()} />,
      ),
    );
    expect(container.firstChild).toBeNull();
  });

  it("opens an aria-modal dialog, closes on selection and restores overflow and focus", () => {
    const onChange = vi.fn();
    document.body.style.overflow = "auto";
    act(() =>
      root.render(<AdminNavigation active="overview" onChange={onChange} />),
    );
    const trigger =
      container.querySelector<HTMLButtonElement>(".admin-nav-trigger")!;
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      container.querySelector('[role="dialog"][aria-modal="true"]'),
    ).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(
      container.querySelector(".admin-navigation button"),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '.admin-nav-group button[aria-current="page"]',
        )!
        .click(),
    );
    expect(onChange).toHaveBeenCalledWith("overview");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);
    expect(addListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("closes on Escape and overlay click and restores focus", () => {
    act(() =>
      root.render(<AdminNavigation active="audit" onChange={vi.fn()} />),
    );
    const trigger =
      container.querySelector<HTMLButtonElement>(".admin-nav-trigger")!;
    act(() => trigger.click());
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    act(() => trigger.click());
    act(() =>
      container.querySelector<HTMLButtonElement>(".admin-nav-overlay")!.click(),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});
