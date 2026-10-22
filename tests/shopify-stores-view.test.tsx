// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, locale: "en" }) }));
import { StoresView } from "@/components/dashboard/sections";

describe("StoresView Shopify onboarding", () => {
  it("renders an inline Shopify domain form without credentials", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => { root.render(<StoresView stores={[]} subscription={null} onStoresChange={() => {}} />); });
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Add Shopify"));
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); });
    expect(container.innerHTML).toContain("example.myshopify.com");
    expect(container.innerHTML).not.toMatch(/password|access[_ -]?token|client[_ -]?secret/i);
    await act(async () => { root.unmount(); });
  });
});
