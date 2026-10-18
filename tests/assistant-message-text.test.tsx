import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AssistantMessageText } from "@/components/AssistantMessageText";
import { LinkifiedText } from "@/components/LinkifiedText";
import { splitAssistantText } from "@/lib/assistant-text";
import { cleanAiText } from "@/lib/ai/format";

const render = (text: string) => renderToStaticMarkup(<AssistantMessageText text={text} />);
const plain = (text: string) => splitAssistantText(text).map((part) => part.value).join("");

describe("assistant message emphasis", () => {
  it.each([
    "Produit", "Lien de destination", "Plateforme", "Cible géographique", "Tranche d’âge",
    "Tranche d'âge", "Budget journalier", "Durée", "Bouton d’appel à l’action",
    "Product", "Destination link", "Destination URL", "Platform", "Geographic target",
    "Target location", "Age range", "Daily budget", "Duration", "Call-to-action button", "CTA",
  ])("emphasizes only the %s label", (label) => {
    expect(render(`${label} : Valeur normale`)).toContain(`<strong>${label.replaceAll("'", "&#x27;")} :</strong> Valeur normale`);
  });

  it("preserves the complete French summary and whitespace", () => {
    const text = "Résumé de campagne\r\n\r\n  Produit : Crée ton SAAS de A à Z (Boutique Scale-X)\r\nLien de destination : https://mfhvijef.mychariow.shop/prd_se4zdyja\r\nPlateforme : Meta (Facebook & Instagram)\r\nCible géographique : Côte d’Ivoire et RD Congo\r\nTranche d’âge : 18 à 65 ans\r\nBudget journalier : 4 USD par jour (soit 12 USD sur 3 jours)\r\nDurée : 3 jours\r\nBouton d’appel à l’action : Acheter";
    expect(plain(text)).toBe(text);
    const html = render(text);
    expect(html.match(/<strong>/g)).toHaveLength(8);
    expect(html).toContain('href="https://mfhvijef.mychariow.shop/prd_se4zdyja"');
    expect(html).not.toContain("<strong>4 USD");
    expect(html).not.toContain("<strong>Crée");
  });

  it.each(["- ", "• ", "1. ", "2) "])("preserves list prefix %s", (prefix) => {
    expect(render(`${prefix}Daily budget: 4 USD`)).toContain(`${prefix}<strong>Daily budget:</strong> 4 USD`);
  });

  it.each(["**Produit** : Livre", "**Produit :** Livre", "__Produit__ : Livre", "__Produit :__ Livre"])("handles existing label markup: %s", (text) => {
    expect(render(text)).toContain("<strong>Produit :</strong> Livre");
    expect(render(text)).not.toContain("**");
    expect(render(text)).not.toContain("__");
  });

  it.each(["**Daily budget: 4 USD**", "Daily budget: **4 USD**", "**Daily budget:** **4 USD**"])("keeps summary values normal even with model markup: %s", (text) => {
    expect(render(text)).toContain("<strong>Daily budget:</strong> 4 USD");
    expect(render(text)).not.toContain("<strong>4 USD");
  });

  it("preserves French non-breaking spaces", () => {
    expect(render("Budget journalier\u202f: 4 USD")).toContain("<strong>Budget journalier\u202f:</strong> 4 USD");
  });

  it("supports inline keywords and links without HTML interpretation", () => {
    const html = render('Voici **important** et __utile__, **https://example.com/p**. <img src=x onerror=alert(1)> <script>alert(1)</script>');
    expect(html).toContain("<strong>important</strong>");
    expect(html).toContain("<strong>utile</strong>");
    expect(html).toContain('<strong><a class="chat-link" href="https://example.com/p"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(render("javascript:alert(1)")).not.toContain("<a");
  });

  it("does not interpret URL characters or ordinary prose as formatting", () => {
    const text = "https://example.com/prd__abc__def https://example.com/a**b**c\nLe Produit : Livre\nDuration of this campaign is three days.\nBudget journalier estimé : 4 USD";
    expect(plain(text)).toBe(text);
    expect(render(text)).not.toContain("<strong>");
  });

  it.each(["**inachevé…", "__unfinished…", "****", "____", "** **", "**a\nb**"])("keeps unsupported or truncated text literal: %s", (text) => {
    expect(plain(text)).toBe(text);
  });

  it("keeps user text on the unformatted renderer and all existing actions outside the text", () => {
    const source = readFileSync(new URL("../components/ChatView.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/\{isAssistant \? \(\s*<AssistantMessageText[^]*?\) : \(\s*<LinkifiedText/);
    expect(renderToStaticMarkup(<LinkifiedText text="Produit : **Livre**" />)).toBe("Produit : **Livre**");
    expect(source).toContain("copyMessage(index, content)");
    expect(source).toContain("openLaunchConfirm(launchPayload, launchMedia)");
    expect(source).toContain("<LaunchProgress complete={launchComplete} />");
    expect(source).toContain('!expanded && isLong ? "chat-message-preview" : undefined');
  });

  it("preserves bold only when explicitly requested by the chat cleanup", () => {
    expect(cleanAiText("```text\n**important**\n```", { preserveStrong: true })).toBe("**important**");
    expect(cleanAiText("**important**")).toBe("important");
    expect(render(cleanAiText("**Important** : voici **un conseil**.", { preserveStrong: true }))).toContain("<strong>un conseil</strong>");
  });
});
