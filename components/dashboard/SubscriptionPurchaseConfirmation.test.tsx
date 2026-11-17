// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionPurchaseConfirmation } from "./SubscriptionPurchaseConfirmation";

vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

function renderConfirmation(onConfirm = vi.fn(), locale: "fr" | "en" = "fr") {
  function Harness() {
    const [accepted, setAccepted] = useState(false);
    return createElement(SubscriptionPurchaseConfirmation, {
      locale,
      price: "3,50 $",
      perMonth: "/mois",
      billingNote: "Équivalent approximatif ; paiement facturé en XOF.",
      accepted,
      submitting: false,
      error: "",
      onAcceptedChange: setAccepted,
      onCancel: vi.fn(),
      onConfirm,
    });
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness)));
  return { onConfirm };
}

describe("SubscriptionPurchaseConfirmation", () => {
  it("shows the French read-and-accept wording and requires consent before checkout", () => {
    const { onConfirm } = renderConfirmation();
    expect(container.textContent).toContain("Je confirme avoir lu et accepter les Conditions d’utilisation de Vendeo et souhaite poursuivre vers le paiement au tarif affiché.");
    expect(container.textContent).toContain("3,50 $ /mois");
    expect(container.textContent).toContain("renouvellement est manuel");
    expect(container.textContent).toContain("facturé en XOF");
    const checkbox = container.querySelector<HTMLInputElement>(".studio-credit-confirm-check input")!;
    const button = container.querySelector<HTMLButtonElement>(".studio-credit-modal-actions .btn-dark")!;
    expect(button.disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => checkbox.click());
    expect(button.disabled).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => button.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => checkbox.click());
    expect(button.disabled).toBe(true);
  });

  it("shows the English read-and-accept wording and keeps checkout disabled until consent", () => {
    renderConfirmation(vi.fn(), "en");
    expect(container.textContent).toContain("I confirm that I have read and accept Vendeo’s Terms of Use and wish to continue to payment at the displayed price.");
    const button = container.querySelector<HTMLButtonElement>(".studio-credit-modal-actions .btn-dark")!;
    expect(button.disabled).toBe(true);
  });
});
