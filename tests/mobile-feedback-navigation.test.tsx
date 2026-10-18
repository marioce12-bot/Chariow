// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", setLocale: vi.fn(), t: (key: string) => key }) }));
import { MobileSettingsView } from "@/components/dashboard/sections";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ accounts: [] })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("mobile feedback navigation", () => {
  it("exposes feedback from mobile settings opened directly in preferences", () => {
    const navigate = vi.fn();
    act(() => root.render(<MobileSettingsView onNavigate={navigate} onSignOut={() => {}} plan="starter" focus="preferences" />));
    const link = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Suggestions et notes"));
    expect(link).toBeTruthy();
    act(() => link!.click());
    expect(navigate).toHaveBeenCalledWith("Suggestions et notes");
  });
});
