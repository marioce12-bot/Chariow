import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askGroq } from "@/lib/ai/groq";

const fetchMock = vi.fn();
const messages = [{ role: "user" as const, content: "Donne un objet JSON." }];
const responseSchema = {
  name: "ugc_test",
  schema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  },
};

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "mock-key");
  vi.stubEnv("GROQ_MODEL", "");
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "{\"answer\":\"ok\"}" } }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Groq structured output", () => {
  it("sends strict JSON Schema for the configured default model, with no real network call", async () => {
    await expect(askGroq(messages, { responseSchema, timeoutMs: 100 })).resolves.toBe('{"answer":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.model).toBe("openai/gpt-oss-120b");
    expect(requestBody.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "ugc_test", strict: true, schema: responseSchema.schema },
    });
  });

  it("uses JSON object mode rather than an unsupported JSON Schema model feature", async () => {
    vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
    await askGroq(messages, { responseSchema, timeoutMs: 100 });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.response_format).toEqual({ type: "json_object" });
  });
});
