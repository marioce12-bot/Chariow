import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomStoreSetupGuide } from "@/components/dashboard/CustomStoreSetupGuide";
const { JSDOM } = require("jsdom");
let root: ReturnType<typeof createRoot> | undefined;
let dom: any;
function setup() {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.getElementById("root")!);
}
async function render(en = false, onChangeType = vi.fn()) {
  await act(async () => root!.render(<div role="dialog" aria-modal="true"><CustomStoreSetupGuide en={en} onChangeType={onChangeType} /></div>));
  return onChangeType;
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent?.includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => button.click());
  return button;
}
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; dom?.window.close(); vi.unstubAllGlobals(); });
describe("custom store preparation guide", () => {
  it("walks all French preparation steps, preserves honest inactive status, and navigates back", async () => {
    setup(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const onChangeType = await render(false);
    expect(document.querySelector("h2")?.textContent).toBe("Préparer ton catalogue");
    expect(document.querySelector("ol")?.textContent).toContain("Catalogue");
    expect(document.querySelector("ol")?.textContent).toContain("Webhooks");
    expect(document.querySelector("ol")?.textContent).toContain("Vérification");
    expect(document.querySelector('input[type="radio"][value="feed"]')).toBeTruthy();
    expect(document.querySelector('input[type="radio"][value="csv"]')).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelectorAll("input[type=radio]").length).toBe(2);
    await click("Étape suivante");
    expect(document.querySelector("h2")?.textContent).toBe("Préparer les événements de commande");
    expect(document.body.textContent).toContain("ne génère pas encore d’URL webhook ni de secret");
    await click("Étape précédente"); expect(document.querySelector("h2")?.textContent).toBe("Préparer ton catalogue");
    await click("Étape suivante"); await click("Étape suivante");
    expect(document.querySelector("h2")?.textContent).toBe("Tester avant de connecter");
    expect(document.querySelector('[aria-label="État réel de l’intégration"]')?.textContent).toContain("Non importé");
    expect(document.querySelector('[aria-label="État réel de l’intégration"]')?.textContent).toContain("Non configuré");
    expect(document.querySelector('[aria-label="État réel de l’intégration"]')?.textContent).toContain("Non exécutés");
    expect(document.querySelector('[aria-label="État réel de l’intégration"]')?.textContent).toContain("Non connectée");
    expect(document.querySelector('[aria-label="État réel de l’intégration"]')?.textContent).toContain("Inactif");
    expect(document.body.textContent).toContain("n’a exécuté aucun test");
    expect(document.querySelector("button")?.textContent).not.toContain("connectée");
    await click("Étape précédente"); expect(document.querySelector("h2")?.textContent).toBe("Préparer les événements de commande");
    await click("Changer de type de boutique"); expect(onChangeType).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("offers only a local CSV preparation option and clearly says nothing is imported", async () => {
    setup(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await render(false);
    const csv = document.querySelector('input[value="csv"]') as HTMLInputElement;
    await act(async () => { csv.click(); });
    expect((document.querySelector('input[value="csv"]') as HTMLInputElement).checked).toBe(true);
    expect(document.body.textContent).toContain("Non importé");
    expect(document.body.textContent).toContain("Aucun envoi de fichier ni branchement de flux");
    expect(document.body.textContent).not.toContain("Envoyer le fichier");
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("has English labels and equally explicit unavailable integration status", async () => {
    setup(); await render(true);
    expect(document.querySelector("h2")?.textContent).toBe("Prepare your catalog");
    expect(document.body.textContent).toContain("Catalog"); expect(document.body.textContent).toContain("Webhooks");
    expect(document.body.textContent).toContain("Verification"); expect(document.body.textContent).toContain("Feed / API");
    expect(document.body.textContent).toContain("CSV file");
    await click("Next step"); expect(document.querySelector("h2")?.textContent).toBe("Prepare order events");
    expect(document.body.textContent).toContain("does not generate a custom-store webhook URL or secret yet");
    await click("Next step"); expect(document.querySelector("h2")?.textContent).toBe("Test before connecting");
    expect(document.querySelector('[aria-label="Actual integration status"]')?.textContent).toContain("Not connected");
    expect(document.querySelector('[aria-label="Actual integration status"]')?.textContent).toContain("Inactive");
    expect(document.body.textContent).toContain("No test has been run by this guide");
  });
});
