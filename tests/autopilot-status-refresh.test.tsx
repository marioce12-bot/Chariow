// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const language = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: language.locale }) }));
import { AutopilotBudgetLimit } from "@/components/vendeo/AutopilotBudgetLimit";
import type { AutopilotLiveStatus } from "@/lib/autopilot-eligibility";
let root: Root;
const proof = (state: AutopilotLiveStatus["state"] = "active", extra = {}) => ({ state, checked_at: new Date().toISOString(), reason: "verified", ...extra });
const response = (status = proof()) => ({ ok: true, json: async () => ({ autopilot_live_status: status }) });
const render = async (id = "c", liveStatus?: AutopilotLiveStatus) => { await act(async () => root.render(<AutopilotBudgetLimit campaignId={id} liveStatus={liveStatus} />)); };
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
  document.body.innerHTML = '<div id="root"></div>';
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.getElementById("root")!);
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); language.locale = "fr"; });

describe("automatic active-only status refresh", () => {
  it.each([["fr", "Activer l’autopilote"], ["en", "Activate autopilot"]])("shows activation automatically after fresh GET in %s", async (locale, label) => {
    language.locale = locale;
    const fetcher = vi.fn(async (_url: unknown, _options: RequestInit) => response()); vi.stubGlobal("fetch", fetcher);
    await render();
    expect(document.body.textContent).toContain(label);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });
  it("recovers from a transient failure after 30 seconds without a click", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("network")).mockImplementation(async () => response()); vi.stubGlobal("fetch", fetcher);
    await render(); expect(document.body.textContent).not.toContain("Activer l’autopilote");
    await tick(30_000);
    expect(document.body.textContent).toContain("Activer l’autopilote");
    await tick(30_000); await tick(30_000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(document.body.textContent).toContain("Activer l’autopilote");
  });
  it("removes activation immediately on inactive or revoked proof, and clears error after recovery", async () => {
    const fetcher = vi.fn().mockImplementationOnce(async () => response()).mockImplementationOnce(async () => response(proof("inactive"))).mockImplementationOnce(async () => response(proof("unknown", { reasonCode: "TOKEN_EXPIRED" }))).mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetcher); await render();
    await tick(30_000); expect(document.body.textContent).not.toContain("Activer l’autopilote");
    expect(document.body.textContent).toContain("inactive");
    await tick(30_000); expect(document.querySelector('[role="alert"]')?.textContent).toContain("connexion Meta a expiré");
    await tick(30_000); expect(document.body.textContent).toContain("Activer l’autopilote"); expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it("expires fresh proof while a refresh is still pending and serializes refreshes", async () => {
    const fetcher = vi.fn(() => new Promise(() => {})); vi.stubGlobal("fetch", fetcher);
    await render("c", proof()); await tick(30_000);
    expect(document.body.textContent).toContain("Activer l’autopilote");
    await tick(30_000); expect(document.body.textContent).not.toContain("Activer l’autopilote");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("suspends polling when hidden and rechecks on mobile visibility return", async () => {
    const fetcher = vi.fn(async () => response()); vi.stubGlobal("fetch", fetcher); await render();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await tick(90_000); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("Activer l’autopilote");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetcher).toHaveBeenCalledTimes(2); expect(document.body.textContent).toContain("Activer l’autopilote");
  });
  it("ignores a late active response for a different campaign", async () => {
    let resolve: (value: any) => void = () => {};
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockImplementation(async () => response(proof("inactive")));
    vi.stubGlobal("fetch", fetcher); await render("old"); await render("new");
    await act(async () => resolve(response()));
    expect(document.body.textContent).not.toContain("Activer l’autopilote");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
