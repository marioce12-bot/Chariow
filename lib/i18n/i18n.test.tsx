// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider, useI18n } from "./i18n";

let root: Root | undefined;
let host: HTMLDivElement;

function Probe() {
  const { locale, setLocale, t } = useI18n();
  return <><output>{locale}:{t("launch.title")}</output><button onClick={() => setLocale("en")}>English</button></>;
}

async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<I18nProvider><Probe /></I18nProvider>); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  document.cookie = "vendeo-lang=; path=/; max-age=0";
  document.documentElement.lang = "fr";
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  localStorage.clear();
  document.cookie = "vendeo-lang=; path=/; max-age=0";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("I18nProvider", () => {
  it("does not let an old account response undo an explicit English selection", async () => {
    let resolveGet!: (response: { ok: boolean; json: () => Promise<{ locale: string }> }) => void;
    const pending = new Promise((resolve) => { resolveGet = resolve; });
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => init?.method === "PATCH"
      ? Promise.resolve({ ok: true }) : pending);
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    await act(async () => { host.querySelector("button")!.click(); });
    await act(async () => { resolveGet({ ok: true, json: async () => ({ locale: "fr" }) }); });
    expect(host.querySelector("output")!.textContent).toMatch(/^en:/);
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("vendeo-lang")).toBe("en");
    expect(fetchMock).toHaveBeenCalledWith("/api/account/preferences", expect.objectContaining({ method: "PATCH", body: '{"locale":"en"}' }));
  });

  it("uses a saved server preference when no newer choice has been made", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ locale: "en" }) })));
    await mount();
    expect(host.querySelector("output")!.textContent).toMatch(/^en:/);
    expect(document.documentElement.lang).toBe("en");
  });

  it("keeps the local preference when account preferences are unavailable", async () => {
    localStorage.setItem("vendeo-lang", "en");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await mount();
    expect(host.querySelector("output")!.textContent).toMatch(/^en:/);
    expect(document.documentElement.lang).toBe("en");
  });
});
