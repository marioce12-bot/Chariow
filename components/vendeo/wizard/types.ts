// components/vendeo/wizard/types.ts

export type Platform = "meta" | "tiktok";
export type Objective = "sales" | "traffic" | "engagement" | "leads";
// "whatsapp_status" n'est valable que pour platform === "meta" : les pubs dans
// le Statut WhatsApp sont un placement de Meta Ads, pas un réseau à part (pas
// de compte à connecter en plus — voir Step2NetworkCreative pour le détail).
export type Placement = "auto" | "whatsapp_status";

export interface ChariowProductLite {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  currency: string | null;
  image: string | null;
  url?: string | null;
}

export interface WizardState {
  // Étape 1
  storeId: string | null;
  product: ChariowProductLite | null;

  // Étape 2
  platform: Platform;
  objective: Objective;
  placement: Placement;
  mediaUrl: string;
  adText: string;
  title: string;
  destinationUrl: string;
  // Comptes déjà connectés (à fournir par le parent, cf. INTEGRATION_WIZARD.md)
  metaAdAccountId?: string;
  metaPageId?: string;
  tiktokAdAccountId?: string;
  tiktokIdentityId?: string;
  tiktokIdentityType?: string;

  // Étape 3
  countries: string[];
  minAge: number;
  maxAge: number;

  // Étape 4
  dailyBudget: number; // budget net qui alimente réellement la campagne (XOF/jour)
  durationDays: number;

  // Rempli après création du brouillon (étape 4 → étape 5)
  campaignId: string | null;
}

export const DEFAULT_WIZARD_STATE: WizardState = {
  storeId: null,
  product: null,
  platform: "meta",
  objective: "sales",
  placement: "auto",
  mediaUrl: "",
  adText: "",
  title: "",
  destinationUrl: "",
  countries: ["BJ"],
  minAge: 18,
  maxAge: 45,
  dailyBudget: 2000,
  durationDays: 5,
  campaignId: null,
};

export interface EstimateResult {
  reachMin: number;
  reachMax: number;
  impressionsMin: number;
  impressionsMax: number;
  grossBudget: number; // ce qui sera débité (net / 0.98)
  netAdBudget: number; // ce qui alimente réellement la campagne pub
  vendeoCommission: number; // 2% (approx, sur le montant brut)
}

export const COUNTRY_OPTIONS = [
  { code: "BJ", label: "Bénin" },
  { code: "TG", label: "Togo" },
  { code: "CI", label: "Côte d'Ivoire" },
  { code: "SN", label: "Sénégal" },
  { code: "BF", label: "Burkina Faso" },
  { code: "ML", label: "Mali" },
  { code: "NE", label: "Niger" },
  { code: "GH", label: "Ghana" },
  { code: "NG", label: "Nigeria" },
];
