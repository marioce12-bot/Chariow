import { afterEach, describe, expect, it, vi } from "vitest";
import { askGemini, getGeminiModel } from "@/lib/ai/gemini";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const messages = [{ role: "user" as const, content: "Salut" }];
const success = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Bonjour" }] } }] }), { status: 200 });
const failure = (status = 503) => new Response(JSON.stringify({ error: { message: `provider-${status}` } }), { status });

describe("askGemini transport", () => {
  it("uses explicit model while leaving the global default unchanged", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-global-default");
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetchMock);
    expect(getGeminiModel()).toBe("gemini-global-default");
    await expect(askGemini(messages, { model: "gemini-3.6-flash" })).resolves.toBe("Bonjour");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=test-key");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).contents).toEqual([{ role: "user", parts: [{ text: "Salut" }] }]);
    expect(JSON.parse(init.body).generationConfig).toEqual({ temperature: 0.4 });
  });
  it("passes optional low thinking level", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(success()));
    await askGemini(messages, { model: "gemini-3.6-flash", timeoutMs: 60000, thinkingLevel: "LOW" });
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).generationConfig).toEqual({ temperature: 0.4, thinkingConfig: { thinkingLevel: "LOW" } });
  });
  it.each([400, 401, 403, 404, 429, 500, 502])("does not retry HTTP %s even when overload retries are enabled", async (status) => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(failure(status));
    vi.stubGlobal("fetch", fetchMock);
    await expect(askGemini(messages, { model: "gemini-3.6-flash", overloadRetries: 2 })).rejects.toMatchObject({ status, message: `provider-${status}` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps retries opt-in for Studio and all other callers", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(failure());
    vi.stubGlobal("fetch", fetchMock);
    await expect(askGemini(messages)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("recovers after two explicit overload refusals using identical model, payload and signal", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValueOnce(failure()).mockResolvedValueOnce(failure()).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetchMock);
    const result = askGemini(messages, { model: "gemini-3.6-flash", overloadRetries: 2, timeoutMs: 60000 });
    const assertion = expect(result).resolves.toBe("Bonjour");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) expect(call).toEqual(fetchMock.mock.calls[0]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/gemini-3.6-flash:");
  });
  it("caps persistent overload at three attempts even if more retries are requested", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockImplementation(async () => failure());
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(askGemini(messages, { overloadRetries: 99 })).rejects.toMatchObject({ status: 503 });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("shares one total timeout across attempts and aborts backoff without a new request", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockImplementation(async () => failure());
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(askGemini(messages, { overloadRetries: 2, timeoutMs: 1500 })).rejects.toMatchObject({ name: "AbortError" });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Date.now()).toBeGreaterThan(0);
  });
  it("does not retry ambiguous network errors", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(askGemini(messages, { overloadRetries: 2 })).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("propagates abort timeout and does not retry empty successful generations", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))));
    await expect(askGemini(messages, { model: "gemini-3.6-flash", timeoutMs: 5, overloadRetries: 2 })).rejects.toMatchObject({ name: "AbortError" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: " " }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(askGemini(messages, { overloadRetries: 2 })).rejects.toThrow("Gemini returned an empty response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
