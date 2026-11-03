import { afterEach, describe, expect, it, vi } from "vitest";
import { askOpenRouter, getOpenRouterFallbackModels } from "@/lib/ai/openrouter";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const messages = [{ role: "user" as const, content: "Salut" }];
const success = () => new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Bonjour" } }] }), { status: 200 });

describe("OpenRouter model fallbacks", () => {
  it("sends default fallback models in models[] and keeps the primary model in model", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetchMock);

    await askOpenRouter(messages, { model: "google/gemini-2.5-flash-lite" });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.model).toBe("google/gemini-2.5-flash-lite");
    expect(payload.models).toEqual(["google/gemini-2.5-flash", "openai/gpt-4o-mini"]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never lists the primary model as its own fallback", () => {
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "google/gemini-2.5-flash, openai/gpt-4o-mini");
    expect(getOpenRouterFallbackModels("google/gemini-2.5-flash")).toEqual(["openai/gpt-4o-mini"]);
  });

  it("reads OPENROUTER_FALLBACK_MODELS and caps the list at two models", () => {
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "a/one,b/two,c/three");
    expect(getOpenRouterFallbackModels("google/gemini-2.5-flash-lite")).toEqual(["a/one", "b/two"]);
  });

  it("disables fallbacks with an empty value or « none »", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockImplementation(async () => success());
    vi.stubGlobal("fetch", fetchMock);

    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    await askOpenRouter(messages, { model: "google/gemini-2.5-flash-lite" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("models");

    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "none");
    await askOpenRouter(messages, { model: "google/gemini-2.5-flash-lite" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("models");
  });

  it("lets a call override the fallback list explicitly", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetchMock);

    await askOpenRouter(messages, { model: "google/gemini-2.5-flash-lite", fallbackModels: ["openai/gpt-4o-mini"] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).models).toEqual(["openai/gpt-4o-mini"]);
  });
});
