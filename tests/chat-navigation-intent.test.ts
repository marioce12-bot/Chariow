import { describe, expect, it } from "vitest";
import { CHAT_NAVIGATION_TARGETS, resolveChatNavigationForAssistantReply, resolveChatNavigationRequest } from "@/components/chat/navigation-intent";

describe("Assistant navigation requests", () => {
  it.each([
    ["Où voir les rapports ?", "Rapports"],
    ["Comment lancer les relances WhatsApp ?", "Relances WhatsApp"],
    ["Where can I view my campaigns?", "Performance publicitaire"],
    ["Où consulter les recommandations ?", "Performance publicitaire"],
    ["Où créer une publicité ?", "Pub"],
    ["Montre-moi mes visuels", "Studio"],
    ["Where do I manage ad accounts?", "Comptes publicitaires"],
    ["Où retrouver les paramètres ?", "Paramètres"],
  ])("maps %s to the exact internal section", (question, section) => {
    expect(resolveChatNavigationRequest(question)?.section).toBe(section);
  });

  it("keeps Assistant and Recommendation labels and has no Visuals destination", () => {
    expect(CHAT_NAVIGATION_TARGETS.find((entry) => entry.section === "Vendeo AI")).toMatchObject({ labelFr: "Assistant", routeLabelFr: "Assistant" });
    expect(CHAT_NAVIGATION_TARGETS.find((entry) => entry.section === "Performance publicitaire")).toMatchObject({ labelFr: "Recommandation", routeLabelFr: "Recommandation" });
    expect(CHAT_NAVIGATION_TARGETS.some((entry) => /visuel|visual/i.test(`${entry.section} ${entry.labelFr} ${entry.labelEn}`))).toBe(false);
  });

  it.each([
    "Combien ai-je dépensé en publicités ?",
    "How much did I spend on ads?",
    "Quels sont mes rapports cette semaine ?",
    "Combien reste-t-il sur mon abonnement ?",
    "Bonjour, peux-tu analyser mes ventes ?",
  ])("does not add a navigation destination to ordinary help/data requests: %s", (question) => {
    expect(resolveChatNavigationRequest(question)).toBeNull();
  });

  it("attaches a destination to the matching assistant reply, not to a user message or unrelated turn", () => {
    const conversation = [
      { role: "user", content: "Où consulter les rapports ?" },
      { role: "assistant", content: "Tu peux y accéder ici." },
      { role: "assistant", content: "Autre réponse." },
    ];
    expect(resolveChatNavigationForAssistantReply(conversation, 0)).toBeNull();
    expect(resolveChatNavigationForAssistantReply(conversation, 1)?.section).toBe("Rapports");
    expect(resolveChatNavigationForAssistantReply(conversation, 2)).toBeNull();
  });
});
