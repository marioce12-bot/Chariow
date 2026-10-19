import { splitLinks } from "@/lib/linkify";

export type AssistantTextPart = { value: string; strong: boolean };

// Render a small, safe subset of chat Markdown as React text (never raw HTML).
// Keep URLs, accents, values and meaningful punctuation intact.
const LABELS = [
  "Produit", "Lien de destination", "Plateforme", "Cible géographique", "Tranche d['’]âge",
  "Budget journalier", "Durée", "Bouton d['’]appel à l['’]action", "Appel à l['’]action",
  "Product", "Destination link", "Destination URL", "Platform", "Geographic target", "Geographic targeting",
  "Target location", "Target countries", "Age range", "Daily budget", "Duration", "Call[- ]to[- ]action(?: button)?", "CTA",
];
const LABEL = new RegExp(`^(\\s*(?:(?:[-*•]|\\d+[.)])\\s+)?)(${LABELS.join("|")})([ \\t\\u00a0\\u202f]*:)`, "i");

function inlineParts(text: string): AssistantTextPart[] {
  const parts: AssistantTextPart[] = [];
  // URLs are opaque: underscores, hashes and asterisks in them are not markup.
  let offset = 0;
  const links = splitLinks(text).flatMap((part) => {
    const start = offset;
    offset += part.value.length;
    return part.type === "link" ? [{ start, end: offset }] : [];
  });
  const pattern = /(?<!`)(`+)(?!`)([^`\r\n]+?)\1(?!`)|(\*\*\*|___|\*\*|__|\*|_)(\S(?:[^\r\n]*?\S)?)\3(?![*_])/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    if (links.some((link) => start >= link.start && start < link.end)) continue;
    // In-word underscores are identifiers, not emphasis (e.g. SHOP_NOW).
    if (match[3]?.startsWith("_") && (/[\p{L}\p{N}]/u.test(text[start - 1] ?? "") || /[\p{L}\p{N}]/u.test(text[start + match[0].length] ?? ""))) continue;
    if (start > cursor) parts.push({ value: text.slice(cursor, start), strong: false });
    const strong = !!match[3] && match[3].length >= 2;
    // Process nested emphasis, but inline code stays literal.
    const inner = match[1] ? [{ value: match[2], strong: false }] : inlineParts(match[4]);
    parts.push(...inner.map((part) => ({ ...part, strong: strong || part.strong })));
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ value: text.slice(cursor), strong: false });
  return parts;
}

export function splitAssistantText(text: string): AssistantTextPart[] {
  let fence: string | null = null;
  return text.split(/(\r\n|\n|\r)/).flatMap((line): AssistantTextPart[] => {
    if (/^(?:\r\n|\n|\r)$/.test(line)) return [{ value: line, strong: false }];
    const fenceMarker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMarker && (!fence || (fenceMarker[1][0] === fence[0] && fenceMarker[1].length >= fence.length && !fenceMarker[2].trim()))) {
      fence = fence ? null : fenceMarker[1];
      return [];
    }
    if (fence) return [{ value: line, strong: false }];
    if (/^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) return [];
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
    const visibleLine = (heading ? heading[1] : line).replace(/^(\s*)\*\s+/, "$1• ");
    const parts = inlineParts(visibleLine);
    if (heading) return parts.map((part) => ({ ...part, strong: true }));
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
