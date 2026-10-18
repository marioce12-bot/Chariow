import { splitLinks } from "@/lib/linkify";

export type AssistantTextPart = { value: string; strong: boolean };

// Deliberately not a Markdown/HTML renderer: only inline strong and known summary labels.
// Keep the original strings (accents, punctuation, values and whitespace) intact.
const LABELS = [
  "Produit", "Lien de destination", "Plateforme", "Cible géographique", "Tranche d['’]âge",
  "Budget journalier", "Durée", "Bouton d['’]appel à l['’]action", "Appel à l['’]action",
  "Product", "Destination link", "Destination URL", "Platform", "Geographic target", "Geographic targeting",
  "Target location", "Target countries", "Age range", "Daily budget", "Duration", "Call[- ]to[- ]action(?: button)?", "CTA",
];
const LABEL = new RegExp(`^(\\s*(?:(?:[-*•]|\\d+[.)])\\s+)?)(${LABELS.join("|")})([ \\t\\u00a0\\u202f]*:)`, "i");

function inlineParts(text: string): AssistantTextPart[] {
  const parts: AssistantTextPart[] = [];
  // Do not interpret underscores or asterisks inside a bare URL as formatting.
  let offset = 0;
  const links = splitLinks(text).flatMap((part) => {
    const start = offset;
    offset += part.value.length;
    return part.type === "link" ? [{ start, end: offset }] : [];
  });
  const pattern = /(\*\*|__)(?=\S)([^\r\n]*?\S)\1/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    if (links.some((link) => start >= link.start && start < link.end)) continue;
    if (start > cursor) parts.push({ value: text.slice(cursor, start), strong: false });
    parts.push({ value: match[2], strong: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ value: text.slice(cursor), strong: false });
  return parts;
}

export function splitAssistantText(text: string): AssistantTextPart[] {
  return text.split(/(\r\n|\n|\r)/).flatMap((line) => {
    const parts = inlineParts(line);
    const visible = parts.map((part) => part.value).join("");
    const label = visible.match(LABEL);
    if (!label) return parts;
    // Even if the model bolds an entire summary row, only the label is emphasized.
    return [
      { value: label[1], strong: false },
      { value: label[2] + label[3], strong: true },
      { value: visible.slice(label[0].length), strong: false },
    ].filter((part) => part.value.length > 0);
  });
}
