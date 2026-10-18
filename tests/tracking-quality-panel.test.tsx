// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TrackingQualityPanel } from "@/components/dashboard/TrackingQualityPanel";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", setLocale: vi.fn(), t: (key: string) => key }) }));
const messages = [
  "L’attribution vente → campagne n’a pas pu être vérifiée.",
  "L’installation du pixel Chariow n’est pas confirmée pour un compte rattaché.",
  "Aucun événement récent du pixel n’est confirmé. Un pixel configuré ne prouve pas le suivi des achats.",
];
const quality = { status: "incomplete", checkedAt: "2025-01-01T00:00:00Z", paidSales: 2, automaticActionsAllowed: false,
  issues: messages.map((message, index) => ({ code: `issue-${index}`, message })) };
let host: HTMLDivElement;
let root: Root;
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(createElement(TrackingQualityPanel, { storeId: "store-1", periodDays: 30 })); });
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TrackingQualityPanel", () => {
  it("keeps details collapsed initially and preserves all issue messages on expansion", async () => {
    await mount(vi.fn(async () => ({ ok: true, json: async () => ({ quality }) })));
    const details = host.querySelector("details")!;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("Voir les détails (3)");
    expect(host.textContent).toContain("Suivi à vérifier");
    expect(host.textContent).toContain("3 points à vérifier.");
    expect(host.textContent).toContain("Rentabilité incomplète");
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle", { bubbles: true })); });
    for (const message of messages) expect(host.textContent).toContain(message);
    expect(host.textContent).toContain("Les actions automatiques restent conditionnées à un suivi des achats validé et à des limites de budget explicites.");
  });

  it("keeps the concise warning visible when the endpoint errors", async () => {
    await mount(vi.fn(async () => ({ ok: false, json: async () => ({ error: "Service momentanément indisponible." }) })));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Service momentanément indisponible.");
    expect(host.textContent).toContain("Rentabilité incomplète");
    expect(host.textContent).toContain("Vérification des liens entre ventes et pubs.");
  });
});
