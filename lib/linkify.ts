export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

// http(s)://… ou www.… ; un lien s'arrête à l'espace suivant OU avant le « https:// » suivant
// (cas de deux liens collés l'un à l'autre sans séparateur).
const URL_PATTERN = /(?:https?:\/\/|(?<![\w.@/-])www\.)(?:(?!https?:\/\/)[^\s<>"'`])+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»…"'’]+$/;

// Découpe un texte en morceaux de texte et en liens cliquables. Seuls les liens http/https sont reconnus.
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const value = match[0].replace(TRAILING_PUNCTUATION, "");
    const href = value.toLowerCase().startsWith("www.") ? `https://${value}` : value;
    let valid = false;
    try {
      const url = new URL(href);
      valid = (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
    } catch {
      valid = false;
    }
    if (!valid) continue;
    if (start > cursor) parts.push({ type: "text", value: text.slice(cursor, start) });
    parts.push({ type: "link", value, href });
    cursor = start + value.length;
  }
  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor) });
  return parts;
}
