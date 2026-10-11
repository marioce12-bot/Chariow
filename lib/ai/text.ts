import { askGemini } from "@/lib/ai/gemini";
import { askGroq, hasGroqKey, type TextMessage } from "@/lib/ai/groq";
import { askImole } from "@/lib/ai/imole";

export type TextProvider = "groq" | "imole" | "gemini";

const DEFAULT_ORDER: TextProvider[] = ["groq", "imole", "gemini"];

const PROVIDERS: Record<TextProvider, (messages: TextMessage[]) => Promise<string>> = {
  groq: (messages) => askGroq(messages),
  imole: (messages) => askImole(messages),
  gemini: (messages) => askGemini(messages),
};

// Génération de texte avec secours en cascade. Toute erreur d'un fournisseur (400, 401, 413,
// 429, 5xx, timeout, réponse vide…) fait passer immédiatement au suivant, sans nouvelle
// tentative. Groq est ignoré sans bruit quand GROQ_API_KEY n'est pas configurée.
export async function askText(messages: TextMessage[], options: { order?: TextProvider[] } = {}) {
  const order = Array.from(new Set(options.order?.length ? options.order : DEFAULT_ORDER));
  const failures: string[] = [];

  for (const provider of order) {
    if (provider === "groq" && !hasGroqKey()) continue;
    try {
      const answer = await PROVIDERS[provider](messages);
      if (answer?.trim()) return answer.trim();
      throw new Error("empty response");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`AI text provider error (${provider})`, message);
      failures.push(provider);
    }
  }

  throw new Error(
    failures.length
      ? `Tous les fournisseurs IA texte ont échoué (${failures.join(", ")})`
      : "Aucun fournisseur IA texte n'est disponible",
  );
}
