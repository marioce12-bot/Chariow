// @vitest-environment jsdom
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => state }));
import { SaleCelebration, SALE_CELEBRATION_DURATION } from "@/components/dashboard/SaleCelebration";

describe("sale celebration", () => {
  let container: HTMLDivElement;
  let root: Root;
  let request: ReturnType<typeof vi.fn>;
  const overlay = () => document.querySelector('[data-testid="sale-celebration"]');
  const visibility = (value: string) => Object.defineProperty(document, "visibilityState", { configurable: true, value });
  const answer = (celebrate: boolean) => ({ ok: true, json: async () => ({ celebrate }) });
  const mount = async (strict = false, id = "alice") => {
    await act(async () => { root.render(strict ? <StrictMode><SaleCelebration userId={id} /></StrictMode> : <SaleCelebration userId={id} />); });
  };
  const focus = async () => { await act(async () => { window.dispatchEvent(new Event("focus")); }); };
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    state.locale = "fr";
    visibility("visible");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    request = vi.fn().mockResolvedValue(answer(false));
    vi.stubGlobal("fetch", request);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("does nothing for baseline/history, and asks the real authenticated endpoint", async () => {
    await mount();
    expect(overlay()).toBeNull();
    expect(request).toHaveBeenCalledWith("/api/sales/celebration", { method: "POST", cache: "no-store" });
  });
  it("shows foreground confetti and fireworks for exactly two seconds", async () => {
    request.mockResolvedValue(answer(true));
    await mount();
    expect(document.body.textContent).toContain("Woohoo 🎉");
    expect(document.body.textContent).toContain("Nouvelle vente !");
    expect(overlay()?.parentElement).toBe(document.body);
    expect(document.querySelectorAll(".sale-confetti")).toHaveLength(84);
    expect(document.querySelectorAll(".sale-firework")).toHaveLength(3);
    await act(async () => { vi.advanceTimersByTime(SALE_CELEBRATION_DURATION - 1); });
    expect(overlay()).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(overlay()).toBeNull();
  });
  it("keeps English copy", async () => {
    state.locale = "en";
    request.mockResolvedValue(answer(true));
    await mount();
    expect(document.body.textContent).toContain("New sale!");
    expect(document.body.textContent).not.toContain("Nouvelle vente");
  });
  it("checks on reopening but never celebrates the same claimed sale again", async () => {
    await mount();
    request.mockResolvedValueOnce(answer(true));
    visibility("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(request).toHaveBeenCalledTimes(1);
    visibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(overlay()).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(2000); });
    await focus();
    expect(overlay()).toBeNull();
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("shares the consuming request across StrictMode effect replay", async () => {
    request.mockResolvedValue(answer(true));
    await mount(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(overlay()).not.toBeNull();
  });
  it("waits until visible to display a sale returned while in background", async () => {
    let resolve!: (value: unknown) => void;
    request.mockReturnValue(new Promise(r => { resolve = r; }));
    await mount();
    visibility("hidden");
    await act(async () => { resolve(answer(true)); });
    expect(overlay()).toBeNull();
    visibility("visible");
    await focus();
    expect(request).toHaveBeenCalledTimes(1);
    expect(overlay()).not.toBeNull();
  });
  it("fails silently and retries at the next opening", async () => {
    request.mockRejectedValueOnce(new Error("offline"));
    await mount();
    expect(overlay()).toBeNull();
    request.mockResolvedValue(answer(true));
    await focus();
    expect(overlay()).not.toBeNull();
  });
  it("does not call the endpoint offline or before the app is visible", async () => {
    visibility("hidden");
    await mount();
    expect(request).not.toHaveBeenCalled();
    visibility("visible");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await focus();
    expect(request).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("ignores failed or malformed responses", async () => {
    request.mockResolvedValueOnce({ ok: false });
    await mount();
    expect(overlay()).toBeNull();
    request.mockResolvedValueOnce({ ok: true, json: async () => ({ celebrate: "true" }) });
    await focus();
    expect(overlay()).toBeNull();
  });
  it("cleans timers, portal and listeners when leaving the dashboard", async () => {
    request.mockResolvedValue(answer(true));
    await mount();
    await act(async () => { root.render(null); });
    expect(overlay()).toBeNull();
    await focus();
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
