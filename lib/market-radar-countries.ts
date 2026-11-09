export const MARKET_RADAR_COUNTRIES = [
  { code: "BJ", fr: "Bénin", en: "Benin" },
  { code: "CI", fr: "Côte d’Ivoire", en: "Côte d’Ivoire" },
  { code: "SN", fr: "Sénégal", en: "Senegal" },
  { code: "CM", fr: "Cameroun", en: "Cameroon" },
  { code: "BF", fr: "Burkina Faso", en: "Burkina Faso" },
  { code: "TG", fr: "Togo", en: "Togo" },
] as const;

export type MarketRadarCountryCode = (typeof MARKET_RADAR_COUNTRIES)[number]["code"];

export function getMarketRadarCountry(code: string) {
  return MARKET_RADAR_COUNTRIES.find((country) => country.code === code);
}

export function getMarketRadarCountryName(code: string, locale: "fr" | "en" = "fr") {
  const country = getMarketRadarCountry(code);
  return country ? country[locale] : code;
}
