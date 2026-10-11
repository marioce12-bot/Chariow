import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const askGroq = vi.fn();
const askImole = vi.fn();
const askGemini = vi.fn();

vi.mock("@/lib/ai/groq", () => ({
  askGroq: (...args: unknown[]) => askGroq(...args),
  hasGroqKey: () => Boolean(process.env.GROQ_API_KEY?.trim()),
}));
vi.mock("@/lib/ai/imole", () => ({ askImole: (...args: unknown[]) => askImole(...args) }));
vi.mock("@/lib/ai/gemini", () => ({ askGemini: (...args: unknown[]) => askGemini(...args) }));

import { askText } from "@/lib/ai/text";

const messages = [{ role: "user" as const, content: "Bonjour" }];

describe("askText — cascade de fournisseurs IA texte", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    askGroq.mockReset().mockResolvedValue("réponse groq");
    askImole.mockReset().mockResolvedValue("réponse imole");
    askGemini.mockReset().mockResolvedValue("réponse gemini");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("respecte l'ordre par défaut : Groq d'abord", async () => {
    await expect(askText(messages)).resolves.toBe("réponse groq");
    expect(askGroq).toHaveBeenCalledTimes(1);
    expect(askImole).not.toHaveBeenCalled();
    expect(askGemini).not.toHaveBeenCalled();
  });

  it("respecte un ordre personnalisé : Imole, puis Groq, puis Gemini", async () => {
    await expect(askText(messages, { order: ["imole", "groq", "gemini"] })).resolves.toBe("réponse imole");
    expect(askImole).toHaveBeenCalledTimes(1);
    expect(askGroq).not.toHaveBeenCalled();

    askImole.mockRejectedValueOnce(new Error("Imole API returned 400"));
    await expect(askText(messages, { order: ["imole", "groq", "gemini"] })).resolves.toBe("réponse groq");
    expect(askGemini).not.toHaveBeenCalled();
  });

  it("bascule en cascade sur le fournisseur suivant, sans nouvelle tentative", async () => {
    askGroq.mockRejectedValue(new Error("Groq API returned 429"));
    askImole.mockRejectedValue(new Error("Imole API returned 500"));
    await expect(askText(messages)).resolves.toBe("réponse gemini");
    expect(askGroq).toHaveBeenCalledTimes(1);
    expect(askImole).toHaveBeenCalledTimes(1);
    expect(askGemini).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("traite une réponse vide comme un échec", async () => {
    askGroq.mockResolvedValue("   ");
    await expect(askText(messages)).resolves.toBe("réponse imole");
  });

  it("lève une erreur quand tous les fournisseurs échouent", async () => {
    askGroq.mockRejectedValue(new Error("timeout"));
    askImole.mockRejectedValue(new Error("401"));
    askGemini.mockRejectedValue(new Error("413"));
    await expect(askText(messages)).rejects.toThrow(/groq, imole, gemini/);
  });

  it("ignore Groq sans erreur quand GROQ_API_KEY est absente", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    await expect(askText(messages)).resolves.toBe("réponse imole");
    expect(askGroq).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
