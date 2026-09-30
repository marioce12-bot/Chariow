import { describe, expect, it } from "vitest";
import { readableTextOn } from "./color";
import { detectImageType } from "./logo";
import { rateLimit } from "./rate-limit";
import { buildSlugCandidates, isValidSlug, slugify } from "./slug";
import { isSubscriptionActive } from "./subscription";
import { clip, formatPrice, sanitizePlainText, safeHttpsUrl } from "./text";
import { pickTrackingParams, readVisitorId, trackingQueryString, withTrackingParams } from "./tracking";

const now = new Date("2026-09-30T12:00:00Z");

describe("slug", () => {
  it("slugifie les noms avec accents et caractères spéciaux", () => {
    expect(slugify("Boutique d'Awa é!")).toBe("boutique-d-awa-e");
    expect(slugify("  --Ça va ?--  ")).toBe("ca-va");
  });

  it("propose le slug propre puis des variantes avec suffixe aléatoire (doublons)", () => {
    const candidates = buildSlugCandidates("Boutique d'Awa");
    expect(candidates[0]).toBe("boutique-d-awa");
    expect(new Set(candidates).size).toBe(candidates.length);
    for (const candidate of candidates.slice(1)) expect(candidate).toMatch(/^boutique-d-awa-[a-z0-9]{4}$/);
    expect(candidates.every((candidate) => isValidSlug(candidate))).toBe(true);
  });

  it("remplace les noms trop courts ou réservés", () => {
    expect(buildSlugCandidates("Ab")[0]).toBe("boutique");
    expect(buildSlugCandidates("Admin")[0]).toBe("boutique");
    expect(isValidSlug("admin")).toBe(false);
    expect(isValidSlug("Mauvais Slug")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("ok-slug-2")).toBe(true);
  });
});

describe("isSubscriptionActive (même règle que requireActiveSubscription)", () => {
  it("refuse sans abonnement", () => {
    expect(isSubscriptionActive(null, now)).toBe(false);
    expect(isSubscriptionActive(undefined, now)).toBe(false);
  });

  it("accepte un essai en cours, refuse un essai expiré", () => {
    expect(isSubscriptionActive({ status: "active", trial_active: true, trial_ends_at: "2026-10-05T00:00:00Z", current_period_end: null }, now)).toBe(true);
    expect(isSubscriptionActive({ status: "active", trial_active: true, trial_ends_at: "2026-09-01T00:00:00Z", current_period_end: null }, now)).toBe(false);
  });

  it("accepte un abonnement payant actif jusqu'à la fin de période, refuse past_due ou période dépassée", () => {
    expect(isSubscriptionActive({ status: "active", trial_active: false, trial_ends_at: null, current_period_end: "2026-09-30" }, now)).toBe(true);
    expect(isSubscriptionActive({ status: "active", trial_active: false, trial_ends_at: null, current_period_end: "2026-09-29" }, now)).toBe(false);
    expect(isSubscriptionActive({ status: "past_due", trial_active: false, trial_ends_at: null, current_period_end: "2026-12-01" }, now)).toBe(false);
    expect(isSubscriptionActive({ status: "cancelled", trial_active: false, trial_ends_at: null, current_period_end: "2026-12-01" }, now)).toBe(false);
  });
});

describe("rateLimit", () => {
  it("bloque au-delà de la limite puis repart à la fenêtre suivante", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 2, 1000, 0)).toBe(false);
    expect(rateLimit(key, 2, 1000, 10)).toBe(false);
    expect(rateLimit(key, 2, 1000, 20)).toBe(true);
    expect(rateLimit(key, 2, 1000, 1500)).toBe(false);
  });
});

describe("tracking", () => {
  it("ne garde que les paramètres UTM / fbclid raisonnables", () => {
    const params = pickTrackingParams(new URLSearchParams("utm_source=fb&utm_campaign=x&foo=bar&fbclid=" + "a".repeat(300)));
    expect(params).toEqual({ utm_source: "fb", utm_campaign: "x" });
    expect(trackingQueryString(params)).toBe("utm_source=fb&utm_campaign=x");
    expect(pickTrackingParams({ utm_medium: ["cpc", "x"], utm_term: undefined })).toEqual({ utm_medium: "cpc" });
  });

  it("ajoute les UTM au lien de paiement sans écraser ceux déjà présents", () => {
    const url = withTrackingParams("https://awa.mychariow.com/p?utm_source=deja", { utm_source: "fb", utm_campaign: "promo" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("utm_source")).toBe("deja");
    expect(parsed.searchParams.get("utm_campaign")).toBe("promo");
  });

  it("lit l'identifiant visiteur dans le cookie", () => {
    expect(readVisitorId("a=1; vendeo_visitor_id=abc-123; b=2")).toBe("abc-123");
    expect(readVisitorId("vendeo_visitor_id=<script>")).toBeNull();
    expect(readVisitorId(null)).toBeNull();
  });
});

describe("logo", () => {
  it("reconnaît JPEG, PNG et WebP sur les octets, et refuse le reste (SVG, GIF, HTML)", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectImageType(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]))).toBe("image/webp");
    expect(detectImageType(new Uint8Array(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")))).toBeNull();
    expect(detectImageType(new Uint8Array(Buffer.from("GIF89a")))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});

describe("text / color", () => {
  it("ramène le HTML de Chariow à du texte brut", () => {
    expect(sanitizePlainText("<p>Bonjour&nbsp;<b>Awa</b></p><script>alert(1)</script>")).toBe("Bonjour Awa");
    expect(clip("abcdefghij", 5)).toBe("abcd…");
  });

  it("n'accepte que des images https", () => {
    expect(safeHttpsUrl("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(safeHttpsUrl("http://cdn.example.com/a.png")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("https://u:p@cdn.example.com/a.png")).toBeNull();
  });

  it("formate les prix", () => {
    expect(formatPrice(null, "XOF")).toBeNull();
    expect(formatPrice(5000, "XOF")).toMatch(/^5\s?000 FCFA$/);
    expect(formatPrice(10, "USD")).toBe("10 USD");
  });

  it("choisit un texte lisible sur la couleur principale", () => {
    expect(readableTextOn("#ffffff")).toBe("#111111");
    expect(readableTextOn("#000000")).toBe("#ffffff");
    expect(readableTextOn("#2563eb")).toBe("#ffffff");
  });
});
