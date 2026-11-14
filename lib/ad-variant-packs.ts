import { META_CTA_TYPES, normalizeMetaCta } from "@/lib/meta/cta";

export type PackVariant = { id: string; angle: string; format: "image" | "video" | "carousel"; text: string; media: string[]; call_to_action: typeof META_CTA_TYPES[number] };
export type PackInput = {
  client_request_id: string; store_id: string; product_id: string; product_name: string;
  destination_url: string; meta_ad_account_id: string; meta_page_id: string; dsa_beneficiary: string; dsa_payor: string; countries: string[];
  geo_targeting: unknown; meta_targeting: unknown; advantage_audience: boolean; min_age: number;
  max_age: number; daily_budget: number; duration_days: number; variants: PackVariant[];
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validUrl(v: unknown) { if (typeof v !== "string" || v.length > 2048) return false; try { const u = new URL(v); return u.protocol === "https:"; } catch { return false; } }
export function validatePackInput(x: any): string | null {
  if (!x || typeof x !== "object") return "Corps invalide";
  for (const key of ["client_request_id", "store_id", "product_id", "product_name", "destination_url", "meta_ad_account_id", "meta_page_id"])
    if (typeof x[key] !== "string" || !x[key].trim() || x[key].length > 2048) return `Champ invalide: ${key}`;
  for (const key of ["dsa_beneficiary", "dsa_payor"]) if (typeof x[key] !== "string" || !x[key].trim() || x[key].length > 200) return `Nom DSA invalide: ${key}`;
  if (!uuid.test(x.store_id) || !uuid.test(x.meta_ad_account_id)) return "Identifiant store/compte invalide";
  if (!validUrl(x.destination_url)) return "URL de destination HTTPS requise";
  if (!Array.isArray(x.variants) || x.variants.length !== 3 || new Set(x.variants.map((v: any) => v?.id)).size !== 3) return "Exactement trois variantes uniques sont requises";
  for (const v of x.variants) {
    if (!v || typeof v.id !== "string" || typeof v.angle !== "string" || !v.angle.trim() || typeof v.text !== "string" || !v.text.trim() || v.text.length > 5000) return "Contenu de variante invalide";
    if (!["image", "video", "carousel"].includes(v.format) || !Array.isArray(v.media) || !v.media.every(validUrl)) return "Format ou médias invalides";
    if ((v.format === "image" || v.format === "video") && v.media.length !== 1) return "Une image ou vidéo exactement est requise";
    if (v.format === "carousel" && (v.media.length < 2 || v.media.length > 5)) return "Un carrousel doit contenir de 2 à 5 médias";
    if (!normalizeMetaCta(v.call_to_action)) return `CTA invalide (options: ${META_CTA_TYPES.join(", ")})`;
  }
  if (!Array.isArray(x.countries) || x.countries.length < 1 || x.countries.length > 50 || x.countries.some((c: any) => typeof c !== "string" || !/^[A-Z]{2}$/.test(c))) return "Pays invalides";
  if (typeof x.advantage_audience !== "boolean" || !Number.isInteger(x.min_age) || x.min_age < 18 || x.min_age > 65 || !Number.isInteger(x.max_age) || x.max_age < x.min_age || x.max_age > 65) return "Ciblage âge invalide";
  if (!Number.isFinite(x.daily_budget) || x.daily_budget < 3 || x.daily_budget > 1000000 || Math.abs(Math.round(x.daily_budget * 100) - x.daily_budget * 100) >= 0.000001 || !Number.isInteger(x.duration_days) || x.duration_days < 1 || x.duration_days > 90) return "Budget ou durée invalides";
  return null;
}
export function splitPackBudgetCents(total: number): [number, number, number] {
  if (!Number.isFinite(total) || total < 3) throw new Error("Le budget total doit être au moins 3");
  const cents = Math.round(total * 100), base = Math.floor(cents / 3), remainder = cents - base * 3;
  return [base + (remainder > 0 ? 1 : 0), base + (remainder > 1 ? 1 : 0), base];
}
export function splitPackBudget(total: number): [number, number, number] { return splitPackBudgetCents(total).map(v => v / 100) as [number, number, number]; }

export type PackCheckpoint = { campaignId?: string; adsets?: Array<string | null>; creatives?: Array<string | null>; ads?: Array<string | null>; activated?: boolean; intent?: { operation: string; index?: number; startedAt: string } | null };
export type PackAdapter = {
  claim(): Promise<boolean>;
  verify(): Promise<{ store: boolean; account: boolean; page: boolean; media: boolean; pixelCheck: "present" | "none"; pixelId?: string; exhaustivePixelList: boolean }>;
  save(checkpoints: PackCheckpoint, patch?: Record<string, unknown>): Promise<void>;
  createCampaign(input: { objective: "sales" | "traffic"; status: "PAUSED" }): Promise<string>;
  createAdSet(input: { campaignId: string; budgetCents: number; variant: PackVariant; pixelId?: string }): Promise<string>;
  createCreative(input: { variant: PackVariant; pageId: string }): Promise<string>;
  createAd(input: { adsetId: string; creativeId: string }): Promise<string>;
  activateParent(campaignId: string): Promise<void>;
};
/** Single attempt only. Any exception (including persistence or timeout) leaves the claim blocking future calls. */
export async function launchPack(input: { pack: PackInput; pageId: string; adapter: PackAdapter }): Promise<PackCheckpoint> {
  const { pack, adapter } = input;
  if (await adapter.claim() !== true) throw new Error("Pack déjà réclamé; aucun nouvel essai autorisé");
  let cp: PackCheckpoint = { adsets: [null, null, null], creatives: [null, null, null], ads: [null, null, null] };
  let preflightComplete = false;
  try {
    const verified = await adapter.verify();
    if (!verified.store || !verified.account || !verified.page || !verified.media || !verified.exhaustivePixelList || (verified.pixelCheck === "present" && !verified.pixelId)) throw new Error("Vérifications boutique/compte/page/médias/pixels non concluantes; bloqué avant création");
    const objective = verified.pixelCheck === "none" ? "traffic" : "sales";
    if (objective === "sales" && !verified.pixelId) throw new Error("Pixel non vérifié");
    const cents = splitPackBudgetCents(pack.daily_budget);
    preflightComplete = true;
    cp.intent = { operation: "createCampaign", startedAt: new Date().toISOString() };
    await adapter.save(cp);
    cp.campaignId = await adapter.createCampaign({ objective, status: "PAUSED" });
    cp.intent = null;
    await adapter.save(cp, { objective, external_campaign_id: cp.campaignId });
    for (let i = 0; i < 3; i++) {
      const adsets = cp.adsets!, creatives = cp.creatives!, ads = cp.ads!;
      cp.intent = { operation: "createAdSet", index: i, startedAt: new Date().toISOString() }; await adapter.save(cp);
      adsets[i] = await adapter.createAdSet({ campaignId: cp.campaignId, budgetCents: cents[i], variant: pack.variants[i], ...(verified.pixelId ? { pixelId: verified.pixelId } : {}) });
      cp.intent = null;
      await adapter.save(cp);
      cp.intent = { operation: "createCreative", index: i, startedAt: new Date().toISOString() }; await adapter.save(cp);
      creatives[i] = await adapter.createCreative({ variant: { ...pack.variants[i], call_to_action: normalizeMetaCta(pack.variants[i].call_to_action)! }, pageId: input.pageId });
      cp.intent = null;
      await adapter.save(cp);
      cp.intent = { operation: "createAd", index: i, startedAt: new Date().toISOString() }; await adapter.save(cp);
      ads[i] = await adapter.createAd({ adsetId: adsets[i]!, creativeId: creatives[i]! });
      cp.intent = null;
      await adapter.save(cp);
    }
    if (!cp.campaignId || cp.adsets!.some(x => !x) || cp.creatives!.some(x => !x) || cp.ads!.some(x => !x)) throw new Error("Enfants incomplets; parent laissé en pause");
    cp.intent = { operation: "activateParent", startedAt: new Date().toISOString() }; await adapter.save(cp);
    await adapter.activateParent(cp.campaignId);
    cp.activated = true;
    cp.intent = null;
    await adapter.save(cp, { status: "completed" });
    return cp;
  } catch (e) {
    // Persistence failure is itself ambiguous: best-effort block marker, never retry any side effect.
    const message = e instanceof Error ? e.message.slice(0, 500) : "Erreur inconnue";
    try { await adapter.save(cp, preflightComplete ? { status: "ambiguous", last_error: message } : { status: "blocked", last_error: `Échec du préflight; rien n’a été créé. ${message}` }); } catch { /* durable claim remains blocking */ }
    throw e;
  }
}
export function packProgress(checkpoints: PackCheckpoint | null | undefined, status?: string | null): number {
  const c = checkpoints ?? {};
  if (c.activated === true && status === "completed") return 100;
  const count = [Boolean(c.campaignId), ...(c.adsets ?? []).map(Boolean), ...(c.creatives ?? []).map(Boolean), ...(c.ads ?? []).map(Boolean)].filter(Boolean).length;
  return Math.floor(count / 10 * 99);
}
