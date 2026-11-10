// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreditPurchaseConfirmation } from "./CreditPurchaseConfirmation";

vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

function renderConfirmation(onConfirm = vi.fn()) {
  function Harness() {
    const [accepted, setAccepted] = useState(false);
    return createElement(CreditPurchaseConfirmation, {
      locale: "fr",
      credits: 200,
      unitPrice: 2.5,
      total: 500,
      currentBalance: 100,
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

describe("Studio credit purchase confirmation", () => {
  it("shows the amount and rules and requires an explicit acknowledgement before checkout", () => {
    const { onConfirm } = renderConfirmation();
    expect(container.textContent).toContain("200 crédits");
    expect(container.textContent).toContain("500 XOF");
    expect(container.textContent).toContain("n’expirent pas");
    expect(container.textContent).toContain("abonnement actif");
    const checkbox = container.querySelector<HTMLInputElement>(".studio-credit-confirm-check input")!;
    const button = container.querySelector<HTMLButtonElement>(".studio-credit-modal-actions .btn-dark")!;
    expect(button.disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => checkbox.click());
    expect(button.disabled).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => button.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
