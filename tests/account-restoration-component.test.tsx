// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => { throw new Error("No database permitted in UI tests"); } }));
import AccountRestoration from "@/components/AccountRestoration";
let container: HTMLDivElement; let root: Root;
const fetchMock = vi.fn();
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("does not restore automatically after a verified sign-in", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ state: "pending", purge_after: "2027-01-21T00:00:00Z" })));
  await act(async () => { root.render(<AccountRestoration />); });
  expect(container.textContent).toContain("L’essai de 15 jours continue");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/account");
});
it("sends only an explicit restoration request and shows unchanged trial", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ state: "pending" }))).mockResolvedValueOnce(new Response(JSON.stringify({ restored: true })));
  await act(async () => { root.render(<AccountRestoration />); });
  const button = [...container.querySelectorAll("button")].find(b => b.textContent === "Restaurer le compte")!;
  await act(async () => { button.click(); });
  expect(fetchMock).toHaveBeenLastCalledWith("/api/account/restore", { method: "POST" });
  expect(container.textContent).toContain("ni réinitialisé ni prolongé");
});
it("never offers restore after the deadline", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ state: "expired" })));
  await act(async () => { root.render(<AccountRestoration />); });
  expect(container.textContent).toContain("Le compte ne peut plus être restauré");
  expect(container.querySelector("button")).toBeNull();
});
it("makes zero network calls in the visibly fictional Preview", async () => {
  await act(async () => { root.render(<AccountRestoration demo />); });
  expect(container.textContent).toContain("données fictives");
  await act(async () => { [...container.querySelectorAll("button")].find(b => b.textContent === "Restaurer le compte")!.click(); });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Aucune donnée réelle modifiée");
});
