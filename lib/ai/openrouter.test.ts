import { afterEach, describe, expect, it, vi } from "vitest";
import { askOpenRouter, getOpenRouterModel, OpenRouterApiError } from "@/lib/ai/openrouter";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const messages = [
  { role: "system" as const, content: "Tu es un assistant utile." },
  { role: "user" as const, content: "Salut" },
];
const success = (content = "Bonjour") => new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), { status: 200 });
const failure = (status = 503) => new Response(JSON.stringify({ error: { message: `provider-${status}` } }), { status });

 describe("askOpenRouter transport", () => {
  it("uses the configured model and standard endpoint without placing the key in the URL", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite");
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetchMock);

    expect(getOpenRouterModel()).toBe("google/gemini-2.5-flash-lite");
    await expect(askOpenRouter(messages, { timeoutMs: 60000, overloadRetries: 2 })).resolves.toBe("Bonjour");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer test-key" });
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({ model: "google/gemini-2.5-flash-lite", temperature: 0.4, stream: false });
    expect(payload.messages).toEqual(messages);
    expect(String(url)).not.toContain("test-key");
  });

  it("passes image attachments as OpenAI-compatible image_url parts", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetchMock);
    const withImage = [{
      role: "user" as const,
      content: "Que vois-tu ?",
      attachments: [
        { url: "https://files.example/image.png", type: "image" as const },
        { url: "https://files.example/video.mp4", type: "video" as const },
      ],
    }];

    await askOpenRouter(withImage);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages).toEqual([{
      role: "user",
      content: [
        { type: "text", text: "Que vois-tu ?" },
        { type: "image_url", image_url: { url: "https://files.example/image.png" } },
      ],
    }]);
  });

  it("keeps upstream error details and credentials out of thrown messages", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(401)));
    await expect(askOpenRouter(messages)).rejects.toMatchObject({
      status: 401,
      message: "OpenRouter API returned 401",
    });
    await expect(askOpenRouter(messages)).rejects.not.toThrow("provider-401");
    await expect(Promise.reject(new OpenRouterApiError(401))).rejects.not.toThrow("test-key");
  });

  it("retries only explicit 503 responses and keeps the configured model unchanged", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite");
    const fetchMock = vi.fn().mockResolvedValueOnce(failure()).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(askOpenRouter(messages, { overloadRetries: 1 })).resolves.toBe("Bonjour");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("google/gemini-2.5-flash-lite");
    expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
  });

  it("does not retry other HTTP errors or ambiguous network failures", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(failure(429));
    vi.stubGlobal("fetch", fetchMock);
    await expect(askOpenRouter(messages, { overloadRetries: 2 })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const networkError = new TypeError("fetch failed");
    const networkFetch = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal("fetch", networkFetch);
    await expect(askOpenRouter(messages, { overloadRetries: 2 })).rejects.toBe(networkError);
    expect(networkFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects empty successful responses and requires an API key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(success(" "));
    vi.stubGlobal("fetch", fetchMock);
    await expect(askOpenRouter(messages)).rejects.toThrow("OpenRouter returned an empty response");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(askOpenRouter(messages)).rejects.toThrow("OPENROUTER_API_KEY is not configured");
  });
});
