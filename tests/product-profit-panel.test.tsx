// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProductProfitPanel from "@/components/dashboard/ProductProfitPanel";

let host: HTMLDivElement;
let root: Root;

async function mount(storeId: string | null) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(ProductProfitPanel, { storeId }));
  });
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe("ProductProfitPanel", () => {
  it("states that Chariow fees are 15% and a provided net is not charged twice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ products: [], costs: [] }) })),
    );
    await mount("store-1");
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain("15 %");
    expect(host.textContent).toContain("sans nouvelle déduction des frais");
    expect(host.textContent).not.toMatch(/coût de fabrication|frais supplémentaires/i);
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector("button")).toBeNull();
  });

  it("renders local skeletons while sales are loading", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    await mount("store-1");
    expect(host.querySelector('[aria-label="Chargement des ventes"]')).not.toBeNull();
    expect(host.querySelectorAll(".sk").length).toBeGreaterThan(0);
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ products: [], costs: [] }) });
    });
  });
});
