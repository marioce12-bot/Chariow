import { afterEach, describe, expect, it, vi } from "vitest";
import { askGemini, getGeminiModel } from "@/lib/ai/gemini";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("askGemini transport", () => {
  it("uses explicit model in the Google Gemini transport while global default stays unchanged", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-global-default");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Bonjour" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(getGeminiModel()).toBe("gemini-global-default");
    await expect(askGemini([{ role: "user", content: "Salut" }], { model: "gemini-3.6-flash" })).resolves.toBe("Bonjour");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=test-key");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).contents).toEqual([{ role: "user", parts: [{ text: "Salut" }] }]);
  });
  it.each([{ status: 429, label: "quota" }, { status: 404, label: "model unavailable" }])("reports $label provider errors", async ({ status }) => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: `provider-${status}` } }), { status })));
    await expect(askGemini([{ role: "user", content: "x" }], { model: "gemini-3.6-flash" })).rejects.toThrow(`provider-${status}`);
  });
  it("propagates abort timeout and rejects empty responses", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))));
    await expect(askGemini([{ role: "user", content: "x" }], { model: "gemini-3.6-flash", timeoutMs: 5 })).rejects.toMatchObject({ name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: " " }] } }] }), { status: 200 })));
    await expect(askGemini([{ role: "user", content: "x" }], { model: "gemini-3.6-flash" })).rejects.toThrow("Gemini returned an empty response");
  });
});
