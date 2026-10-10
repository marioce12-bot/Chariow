import type { Locale } from "./locales";
import { isPinterestConversionTagError, pinterestTagShortMessage } from "@/lib/pinterest/tag-help";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function getTargetCountryCodes(raw: string): string[] {
  const match = raw.match(/(?:cibler|target(?:ing)?|countries)[\s\S]{0,120}?[:：]\s*((?:[A-Z]{2})(?:\s*,\s*[A-Z]{2})*)/i);
  return match?.[1]?.split(",").map((code) => code.trim().toUpperCase()).filter(Boolean) ?? [];
}

function countryNames(codes: string[], locale: Locale): string {
  const names = codes.map((code) => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  });
  return names.join(locale === "fr" ? " et " : " and ");
}

/**
 * Turn provider/API and persisted campaign errors into customer-friendly copy.
 * The raw value stays available in server storage for diagnosis, but should not
 * be rendered directly in the product UI.
 */
export function campaignErrorMessage(rawError: string | null | undefined, locale: Locale, t: Translate, platform: "meta" | "tiktok" | "pinterest" = "tiktok"): string {
  const platformLabel = platform === "meta" ? "Meta" : platform === "pinterest" ? "Pinterest" : "TikTok";
  const raw = (rawError ?? "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return t("ads.errors.generic");

  // Pinterest : objectif Ventes refusé faute de balise Pinterest avec conversions.
  // Testé avant les autres règles (le message d'origine contient « conversion »).
  if (platform === "pinterest" && isPinterestConversionTagError(raw)) {
    return pinterestTagShortMessage(locale);
  }

  // Older campaigns may still contain this provider response in external_error.
  if (/objective_type|website_conversions|web_conversions|invalid objective/.test(lower)) {
    return t("ads.errors.objective");
  }

  if (/complete payment to continue|payment.{0,45}(required|due|incomplete|not complete)|billing.{0,45}(incomplete|overdue|not complete)|outstanding balance/.test(lower)) {
    return t("ads.errors.billing", { platform: platformLabel });
  }

  const codes = getTargetCountryCodes(raw);
  if (codes.length && /cibler|target|country|countries|pays|diffusion/.test(lower)) {
    return t("ads.errors.countries", { countries: countryNames(codes, locale), platform: platformLabel });
  }
  if (/diffusion dans les pays|targeting.{0,20}(not allowed|unavailable|unsupported)|countries?.{0,30}(not allowed|unavailable|unsupported)/.test(lower)) {
    return t("ads.errors.countriesUnavailable");
  }

  if (/pixel/.test(lower)) {
    // Meta : message simple et actionnable (aucun pixel sur le compte pub).
    if (platform === "meta") {
      return locale === "fr"
        ? "Aucun pixel n’est configuré sur ce compte publicitaire. Ta campagne peut donner de moins bons résultats. Pour l’améliorer, prends le pixel de ton compte publicitaire Meta et ajoute-le dans ta boutique Chariow, puis réessaie."
        : "No pixel is set up on this ad account. Your campaign may perform worse. To improve it, take the pixel from your Meta ad account and add it to your Chariow store, then try again.";
    }
    return t("ads.errors.pixel", { platform: platformLabel });
  }
  if (/page facebook|facebook page|page_id/.test(lower)) {
    return locale === "fr"
      ? "Choisis la page Facebook qui publiera ta pub, puis relance la campagne."
      : "Choose the Facebook page that will publish your ad, then launch the campaign again.";
  }
  if (/identity|identité|identity_id/.test(lower)) return t("ads.errors.identity", { platform: platformLabel });
  if (/daily budget|daily_budget|minimum budget|budget.{0,80}(minimum|too low|below)|budget quotidien/.test(lower)) {
    return t("ads.errors.budget", { platform: platformLabel });
  }
  if (/select.{0,20}(meta|tiktok)?.{0,12}account|choisis?.{0,30}compte|sélectionne.{0,30}compte/.test(lower)) {
    return t("ads.errors.chooseAccount", { platform: platformLabel });
  }
  if (/no longer active|not active|inactive|n’est plus actif|n'est plus actif/.test(lower)) {
    return t("ads.errors.inactiveAccount", { platform: platformLabel });
  }
  if (/permission|oauth|unauthori[sz]ed|access denied|forbidden|\(#200\)/.test(lower)) {
    return t("ads.errors.permission", { platform: platformLabel });
  }
  if (/token|expired|reconnect|connection.{0,20}(failed|lost)|connexion.{0,20}(expir|perdu)/.test(lower)) {
    return t("ads.errors.connection", { platform: platformLabel });
  }
  if (/policy|disapprov|prohibited|community guidelines|règles publicitaires|regles publicitaires/.test(lower)) {
    return t("ads.errors.policy", { platform: platformLabel });
  }
  if (/ajoute.{0,30}(image|vidéo|video)|add.{0,30}(image|video)|creative|media upload/.test(lower)) {
    return t("ads.errors.creative", { platform: platformLabel });
  }

  // Never show an unrecognized technical response verbatim to a customer.
  return t("ads.errors.generic", { platform: platformLabel });
}
