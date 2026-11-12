import { describe, expect, it } from "vitest";
import { META_CTA_TYPES } from "@/lib/meta/cta";
import {
  LAUNCH_CALL_TO_ACTIONS,
  isAwaitingLaunchConfirmation,
  isShortLaunchConfirmation,
  parseLaunchPayload,
  serializeLaunchPayload,
  type LaunchPayload,
} from "./launch-confirmation";

const validPayload: LaunchPayload = {
  name: "Campagne de test",
  objective: "OUTCOME_SALES",
  dailyBudget: 2500,
  currency: "XOF",
  countries: ["BJ"],
  ageMin: 18,
  ageMax: 65,
  gender: null,
  interests: [],
  message: "Découvrez ce guide pratique.",
  headline: "Un guide à découvrir",
  linkUrl: "https://example.com/guide",
  durationDays: 7,
  platform: "meta",
  callToAction: "SHOP_NOW",
  storeId: "store-1",
  productId: "product-1",
  productName: "Guide pratique",
  storeName: "Boutique test",
};

describe("launch confirmation protocol", () => {
  it.each(["Lance", "Je valide", "Confirmer", "oui", "OK", "Oui, je confirme", "D’accord, lance la campagne", "Yes, launch"]) (
    "recognizes a short explicit confirmation: %s",
    (text) => expect(isShortLaunchConfirmation(text)).toBe(true),
  );

  it.each(["Lance ?", "Je valide les détails manquants et change le budget", "J'aimerais lancer une campagne", "Confirme le budget de 5000"]) (
    "does not treat a question or a longer change request as a final confirmation: %s",
    (text) => expect(isShortLaunchConfirmation(text)).toBe(false),
  );

  it("requires the latest assistant turn to request confirmation of a campaign recap", () => {
    expect(isAwaitingLaunchConfirmation([
      { role: "assistant", content: "Veuillez confirmer que toutes ces informations sont correctes pour préparer le lancement de la campagne." },
      { role: "user", content: "Lance" },
    ])).toBe(true);
    expect(isAwaitingLaunchConfirmation([
      { role: "assistant", content: "Quel budget et quelle durée souhaitez-vous pour cette campagne ?" },
    ])).toBe(false);
    expect(isAwaitingLaunchConfirmation([
      { role: "assistant", content: "Veuillez confirmer les informations." },
    ])).toBe(false);
    expect(isAwaitingLaunchConfirmation([
      { role: "assistant", content: "Quel CTA préférez-vous ?" },
      { role: "assistant", content: "Veuillez confirmer le récapitulatif de campagne." },
    ])).toBe(false);
  });

  it("accepts a complete marker-plus-JSON payload", () => {
    expect(parseLaunchPayload(`Préparation\n${serializeLaunchPayload(validPayload)}`)).toEqual(validPayload);
  });

  it.each(["ORDER_NOW", "DOWNLOAD"] as const)("accepts the %s call-to-action button", (callToAction) => {
    const payload = { ...validPayload, callToAction };
    expect(parseLaunchPayload(serializeLaunchPayload(payload))).toEqual(payload);
  });

  it("offers the same buttons as the ad wizard", () => {
    expect([...LAUNCH_CALL_TO_ACTIONS].sort()).toEqual([...META_CTA_TYPES].sort());
  });

  it.each(["DOWNLOAD", "Télécharger", "OUTCOME_DOWNLOAD", ""])(
    "ramène l'objectif invalide « %s » à OUTCOME_SALES (un bouton n'est pas un objectif)",
    (objective) => {
      const content = `[[LANCE_CAMPAGNE]]${JSON.stringify({ ...validPayload, objective, callToAction: "DOWNLOAD" })}`;
      expect(parseLaunchPayload(content)).toEqual({ ...validPayload, objective: "OUTCOME_SALES", callToAction: "DOWNLOAD" });
    },
  );

  it("ajoute OUTCOME_SALES quand l'objectif est absent", () => {
    const { objective: _objective, ...withoutObjective } = validPayload;
    expect(parseLaunchPayload(`[[LANCE_CAMPAGNE]]${JSON.stringify(withoutObjective)}`)).toEqual(validPayload);
  });

  it("conserve un objectif valide", () => {
    const payload = { ...validPayload, objective: "OUTCOME_TRAFFIC" as const };
    expect(parseLaunchPayload(serializeLaunchPayload(payload))).toEqual(payload);
  });

  it.each([
    "Réponse libre sans marqueur",
    "[[LANCE_CAMPAGNE]]{json invalide}",
    `[[LANCE_CAMPAGNE]]${JSON.stringify({ ...validPayload, countries: [] })}`,
    `[[LANCE_CAMPAGNE]]${JSON.stringify({ ...validPayload, dailyBudget: 0 })}`,
    `[[LANCE_CAMPAGNE]]${JSON.stringify({ ...validPayload, platform: "tiktok" })}`,
    `[[LANCE_CAMPAGNE]]${JSON.stringify({ ...validPayload, callToAction: "INVALID" })}`,
    `[[LANCE_CAMPAGNE]]${JSON.stringify({ ...validPayload, platform: "pinterest", callToAction: null, gender: "female" })}`,
    `[[LANCE_CAMPAGNE]]${JSON.stringify({ ...validPayload, durationDays: undefined })}`,
    `[[LANCE_CAMPAGNE]]${JSON.stringify(validPayload)} texte après le JSON`,
  ])("rejects missing or invalid structured data", (content) => {
    expect(parseLaunchPayload(content)).toBeNull();
  });

  it("rejects duplicate launch markers", () => {
    expect(parseLaunchPayload(`${serializeLaunchPayload(validPayload)} ${serializeLaunchPayload(validPayload)}`)).toBeNull();
  });
});
