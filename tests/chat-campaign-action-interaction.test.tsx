// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignAction } from "@/components/chat/CampaignAction";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));

let root: Root;
let container: HTMLDivElement;
let requests: ReturnType<typeof vi.fn>;
const preview = {
  campaignId: "campaign-123",
  name: "Campagne de test",
  platform: "meta",
  action: "edit",
  changes: { title: "Nouveau titre", daily_budget: 42.5 },
  currentStatus: "active",
  requiresConfirmation: true,
};
const ok = (data: unknown) => ({ ok: true, json: async () => data });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  requests = vi.fn().mockResolvedValue(ok({ preview, token: "prepare-token" }));
  vi.stubGlobal("fetch", requests);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderEdit() {
  await act(async () => root.render(<CampaignAction data={{ campaignId: "campaign-123", action: "edit" }} />));
}
function bodyAt(index: number) {
  return JSON.parse(requests.mock.calls[index][1].body as string);
}

describe("CampaignAction — interactions DOM et fetch simulé", () => {
  it("allows explicit confirmation of a non-spending draft duplication without auto-running it", async () => {
    requests.mockResolvedValueOnce(ok({ preview: { ...preview, action: "duplicate", changes: {}, currentStatus: "draft", requiresConfirmation: false }, token: "draft-token" }));
    await act(async () => root.render(<CampaignAction data={{ campaignId: "campaign-123", action: "duplicate" }} />));
    expect(requests).not.toHaveBeenCalled();
    act(() => buttons()[0].click());
    await flush();
    expect(requests).toHaveBeenCalledTimes(1);
    const confirm = buttons().find(button => button.textContent?.includes("Confirmer"))!;
    expect(confirm.disabled).toBe(false);
    requests.mockResolvedValueOnce(ok({ message: "Brouillon créé; aucune campagne activée." }));
    act(() => confirm.click());
    await flush();
    expect(bodyAt(1)).toMatchObject({ phase: "execute", action: "duplicate", token: "draft-token", confirmed: true });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Brouillon créé");
  });
  it("ne fait aucun fetch au rendu, prépare seulement, et expose l'aperçu cible et budget", async () => {
    await renderEdit();
    expect(requests).not.toHaveBeenCalled();
    // React controlled inputs use the native value setter for a faithful DOM change event.
    const inputs = [...container.querySelectorAll<HTMLInputElement>("input")];
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(inputs[0], "Nouveau titre");
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      setter.call(inputs[1], "42.50");
      inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    });
    requests.mockClear();
    act(() => buttons()[0].click());
    await flush();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(requests.mock.calls[0][0]).toBe("/api/chat/campaign-actions");
    expect(requests.mock.calls[0][1].method).toBe("POST");
    expect(bodyAt(0)).toEqual({ phase: "prepare", campaignId: "campaign-123", action: "edit", changes: { title: "Nouveau titre", daily_budget: 42.5 } });
    expect(buttons().map(button => button.textContent)).toContain("Confirmer : modifier");
    expect(container.textContent).toContain("Campagne de test");
    expect(container.textContent).toContain("campaign-123");
    expect(container.textContent).toContain('"daily_budget":42.5');
    expect(container.textContent).toContain("Cible");
  });

  it("exécute uniquement après confirmation avec les paramètres exacts; un double clic n'envoie qu'une fois", async () => {
    await renderEdit();
    const inputs = [...container.querySelectorAll<HTMLInputElement>("input")];
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(inputs[0], "Nouveau titre"); inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      setter.call(inputs[1], "42.50"); inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    });
    requests.mockClear();
    act(() => buttons()[0].click());
    await flush();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(bodyAt(0).phase).toBe("prepare");

    let resolveExecute!: (value: unknown) => void;
    requests.mockImplementationOnce(() => new Promise(resolve => { resolveExecute = resolve; }));
    const confirm = buttons().find(button => button.textContent?.includes("Confirmer"))!;
    await act(async () => { confirm.click(); confirm.click(); });
    expect(requests).toHaveBeenCalledTimes(2);
    expect(bodyAt(1)).toEqual({ phase: "execute", campaignId: "campaign-123", action: "edit", changes: { title: "Nouveau titre", daily_budget: 42.5 }, token: "prepare-token", confirmed: true });
    await act(async () => resolveExecute(ok({ message: "Modification appliquée" })));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Modification appliquée");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("affiche les erreurs de préparation et d'exécution sans message de succès", async () => {
    requests.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "Préparation refusée" }) });
    await renderEdit();
    act(() => buttons()[0].click());
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Saisis un titre exact");
    // Entrée requise : soumettre l'édition après erreur de validation.
    const input = container.querySelector<HTMLInputElement>("input")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Titre"); input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => buttons()[0].click());
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Préparation refusée");
    expect(container.querySelector('[role="status"]')).toBeNull();

    requests.mockResolvedValueOnce(ok({ preview, token: "token-2" }));
    act(() => buttons()[0].click());
    await flush();
    requests.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "Exécution refusée" }) });
    act(() => buttons().find(button => button.textContent?.includes("Confirmer"))!.click());
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Exécution refusée");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("annuler après préparation ne déclenche aucune mutation", async () => {
    await renderEdit();
    const input = container.querySelector<HTMLInputElement>("input")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Titre"); input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    requests.mockClear();
    act(() => buttons()[0].click());
    await flush();
    expect(requests).toHaveBeenCalledTimes(1);
    act(() => buttons().find(button => button.textContent === "Annuler")!.click());
    await flush();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(bodyAt(0).phase).toBe("prepare");
    expect(container.textContent).not.toContain("Aperçu identifié");
  });
});
