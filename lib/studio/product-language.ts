export type ProductLanguageResolution = {
  /** BCP-47 primary language (or normalized locale fallback). */
  code: string;
  label: string;
  detected: boolean;
  confidence: "high" | "medium" | "fallback";
};

// Small, deliberately conservative function-word lexicons. This is a heuristic,
// not translation or general-purpose language identification; short text falls
// back to the supplied UI locale rather than guessing.
const WORDS: Record<string, Set<string>> = {
  en: new Set("the and with for from without is are this that your you book guide learn helps offers features product designed includes".split(" ")),
  fr: new Set("le la les des une un avec pour dans et est sont du sur sans ce cette votre vous livre guide apprendre aide offre permet produit conçu comprend".split(" ")),
  es: new Set("el la los las de una un con para en y es son sin este esta tu libro guía aprender ayuda ofrece producto incluye".split(" ")),
  de: new Set("der die das den dem des ein eine mit für von und ist sind ohne ihr buch lernen hilft bietet produkt enthält".split(" ")),
  it: new Set("il lo la gli le di un una con per in e è sono senza tuo libro guida imparare aiuta offre prodotto include".split(" ")),
  pt: new Set("o a os as de um uma com para em e é são sem seu livro guia aprender ajuda oferece produto inclui".split(" ")),
  nl: new Set("de het een en met voor van is zijn zonder uw boek gids leren helpt biedt product bevat".split(" ")),
};
for (const words of Object.values(WORDS)) {
  const normalized = [...words].map(word => word.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  words.clear(); normalized.forEach(word => words.add(word));
}

function primaryTag(locale: string): string {
  const normalized = typeof locale === "string" ? locale.trim().replace(/_/g, "-").split("-")[0]?.toLowerCase() : "fr";
  return normalized && /^[a-z]{2,3}$/.test(normalized) ? normalized : "fr";
}

const LABELS: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch" };

export function resolveProductLanguage(product: { name: string; description?: string }, fallbackLocale = "fr"): ProductLanguageResolution {
  const description = typeof product.description === "string" ? product.description : "";
  const visibleText = description.slice(0, 3000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
  const fallback = primaryTag(fallbackLocale);
  const tokens = (visibleText.toLocaleLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").match(/[a-z]+/g) ?? []);
  const fallbackResult = (): ProductLanguageResolution => ({ code: fallback, label: LABELS[fallback] ?? fallback, detected: false, confidence: "fallback" });
  // A clear script is stronger evidence than locale, but do not pretend to
  // translate it. The neutral `und` code prevents accidental French/English copy.
  if (/[\u0400-\u052f]/u.test(visibleText)) return { code: "und", label: "original language", detected: true, confidence: "medium" };
  if (/[\u0600-\u06ff\u0750-\u077f]/u.test(visibleText)) return { code: "und", label: "original language", detected: true, confidence: "medium" };
  if (/[\u0370-\u03ff]/u.test(visibleText)) return { code: "und", label: "original language", detected: true, confidence: "medium" };
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(visibleText)) return { code: "und", label: "original language", detected: true, confidence: "medium" };
  if (tokens.length < 5) return fallbackResult();
  const scores = Object.entries(WORDS).map(([language, words]) => ({ language, score: tokens.reduce((n, token) => n + (words.has(token) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  if (!best || best.score < 3 || best.score - (next?.score ?? 0) < 2) return fallbackResult();
  return { code: best.language, label: LABELS[best.language], detected: true, confidence: best.score >= 5 && best.score - (next?.score ?? 0) >= 3 ? "high" : "medium" };
}

/** Return no generated CTA for languages whose copy is not implemented. */
export function neutralProductCta(languageCode: string): string | undefined {
  const ctas: Record<string, string> = {
    en: "Discover more", fr: "Découvrir", es: "Descubre más", de: "Mehr erfahren",
    it: "Scopri di più", pt: "Saiba mais", nl: "Meer ontdekken",
  };
  return ctas[languageCode];
}
