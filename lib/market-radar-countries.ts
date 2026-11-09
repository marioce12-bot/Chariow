export const MARKET_RADAR_COUNTRIES = [
  { code: "ZA", fr: "Afrique du Sud", en: "South Africa" },
  { code: "DZ", fr: "Algérie", en: "Algeria" },
  { code: "AO", fr: "Angola", en: "Angola" },
  { code: "BJ", fr: "Bénin", en: "Benin" },
  { code: "BW", fr: "Botswana", en: "Botswana" },
  { code: "BF", fr: "Burkina Faso", en: "Burkina Faso" },
  { code: "BI", fr: "Burundi", en: "Burundi" },
  { code: "CM", fr: "Cameroun", en: "Cameroon" },
  { code: "CV", fr: "Cap-Vert", en: "Cabo Verde" },
  { code: "KM", fr: "Comores", en: "Comoros" },
  { code: "CG", fr: "République du Congo", en: "Republic of the Congo" },
  { code: "CD", fr: "République démocratique du Congo", en: "Democratic Republic of the Congo" },
  { code: "CI", fr: "Côte d’Ivoire", en: "Côte d’Ivoire" },
  { code: "DJ", fr: "Djibouti", en: "Djibouti" },
  { code: "EG", fr: "Égypte", en: "Egypt" },
  { code: "ER", fr: "Érythrée", en: "Eritrea" },
  { code: "SZ", fr: "Eswatini", en: "Eswatini" },
  { code: "ET", fr: "Éthiopie", en: "Ethiopia" },
  { code: "GA", fr: "Gabon", en: "Gabon" },
  { code: "GM", fr: "Gambie", en: "The Gambia" },
  { code: "GH", fr: "Ghana", en: "Ghana" },
  { code: "GN", fr: "Guinée", en: "Guinea" },
  { code: "GW", fr: "Guinée-Bissau", en: "Guinea-Bissau" },
  { code: "GQ", fr: "Guinée équatoriale", en: "Equatorial Guinea" },
  { code: "KE", fr: "Kenya", en: "Kenya" },
  { code: "LS", fr: "Lesotho", en: "Lesotho" },
  { code: "LR", fr: "Libéria", en: "Liberia" },
  { code: "LY", fr: "Libye", en: "Libya" },
  { code: "MG", fr: "Madagascar", en: "Madagascar" },
  { code: "MW", fr: "Malawi", en: "Malawi" },
  { code: "ML", fr: "Mali", en: "Mali" },
  { code: "MA", fr: "Maroc", en: "Morocco" },
  { code: "MU", fr: "Maurice", en: "Mauritius" },
  { code: "MR", fr: "Mauritanie", en: "Mauritania" },
  { code: "MZ", fr: "Mozambique", en: "Mozambique" },
  { code: "NA", fr: "Namibie", en: "Namibia" },
  { code: "NE", fr: "Niger", en: "Niger" },
  { code: "NG", fr: "Nigeria", en: "Nigeria" },
  { code: "CF", fr: "République centrafricaine", en: "Central African Republic" },
  { code: "UG", fr: "Ouganda", en: "Uganda" },
  { code: "RW", fr: "Rwanda", en: "Rwanda" },
  { code: "ST", fr: "São Tomé-et-Príncipe", en: "São Tomé and Príncipe" },
  { code: "SN", fr: "Sénégal", en: "Senegal" },
  { code: "SC", fr: "Seychelles", en: "Seychelles" },
  { code: "SL", fr: "Sierra Leone", en: "Sierra Leone" },
  { code: "SO", fr: "Somalie", en: "Somalia" },
  { code: "SD", fr: "Soudan", en: "Sudan" },
  { code: "SS", fr: "Soudan du Sud", en: "South Sudan" },
  { code: "TZ", fr: "Tanzanie", en: "Tanzania" },
  { code: "TD", fr: "Tchad", en: "Chad" },
  { code: "TG", fr: "Togo", en: "Togo" },
  { code: "TN", fr: "Tunisie", en: "Tunisia" },
  { code: "ZM", fr: "Zambie", en: "Zambia" },
  { code: "ZW", fr: "Zimbabwe", en: "Zimbabwe" },
] as const;

export type MarketRadarCountryCode = (typeof MARKET_RADAR_COUNTRIES)[number]["code"];

export const MARKET_RADAR_FRANCOPHONE_COUNTRY_CODES = [
  "DZ", "BJ", "BF", "BI", "CM", "KM", "CG", "CD", "CF", "TD", "CI", "DJ", "GQ",
  "GA", "GN", "MG", "ML", "MA", "MR", "MU", "NE", "RW", "SN", "SC", "TG", "TN",
] as const satisfies readonly MarketRadarCountryCode[];

// Only these six markets currently use the paid Google Trends/SerpApi path.
// The other African countries remain eligible for product-fit recommendations,
// clearly marked as qualitative until local search signals are available.
export const MARKET_RADAR_SIGNAL_COUNTRY_CODES = ["BJ", "CI", "SN", "CM", "BF", "TG"] as const satisfies readonly MarketRadarCountryCode[];
export const MARKET_RADAR_SIGNAL_COUNTRIES = MARKET_RADAR_SIGNAL_COUNTRY_CODES.map((code) =>
  MARKET_RADAR_COUNTRIES.find((country) => country.code === code)!,
);

export function getMarketRadarCountry(code: string) {
  return MARKET_RADAR_COUNTRIES.find((country) => country.code === code);
}

export function getMarketRadarCountryName(code: string, locale: "fr" | "en" = "fr") {
  const country = getMarketRadarCountry(code);
  return country ? country[locale] : code;
}
