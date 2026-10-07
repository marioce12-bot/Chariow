"use client";

import { FaFacebookF, FaInstagram, FaLinkedinIn, FaPinterestP, FaTiktok, FaWhatsapp, FaXTwitter } from "react-icons/fa6";
import type { AdPlatform } from "@/lib/plans";

export const SESSION_STORAGE_PROMPT_KEY = "vendeo_ai_prompt";
export const DASHBOARD_CACHE_KEY = "vendeo_dashboard_cache_v1";
export const ADS_CACHE_KEY = "vendeo_ads_cache_v1";

// Petit cache en sessionStorage : permet d'afficher instantanément les dernières
// données connues au lieu d'un écran "Chargement…" à chaque changement de section,
// pendant qu'une version fraîche est récupérée silencieusement en arrière-plan.
export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible (navigation privée, quota plein…) — on ignore simplement.
  }
}


export function MetricHelp({ label, description }: { label: string; description: string }) {
  return <span className="metric-label">{label}<button type="button" className="metric-help" aria-label={`Explication : ${label}`} title={description} onClick={(event) => { event.preventDefault(); event.stopPropagation(); window.alert(description); }}>?</button></span>;
}

// Logo Google officiel (marque "G" multicolore) — utilisé tel quel par Google dans ses boutons de connexion.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1818l-2.9087-2.2581c-.8064.54-1.8377.8591-3.0477.8591-2.3446 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853" />
      <path d="M3.9641 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z" fill="#FBBC05" />
      <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6555 3.5795 9 3.5795z" fill="#EA4335" />
    </svg>
  );
}

// Badges avec les vrais logos officiels de chaque canal publicitaire (react-icons/fa6 + marque Google).
export function ChannelBadge({ id }: { id: AdPlatform }) {
  if (id === "facebook") {
    return (
      <span className="channel-badge channel-badge-duo" aria-label="Facebook et Instagram">
        <span className="channel-badge facebook"><FaFacebookF size={16} /></span>
        <span className="channel-badge instagram"><FaInstagram size={15} /></span>
      </span>
    );
  }
  if (id === "tiktok") return <span className="channel-badge tiktok" aria-label="TikTok"><FaTiktok size={16} /></span>;
  if (id === "x") return <span className="channel-badge linkedin" aria-label="X"><FaXTwitter size={16} /></span>;
  if (id === "whatsapp") return <span className="channel-badge whatsapp" aria-label="WhatsApp"><FaWhatsapp size={17} /></span>;
  if (id === "pinterest") return <span className="channel-badge pinterest" aria-label="Pinterest"><FaPinterestP size={16} /></span>;
  if (id === "linkedin") return <span className="channel-badge linkedin" aria-label="LinkedIn"><FaLinkedinIn size={16} /></span>;
  if (id === "google") return <span className="channel-badge google" aria-label="Google"><GoogleLogo /></span>;
  return null;
}

export type StoreData = {
  id: string;
  slug?: string;
  platform: string;
  store_name: string;
  mcp_url: string | null;
  is_active: boolean;
  connection_status?: string;
  connection_error?: string | null;
  logo_url?: string | null;
  image?: string | null;
};

export type SubscriptionData = {
  plan: "starter";
  messages_used_this_month: number;
  messages_limit: number;
  free_messages_used: number;
  free_messages_limit: number;
  status: string;
  trial_active?: boolean;
  trial_ends_at?: string;
  current_period_start?: string;
  current_period_end?: string;
};

export type ProductData = { id: string; name: string; description: string | null; price: number | string | null; currency: string | null; status: string | null; image: string | null; url?: string | null; createdAt: string | null; sales: number | null };
export type AnalyticsData = {
  storeName: string;
  storeStatus: string;
  products: ProductData[];
  sales: unknown[];
  kpis: { period: { from: string | null; to: string | null }; revenue: { value: number | string | null; formatted: string | null }; revenueByCurrency?: Array<{ currency: string; value: number }>; sales: number; visits: number; conversionRate: string; customers: number; productsSold: number };
} | null;

function subscriptionLimitFromStores(stores: StoreData[]) {
  // The API remains the source of truth for enforcement. This fallback keeps
  // the visible counter useful before the subscription response is loaded.
  return 3;
}

