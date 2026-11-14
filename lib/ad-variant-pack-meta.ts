import type { PackAdapter, PackInput, PackVariant } from "@/lib/ad-variant-packs";
import { decryptSecret } from "@/lib/crypto";
import { META_GRAPH_BASE_URL } from "@/lib/meta/api";
import { fetchMetaGraph, createMetaGraphError } from "@/lib/meta/graph";
import { ownStudioPathFromUrl, detectMetaImageType, isOwnCloudinaryUrl } from "@/lib/meta/ad-image";
import { buildMetaAudienceFields, sanitizeMetaTargeting } from "@/lib/ad-campaigns/meta-targeting";
import { META_CTA_TYPES, normalizeMetaCta } from "@/lib/meta/cta";
import { buildCarouselObjectStorySpec } from "@/lib/meta/carousel";
import { prepareMetaCreativeVideo, createMetaVideoCreative } from "@/lib/meta/ad-video";

type Context = { supabase: any; userId: string; pack: PackInput };
type Auth = { accountId: string; token: string; pageToken: string; pixelId?: string; objective: "sales" | "traffic" };
const graph = (id: string, fields: string, token: string) => { const u = new URL(`${META_GRAPH_BASE_URL}/${id}`); u.searchParams.set("fields", fields); u.searchParams.set("access_token", token); return u; };
async function readJson(response: Response) { return response.json().catch(() => ({})) as Promise<Record<string, any>>; }
async function get(id: string, fields: string, token: string) {
  const r = await fetchMetaGraph(graph(id, fields, token)); const j = await readJson(r);
  if (!r.ok || j.error) throw createMetaGraphError(j.error, r.status, `Graph GET ${id} échoué`); return j;
}
async function post(id: string, params: Record<string, string>, token: string, allowSuccess = false) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const r = await fetchMetaGraph(`${META_GRAPH_BASE_URL}/${id}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await readJson(r);
  if (!r.ok || j.error || (allowSuccess ? j.success !== true : typeof j.id !== "string" || !j.id)) throw createMetaGraphError(j.error, r.status, `Graph POST ${id} échoué`);
  return (typeof j.id === "string" ? j.id : "") as string;
}
function accountNode(id: string) { return id.startsWith("act_") ? id : `act_${id}`; }
function validHttps(raw: string) { try { const u = new URL(raw); return u.protocol === "https:" && !u.username && !u.password && !u.port; } catch { return false; } }
function checkedNext(raw: unknown, host: string): string | null { if (raw == null) return null; if (typeof raw !== "string") throw new Error("Pagination Meta invalide"); const u = new URL(raw); if (u.protocol !== "https:" || u.hostname !== host || u.port || u.username || u.password) throw new Error("URL de pagination Meta non autorisée"); return u.toString(); }
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
function cloudinaryVideoUrl(raw: string, cloud: string | undefined) { try { const u = new URL(raw); return !!cloud && u.protocol === "https:" && u.hostname === "res.cloudinary.com" && !u.port && !u.username && !u.password && u.pathname.startsWith(`/${cloud}/video/upload/`); } catch { return false; } }
async function readBounded(response: Response): Promise<Uint8Array> { if (!response.ok || (Number(response.headers.get("content-length")) > MAX_BYTES)) throw new Error("Média distant inaccessible ou trop volumineux"); const reader=response.body?.getReader(); if(!reader) throw new Error("Corps média absent"); const chunks:Uint8Array[]=[];let n=0;for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>MAX_BYTES){await reader.cancel();throw new Error("Média trop volumineux");}chunks.push(value);}const out=new Uint8Array(n);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out; }

function buildPackTargeting(pack: PackInput): Record<string, unknown> {
  const raw = pack.geo_targeting;
  if (raw !== null && raw !== undefined && (typeof raw !== "object" || Array.isArray(raw))) throw new Error("Ciblage géographique invalide");
  const geo = (raw ?? {}) as Record<string, unknown>;
  const hasExplicitGeo = Object.keys(geo).length > 0;
  if (Object.keys(geo).some((key) => !["countries", "regions", "cities"].includes(key))) throw new Error("Champ géographique non pris en charge");
  const countries = hasExplicitGeo ? (geo.countries ?? []) : pack.countries;
  const regions = geo.regions ?? [];
  const cities = geo.cities ?? [];
  if (!Array.isArray(countries) || countries.length > 50 || countries.some((c) => typeof c !== "string" || !/^[A-Z]{2}$/.test(c)) || !Array.isArray(regions) || regions.length > 50 || !Array.isArray(cities) || cities.length > 50 || !(countries.length || regions.length || cities.length)) throw new Error("Lieux ciblés invalides ou absents");
  const keyOf = (entry: unknown): string => {
    if (!entry || typeof entry !== "object" || typeof (entry as { key?: unknown }).key !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test((entry as { key: string }).key)) throw new Error("Identifiant de lieu Meta invalide");
    return (entry as { key: string }).key;
  };
  const mappedRegions = regions.map((region) => ({ key: keyOf(region) }));
  const mappedCities = cities.map((city) => {
    const c = city as { radius?: unknown; distance_unit?: unknown };
    const radius = c.radius ?? 25, unit = c.distance_unit ?? "mile";
    if (typeof radius !== "number" || !Number.isFinite(radius) || radius <= 0 || radius > 50 || !["mile", "kilometer"].includes(String(unit))) throw new Error("Rayon de ville Meta invalide");
    return { key: keyOf(city), radius, distance_unit: unit };
  });
  const input = pack.meta_targeting;
  if (input !== null && input !== undefined && (typeof input !== "object" || Array.isArray(input))) throw new Error("Audience Meta invalide");
  const audience = (input ?? {}) as Record<string, unknown>;
  if (audience.gender != null && audience.gender !== "male" && audience.gender !== "female") throw new Error("Genre Meta invalide");
  const interests = audience.interests ?? [];
  if (!Array.isArray(interests) || interests.length > 10) throw new Error("Centres d’intérêt Meta invalides");
  const normalized = sanitizeMetaTargeting({ gender: audience.gender ?? null, interests });
  if (!normalized || normalized.interests.length !== interests.length) throw new Error("Centre d’intérêt Meta invalide ou dupliqué");
  return {
    geo_locations: { ...(countries.length ? { countries } : {}), ...(mappedRegions.length ? { regions: mappedRegions } : {}), ...(mappedCities.length ? { cities: mappedCities } : {}) },
    age_min: pack.min_age, age_max: pack.advantage_audience ? 65 : pack.max_age,
    targeting_automation: { advantage_audience: pack.advantage_audience ? 1 : 0 },
    ...buildMetaAudienceFields(normalized),
  };
}

/** Module sans effets au chargement; les POST Graph ne sont jamais réessayés. */
export function createPackMetaOperations({ supabase, userId, pack }: Context): Pick<PackAdapter, "verify" | "createCampaign" | "createAdSet" | "createCreative" | "createAd" | "activateParent"> {
  let auth: Auth | null = null;
  let campaignId: string | null = null;
  let targeting: Record<string, unknown> | null = null;
  const verifiedVideos = new Set<string>();
  const preparedVideos = new Map<string, { videoId: string; thumbnailUrl: string }>();
  const requireAuth = () => { if (!auth) throw new Error("Préflight Meta non exécuté ou incomplet"); return auth; };
  const resolve = async () => {
    const { data: account, error } = await supabase.from("meta_ad_accounts").select("id,meta_account_id,access_token_encrypted,is_active,currency").eq("id", pack.meta_ad_account_id).eq("user_id", userId).maybeSingle();
    if (error || !account || account.is_active !== true || !account.access_token_encrypted || !account.meta_account_id) throw new Error("Compte Meta propriétaire actif/credentials introuvables");
    const token = decryptSecret(account.access_token_encrypted);
    const id = accountNode(String(account.meta_account_id));
    const remote = await get(id, "id,currency,account_status,business_name,name", token);
    if (String(remote.id ?? "").replace(/^act_/, "") !== String(account.meta_account_id).replace(/^act_/, "") || remote.currency !== "USD" || ![1,8,9,201].includes(Number(remote.account_status))) throw new Error("Compte Meta invalide, inactif, sans nom annonceur vérifié ou devise différente de USD");
    const pages = await get("me/accounts", "id,name,access_token", token);
    // /me/accounts first page only is not proof of access if a next page exists; follow pagination.
    if (!Array.isArray(pages.data)) throw new Error("Données de pages Meta manquantes ou invalides");
    let rows: any[] = pages.data; let next = checkedNext(pages.paging?.next, "graph.facebook.com"); const seen = new Set<string>(); let pageCount=0;
    while (next) { if (++pageCount>100 || seen.has(next)) throw new Error("Pagination des pages Meta invalide ou cyclique"); seen.add(next); const r = await fetchMetaGraph(next, { redirect: "error" }); const j = await readJson(r); if (!r.ok || j.error || !Array.isArray(j.data)) throw new Error("Pagination des pages Meta incomplète"); rows.push(...j.data); next = checkedNext(j.paging?.next, "graph.facebook.com"); }
    const page = rows.find((p) => String(p.id) === pack.meta_page_id && typeof p.access_token === "string");
    if (!page) throw new Error("Page Meta absente ou inaccessible");
    // All pixels are fetched, with a hard ceiling treated as unknown (never as empty).
    let url: string | null = graph(`${id}/adspixels`, "id,name", token).toString(); const pixels: string[] = []; let pagesCount = 0; const seenPixels = new Set<string>();
    while (url) {
      if (++pagesCount > 100 || seenPixels.has(url)) throw new Error("Pagination pixels non exhaustive ou cyclique"); seenPixels.add(url);
      const r = await fetchMetaGraph(url, { redirect: "error" }); const j = await readJson(r);
      if (!r.ok || j.error || !Array.isArray(j.data)) throw new Error("Liste des pixels Meta inconnue");
      for (const p of j.data) { if (typeof p.id !== "string" || !p.id) throw new Error("Pixel Meta mal formé"); pixels.push(p.id); }
      url = checkedNext(j.paging?.next, "graph.facebook.com");
    }
    // Never choose an arbitrary conversion pixel when the account has several.
    // Reuse the ordering of the standard campaign flow, but only among pixels
    // that Meta has just confirmed are actually attached to this account.
    let pixelId = pixels.length === 1 ? pixels[0] : undefined;
    if (pixels.length > 1) {
      const { data: preferences, error: preferenceError } = await supabase.from("meta_pixels").select("pixel_id,configured_on_chariow,last_fired_at").eq("user_id", userId).eq("ad_account_id", account.id).order("configured_on_chariow", { ascending: false }).order("last_fired_at", { ascending: false, nullsFirst: false }).limit(100);
      if (preferenceError || !Array.isArray(preferences)) throw new Error("Impossible de vérifier le pixel choisi pour ce compte Meta");
      pixelId = preferences.find((row: { pixel_id?: unknown }) => typeof row.pixel_id === "string" && pixels.includes(row.pixel_id))?.pixel_id;
      if (!pixelId) throw new Error("Plusieurs pixels Meta existent. Synchronise le compte et configure le pixel de ta boutique avant de lancer le Pack.");
    }
    return { accountId: id, token, pageToken: page.access_token as string, ...(pixelId ? { pixelId } : {}), objective: pixelId ? "sales" as const : "traffic" as const };
  };
  const mediaPreflight = async () => {
    for (const variant of pack.variants) {
      if (!Array.isArray(variant.media) || (variant.format === "image" && variant.media.length !== 1) || (variant.format === "video" && variant.media.length !== 1) || (variant.format === "carousel" && (variant.media.length < 2 || variant.media.length > 5))) throw new Error("Nombre de médias invalide");
      for (const url of variant.media) {
        if (!validHttps(url)) throw new Error("URL média invalide");
        if (variant.format === "video") {
          if (ownStudioPathFromUrl(url, userId, process.env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("Vidéo studio-media privée bloquée avant création: transfert public sûr indisponible");
          if (!cloudinaryVideoUrl(url, process.env.CLOUDINARY_CLOUD_NAME)) throw new Error("URL vidéo Cloudinary publique non autorisée");
          const { data: owned, error } = await supabase.from("creative_media_asset_urls").select("url,asset_id").eq("user_id", userId).eq("url", url).maybeSingle();
          if (error || !owned || owned.url !== url || !owned.asset_id) throw new Error("URL Cloudinary non enregistrée pour cet utilisateur");
          const { data: asset, error: assetError } = await supabase.from("creative_media_assets").select("kind,file_size").eq("id", owned.asset_id).eq("user_id", userId).maybeSingle();
          if (assetError || !asset || asset.kind !== "video" || !Number.isFinite(Number(asset.file_size)) || Number(asset.file_size) <= 0 || Number(asset.file_size) > MAX_VIDEO_BYTES) throw new Error("Asset vidéo utilisateur invalide ou supérieur à 100 Mo");
          const head = await fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000) });
          const type = (head.headers.get("content-type") || "").split(";")[0].toLowerCase(), size = Number(head.headers.get("content-length"));
          if (head.status < 200 || head.status >= 300 || !["video/mp4", "video/quicktime"].includes(type) || !Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES || size !== Number(asset.file_size)) throw new Error("Préflight HEAD vidéo inconclusif ou type/taille/accessibilité invalide");
          verifiedVideos.add(url); continue;
        }
        const path = ownStudioPathFromUrl(url, userId, process.env.NEXT_PUBLIC_SUPABASE_URL);
        let bytes: Uint8Array;
        if (path) { const { data, error } = await supabase.storage.from("studio-media").download(path); if(error||!data||data.size>MAX_BYTES) throw new Error("Média studio-media inaccessible/trop volumineux"); bytes=new Uint8Array(await data.arrayBuffer()); }
        else if (isOwnCloudinaryUrl(url, process.env.CLOUDINARY_CLOUD_NAME)) {
          const { data: owned, error } = await supabase.from("creative_media_asset_urls").select("url,asset_id").eq("user_id", userId).eq("url", url).maybeSingle();
          if(error||!owned||owned.url!==url||!owned.asset_id) throw new Error("URL Cloudinary non enregistrée pour cet utilisateur");
          const response=await fetch(url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)}); bytes=await readBounded(response);
        } else throw new Error("Média non autorisé");
        if (!detectMetaImageType(bytes)) throw new Error("Image JPEG/PNG admissible requise");
      }
      if (!META_CTA_TYPES.includes(variant.call_to_action as any) || !normalizeMetaCta(variant.call_to_action)) throw new Error("CTA invalide");
    }
  };
  const verify: PackAdapter["verify"] = async () => {
    const checkedTargeting = buildPackTargeting(pack);
    const resolved = await resolve();
    await mediaPreflight();
    targeting = checkedTargeting;
    auth = resolved;
    return { store: true, account: true, page: true, media: true, pixelCheck: resolved.pixelId ? "present" : "none", ...(resolved.pixelId ? { pixelId: resolved.pixelId } : {}), exhaustivePixelList: true };
  };
  return {
    verify,
    async createCampaign(input) {
      const a = requireAuth(); if (input.status !== "PAUSED") throw new Error("Campagne pack doit être PAUSED");
      campaignId = await post(`${a.accountId}/campaigns`, { name: `Pack — ${pack.product_name}`.slice(0, 200), objective: a.objective === "sales" ? "OUTCOME_SALES" : "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: "[]", is_adset_budget_sharing_enabled: "false" }, a.token);
      return campaignId;
    },
    async createAdSet(input) {
      const a = requireAuth(); if (!campaignId || input.campaignId !== campaignId) throw new Error("Campagne parent invalide");
      const variant = input.variant;
      if (!targeting) throw new Error("Ciblage Meta non vérifié");
      const end = new Date(Date.now() + Math.max(pack.duration_days, 25/24) * 86400000).toISOString().replace(/\.\d{3}Z$/, "+0000");
      return post(`${a.accountId}/adsets`, { name: `Pack — ${variant.angle}`.slice(0, 200), campaign_id: campaignId, daily_budget: String(input.budgetCents), billing_event: "IMPRESSIONS", optimization_goal: a.objective === "sales" ? "OFFSITE_CONVERSIONS" : "LANDING_PAGE_VIEWS", bid_strategy: "LOWEST_COST_WITHOUT_CAP", targeting: JSON.stringify(targeting), destination_type: "WEBSITE", status: "ACTIVE", end_time: end, dsa_beneficiary: pack.dsa_beneficiary, dsa_payor: pack.dsa_payor, ...(a.pixelId ? { promoted_object: JSON.stringify({ pixel_id: a.pixelId, custom_event_type: "PURCHASE" }) } : {}) }, a.token);
    },
    async createCreative({ variant, pageId }) {
      const a = requireAuth(); if (pageId !== pack.meta_page_id) throw new Error("Page créative différente de la page vérifiée");
      const link = pack.destination_url, cta = variant.call_to_action;
      if (variant.format === "video") {
        const videoUrl = variant.media[0];
        if (!verifiedVideos.has(videoUrl)) throw new Error("Vidéo non vérifiée lors du préflight");
        let prepared = preparedVideos.get(videoUrl);
        if (!prepared) {
          prepared = await prepareMetaCreativeVideo({ accountId: a.accountId, accessToken: a.token, videoUrl, name: `Pack — ${variant.angle}` });
          preparedVideos.set(videoUrl, prepared);
        }
        const result = await createMetaVideoCreative({ accountId: a.accountId, accessToken: a.token, name: `Pack — ${variant.angle}`, pageId, link, message: variant.text, headline: variant.angle, videoId: prepared.videoId, thumbnailUrl: prepared.thumbnailUrl, callToAction: normalizeMetaCta(cta) });
        return result.id;
      }
      const hashes: string[]=[];
      for (const url of variant.media) {
        const path=ownStudioPathFromUrl(url,userId,process.env.NEXT_PUBLIC_SUPABASE_URL); let bytes:Uint8Array;
        if(path){const {data,error}=await supabase.storage.from("studio-media").download(path);if(error||!data||data.size>MAX_BYTES)throw new Error("Image inaccessible/trop volumineuse");bytes=new Uint8Array(await data.arrayBuffer());}
        else {const row=await supabase.from("creative_media_asset_urls").select("url,asset_id").eq("user_id",userId).eq("url",url).maybeSingle();if(row.error||!row.data||row.data.url!==url||!row.data.asset_id||!isOwnCloudinaryUrl(url,process.env.CLOUDINARY_CLOUD_NAME))throw new Error("Média Cloudinary non autorisé");bytes=await readBounded(await fetch(url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)}));}
        const mime=detectMetaImageType(bytes);if(!mime)throw new Error("Image JPEG/PNG requise");
        const form=new FormData();form.append("access_token",a.token);form.append("filename",new Blob([bytes.slice().buffer as ArrayBuffer],{type:mime}),mime==="image/png"?"creative.png":"creative.jpg");
        const upload=await fetchMetaGraph(`${META_GRAPH_BASE_URL}/${a.accountId}/adimages`,{method:"POST",body:form});const uploaded=await readJson(upload);const image=uploaded.images&&Object.values(uploaded.images).find((row:any)=>typeof row?.hash==="string");if(!upload.ok||uploaded.error||typeof(image as any)?.hash!=="string")throw createMetaGraphError(uploaded.error,upload.status,"Upload image Meta échoué");hashes.push((image as any).hash);
      }
      const spec=variant.format==="carousel"?buildCarouselObjectStorySpec({pageId,link,message:variant.text,headline:variant.angle,callToAction:cta,cards:hashes.map(hash=>({url:link,hash})),withTopLevelCallToAction:true}):{page_id:pageId,link_data:{link,message:variant.text,image_hash:hashes[0],call_to_action:{type:cta,value:{link}}}};
      return post(`${a.accountId}/adcreatives`,{name:`Pack — ${variant.angle}`.slice(0,200),object_story_spec:JSON.stringify(spec)},a.token);
    },
    async createAd({ adsetId, creativeId }) { const a = requireAuth(); if (!campaignId) throw new Error("Parent manquant"); return post(`${a.accountId}/ads`, { name: `Pack — ${pack.product_name}`.slice(0, 200), adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: "ACTIVE" }, a.token); },
    async activateParent(id) { const a = requireAuth(); if (id !== campaignId) throw new Error("Parent invalide"); await post(id, { status: "ACTIVE" }, a.token, true); },
  };
}
