import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));

import { StoreConnectionGate } from "./StoreConnectionGate";

describe("StoreConnectionGate", () => {
  it("asks whether the new user already has a Chariow store", () => {
    const html = renderToStaticMarkup(<StoreConnectionGate stores={[]} failed={false} onSignOut={() => {}} />);
    expect(html).toContain("As-tu déjà une boutique Chariow ?");
    expect(html).toContain("J’ai déjà une boutique");
    expect(html).toContain("Je n’ai pas encore de boutique");
  });
});
