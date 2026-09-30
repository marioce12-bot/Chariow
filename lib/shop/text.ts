// Utilitaires d'affichage : texte issu de Chariow (potentiellement du HTML) ramené à du texte brut.

export function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…` : value;
}

export function sanitizePlainText(value: string): string {
  return value
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "")
    .replace(/&gt;/gi, "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function formatPrice(price: number | string | null | undefined, currency: string | null | undefined): string | null {
  if (price === null || price === undefined || price === "") return null;
  const label = currency === "XOF" ? "FCFA" : (currency ?? "").replace(/[^A-Za-z$€£]/g, "").slice(0, 6);
  const numeric = typeof price === "number" ? price : Number(String(price).replace(/\s/g, "").replace(",", "."));
  if (Number.isFinite(numeric)) return `${numeric.toLocaleString("fr-FR")}${label ? ` ${label}` : ""}`;
  const text = clip(sanitizePlainText(String(price)), 40);
  return text || null;
}
