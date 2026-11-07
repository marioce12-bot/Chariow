// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralBonusPopup } from "./ReferralBonusPopup";

vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => ({
      "referral.bonusPopupTitle": "Une nouvelle inscription grâce à ton lien de parrainage !",
      "referral.bonusPopupBody": "Félicitations, 150 crédits viennent d’être ajoutés à ton compte.",
      "referral.bonusPopupDismiss": "Super, merci !",
      "referral.bonusPopupClose": "Fermer la notification",
    }[key] ?? key),
  }),
}));

const fetchMock = vi.fn();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function renderPopup() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(ReferralBonusPopup));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ReferralBonusPopup", () => {
  it("shows a confirmed 150-credit referral reward and stores its ID to prevent repeats", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [{ id: "bonus-1", credits: 150, createdAt: "2026-11-07T10:00:00.000Z" }] }),
    });

    await renderPopup();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Une nouvelle inscription grâce à ton lien de parrainage !");
    expect(dialog?.textContent).toContain("Félicitations, 150 crédits viennent d’être ajoutés à ton compte.");
    expect(window.localStorage.getItem("vendeo_referral_bonus_notifications_seen_v1")).toContain("bonus-1");
  });

  it("does not show the same confirmed reward again after a remount", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [{ id: "bonus-1", credits: 150, createdAt: "2026-11-07T10:00:00.000Z" }] }),
    });

    await renderPopup();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
    await renderPopup();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("leaves later confirmed rewards unseen until their popup is actually shown", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [
        { id: "bonus-2", credits: 150, createdAt: "2026-11-07T10:01:00.000Z" },
        { id: "bonus-1", credits: 150, createdAt: "2026-11-07T10:00:00.000Z" },
      ] }),
    });

    await renderPopup();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(JSON.parse(window.localStorage.getItem("vendeo_referral_bonus_notifications_seen_v1") ?? "[]")).toEqual(["bonus-1"]);

    act(() => root.unmount());
    container.remove();
    await renderPopup();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(JSON.parse(window.localStorage.getItem("vendeo_referral_bonus_notifications_seen_v1") ?? "[]")).toEqual(["bonus-1", "bonus-2"]);
  });

  it("does not show a popup when the server has no confirmed referral bonus", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ transactions: [] }) });
    await renderPopup();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
