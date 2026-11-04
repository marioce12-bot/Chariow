export const TRAINING_GUIDES = [
  {
    number: "01",
    fr: "Comprendre le marché des produits digitaux",
    en: "Understand the digital-product market",
    frDescription: "Identifier une vraie demande et utiliser le Radar marché.",
    enDescription: "Identify real demand and use Market Radar.",
  },
  {
    number: "02",
    fr: "Trouver et analyser une opportunité",
    en: "Find and assess an opportunity",
    frDescription: "Passer d’une idée intéressante à une offre exploitable.",
    enDescription: "Turn a promising idea into a viable offer.",
  },
  {
    number: "03",
    fr: "Configurer son compte Meta Ads",
    en: "Set up a Meta Ads account",
    frDescription: "Préparer Business Manager, le compte publicitaire et la connexion Vendeo.",
    enDescription: "Prepare Business Manager, an ad account, and its Vendeo connection.",
  },
  {
    number: "04",
    fr: "Créer un ebook utile avec l’IA",
    en: "Create a useful ebook with AI",
    frDescription: "Planifier, rédiger et vérifier un ebook avant son export.",
    enDescription: "Plan, write, and fact-check an ebook before exporting it.",
  },
  {
    number: "05",
    fr: "Créer des visuels publicitaires efficaces",
    en: "Create effective advertising visuals",
    frDescription: "Concevoir des publicités lisibles et adaptées aux écrans mobiles.",
    enDescription: "Create clear ads designed for mobile screens.",
  },
  {
    number: "06",
    fr: "Préparer et lancer une campagne Meta Ads",
    en: "Prepare and launch a Meta Ads campaign",
    frDescription: "Préparer objectif, budget, audience et mesure avant la diffusion.",
    enDescription: "Set the objective, budget, audience, and measurement before launch.",
  },
  {
    number: "07",
    fr: "Analyser et optimiser ses performances publicitaires",
    en: "Analyze and optimize ad performance",
    frDescription: "Lire les indicateurs, calculer le ROAS et choisir une optimisation.",
    enDescription: "Read key metrics, calculate ROAS, and choose the next optimization.",
  },
] as const;

export function trainingGuideTitles(locale: "fr" | "en"): string {
  return TRAINING_GUIDES.map((guide) => (locale === "en" ? guide.en : guide.fr)).join(" ; ");
}
