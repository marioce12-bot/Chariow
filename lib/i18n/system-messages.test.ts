import { describe, expect, it } from "vitest";
import { profitCopy } from "./profit-copy";
import { localizeFinancialMessage, localizeSystemMessage, localizeTrackingIssue } from "./system-messages";

const financialCases = [
  ["CPA observé 250 XOF contre seuil de rentabilité 400 XOF, sur 3 vente(s) payée(s). Échantillon limité : aucune augmentation recommandée.", "Observed CPA 250 XOF versus a break-even threshold of 400 XOF, across 3 paid sale(s). Limited sample: no increase recommended."],
  ["Rentable : 1\u202f200,5 de ventes nettes pour 600 de pub. Rentabilité : 200,08 %.", "Profitable: 1,200.5 in net sales for 600 in advertising. Return on ad spend: 200.08%."],
  ["Valeur client fiable : coût par client de 200 sous le plafond de 500. La première vente n'a pas encore couvert la dépense : laisser tourner.", "Reliable customer value: cost per customer of 200 below the ceiling of 500. The first sale has not yet covered the spend: keep running."],
  ["1\u202f500 dépensés sans aucune vente confirmée. L'audience touchée ne convertit pas : la campagne brûle le budget sans rien rapporter.", "1,500 spent without any confirmed sales. The audience reached is not converting: the campaign is spending its budget without generating revenue."],
  ["Rentabilité : 30 %. 300 de ventes nettes pour 1\u202f000 de pub : la campagne coûte plus qu'elle ne rapporte.", "Return on ad spend: 30%. 300 in net sales for 1,000 in advertising: the campaign costs more than it earns."],
  ["Rentabilité de 40 %, mais dépense encore faible (100) : on attend d'avoir plus de données avant de trancher.", "Return on ad spend of 40%, but spend is still low (100): wait for more data before deciding."],
  ["Rentabilité de 90 %, proche du seuil : la campagne collecte encore des données, on la laisse tourner sous surveillance.", "Return on ad spend of 90%, close to break-even: the campaign is still collecting data; keep running and monitor it."],
  ["2 vente(s) confirmée(s) pour 300 de pub (500 brut). La campagne reste sous surveillance.", "2 confirmed sale(s) for 300 in advertising (500 gross). The campaign remains under monitoring."],
  ["Réduire : aucune vente confirmée après 1\u202f000 de dépense ; seuil CPA réel 250.", "Reduce: no confirmed sales after 1,000 in spend; actual CPA threshold 250."],
  ["CPA observé 120,5 (4 ventes confirmées) comparé au seuil de 200 fondé sur la valeur client historique réelle.", "Observed CPA 120.5 (4 confirmed sales) compared with a threshold of 200 based on actual historical customer value."],
] as const;

describe("application-authored financial explanations", () => {
  it.each(financialCases)("translates a recognized explanation and preserves its data: %s", (source, expected) => {
    expect(localizeFinancialMessage(source, "en")).toBe(expected);
    expect(localizeFinancialMessage(source, "fr")).toBe(source);
  });

  it("preserves unknown messages, names, and user-authored content verbatim", () => {
    const message = "Ma boutique française — ebook à 1 500 XOF, campagne de Marioce";
    expect(localizeFinancialMessage(message, "en")).toBe(message);
    expect(localizeSystemMessage(message, "en")).toBe(message);
    expect(localizeSystemMessage(null, "en")).toBeNull();
  });

  it("translates known server errors without changing their French display", () => {
    const source = "Dépenses ou couverture de synchronisation Meta incomplètes.";
    expect(localizeSystemMessage(source, "en")).not.toBe(source);
    expect(localizeSystemMessage(source, "fr")).toBe(source);
  });
});

describe("tracking evidence translations", () => {
  it("does not confuse an unverified pixel installation with an absent pixel", () => {
    const unknown = { code: "pixel_unknown", message: "L’installation du pixel Chariow n’a pas pu être vérifiée." };
    const absent = { code: "pixel_unknown", message: "Aucun pixel n’est déclaré comme installé sur Chariow pour ce compte." };
    expect(localizeTrackingIssue(unknown, "en")).toBe("The Chariow pixel installation could not be verified.");
    expect(localizeTrackingIssue(absent, "en")).toBe("No pixel is declared as installed on Chariow for this account.");
    expect(localizeTrackingIssue(unknown, "fr")).toBe(unknown.message);
  });

  it("covers every known tracking issue, including counts and missing attribution", () => {
    for (const [key, source] of Object.entries(profitCopy.fr)) {
      if (!key.startsWith("tracking.")) continue;
      const issue = { code: key.slice("tracking.".length), message: source.replaceAll("{count}", "12") };
      const translated = localizeTrackingIssue(issue, "en");
      expect(translated, key).not.toBe(issue.message);
      expect(translated, key).not.toContain("{count}");
      if (source.includes("{count}")) expect(translated).toContain("12");
      expect(localizeTrackingIssue(issue, "fr"), key).toBe(issue.message);
    }
  });
});
