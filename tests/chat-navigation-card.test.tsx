// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationCard } from "@/components/chat/NavigationCard";
import { resolveChatNavigationRequest } from "@/components/chat/navigation-intent";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("Assistant navigation card", () => {
  it("navigates to the exact Reports section only after the user clicks the button", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const onNavigate = vi.fn();
    const target = resolveChatNavigationRequest("Où voir les rapports ?");
    expect(target?.section).toBe("Rapports");
    await act(async () => {
      root!.render(createElement(NavigationCard, { target: target!, locale: "fr", onNavigate }));
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Ouvrir Rapports");
    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.type).toBe("button");
    await act(async () => { button?.click(); });
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("Rapports");
  });
});
