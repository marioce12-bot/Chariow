import { describe, expect, it } from "vitest";
import { LAUNCH_TAG, isRecapAwaitingApproval, parseLaunchPayload } from "../lib/chat/launch-confirmation";

const basePayload = {
  name: "Campagne test",
  objective: "OUTCOME_SALES",
  dailyBudget: 10,
  currency: "EUR",
  countries: ["FR", "CI"],
  ageMin: 18,
  ageMax: 40,
  gender: null,
  interests: ["IA"],
  message: "Texte",
  headline: "Titre",
  linkUrl: "https://example.com/p",
  durationDays: 30,
  platform: "meta",
  callToAction: "GET_OFFER",
  storeId: "store-1",
  productId: "prod-1",
  productName: "Produit",
  storeName: "Boutique",
};

function tagged(overrides: Record<string, unknown> = {}) {
  return `${LAUNCH_TAG}${JSON.stringify({ ...basePayload, ...overrides })}`;
}

describe("parseLaunchPayload", () => {
  it("tronque à 5 les centres d'intérêt au lieu de rejeter le lancement", () => {
    const interests = ["IA", "Business en ligne", "Marketing digital", "Création de contenu", "Entrepreneuriat", "Productivité numérique", "Revenus en ligne"];
    const payload = parseLaunchPayload(tagged({ interests }));
    expect(payload).not.toBeNull();
    expect(payload?.interests).toEqual(interests.slice(0, 5));
  });

  it("rejette toujours un JSON réellement invalide", () => {
    expect(parseLaunchPayload(`${LAUNCH_TAG}{pas du json}`)).toBeNull();
    expect(parseLaunchPayload(tagged({ dailyBudget: -1 }))).toBeNull();
  });
});

describe("isRecapAwaitingApproval", () => {
  const recap = "Voici le récapitulatif de la campagne : Produit TOUTES LES IA, Budget 10 EUR, Durée 150 jours, Pays FR, CI, Âge 18 à 40 ans, Plateforme Meta.";

  it("détecte un récapitulatif sans mot-clé de validation précis", () => {
    expect(isRecapAwaitingApproval([{ role: "assistant", content: recap }])).toBe(true);
  });

  it("ne se déclenche pas pendant le questionnaire", () => {
    expect(isRecapAwaitingApproval([{ role: "assistant", content: "Quel budget et quelle durée pour ta campagne ?" }])).toBe(false);
  });

  it("ne se déclenche pas après l'émission du tag", () => {
    expect(isRecapAwaitingApproval([{ role: "assistant", content: tagged() }])).toBe(false);
  });

  it("ignore un historique vide", () => {
    expect(isRecapAwaitingApproval([])).toBe(false);
    expect(isRecapAwaitingApproval(null)).toBe(false);
  });
});
