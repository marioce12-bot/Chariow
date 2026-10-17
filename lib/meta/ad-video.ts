import { META_GRAPH_BASE_URL } from "./api";
import { LEGACY_META_CTA, normalizeMetaCta } from "./cta";

// Créatives vidéo Meta. Contrairement aux images (image_hash via /adimages), une vidéo suit ce parcours :
// 1. POST /act_<id>/advideos avec file_url (Meta télécharge la vidéo depuis notre URL publique) ;
// 2. attente de la fin du traitement (status.video_status = "ready") ;
// 3. créative avec object_story_spec.video_data (video_id + miniature obligatoire).
// Les améliorations Advantage+ créative (retouches d'image, superpositions) ne s'appliquent pas aux vidéos.

type GraphResponse = Record<string, unknown>;

const VIDEO_PATH_EXTENSION = /\.(mp4|mov|m4v|webm)$/i;
const DEFAULT_WAIT_MS = 55_000;
const POLL_INTERVAL_MS = 3_000;

/** Vrai si l'URL pointe vers une vidéo (Cloudinary /video/upload/ ou extension vidéo courante). */
export function isVideoMediaUrl(rawUrl: string | null | undefined): boolean {
  if (typeof rawUrl !== "string" || !rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return url.pathname.includes("/video/upload/") || VIDEO_PATH_EXTENSION.test(url.pathname);
  } catch {
    return false;
  }
}

function describeGraphError(json: GraphResponse, status: number): string {
  const error = json.error as GraphResponse | undefined;
  if (!error) return `Meta request failed (${status})`;
  const userMsg = typeof error.error_user_msg === "string" ? error.error_user_msg : null;
  const title = typeof error.error_user_title === "string" ? error.error_user_title : null;
  const message = typeof error.message === "string" ? error.message : null;
  const parts = [title, userMsg && userMsg !== title ? userMsg : null].filter(Boolean) as string[];
  if (!parts.length) parts.push(message ?? `Meta request failed (${status})`);
  if (typeof error.error_subcode === "number") parts.push(`(subcode ${error.error_subcode})`);
  return parts.join(" — ");
}

/** Envoie la vidéo à Meta (Meta la télécharge depuis `videoUrl`, qui doit être publique) et retourne son id. */
export async function uploadMetaAdVideo(input: { accountId: string; accessToken: string; videoUrl: string; name?: string }): Promise<string> {
  const body = new URLSearchParams({ file_url: input.videoUrl, access_token: input.accessToken });
  if (input.name) body.set("name", input.name.slice(0, 100));
  const response = await fetch(`${META_GRAPH_BASE_URL}/${input.accountId}/advideos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as GraphResponse;
  if (!response.ok || typeof json.id !== "string") {
    throw new Error(`Envoi de la vidéo à Meta refusé : ${describeGraphError(json, response.status)}`);
  }
  return json.id;
}

async function graphGet(path: string, accessToken: string, fields: string): Promise<{ ok: boolean; json: GraphResponse; status: number }> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as GraphResponse;
  return { ok: response.ok, json, status: response.status };
}

/** Attend que Meta ait fini de traiter la vidéo, puis retourne l'URL de sa miniature (obligatoire pour video_data). */
export async function waitForMetaVideo(input: { videoId: string; accessToken: string; timeoutMs?: number }): Promise<{ thumbnailUrl: string }> {
  const deadline = Date.now() + (input.timeoutMs ?? DEFAULT_WAIT_MS);
  for (;;) {
    const { ok, json } = await graphGet(input.videoId, input.accessToken, "status,picture");
    if (ok) {
      const state = (json.status as { video_status?: unknown } | undefined)?.video_status;
      if (state === "error") {
        throw new Error("Meta n'a pas pu traiter cette vidéo (format ou durée non pris en charge). Essaie un MP4 plus court.");
      }
      if (state === "ready") {
        if (typeof json.picture === "string" && json.picture) return { thumbnailUrl: json.picture };
        // Repli : liste des miniatures générées par Meta (la préférée d'abord).
        const thumbs = await graphGet(`${input.videoId}/thumbnails`, input.accessToken, "uri,is_preferred");
        const items = Array.isArray(thumbs.json.data) ? (thumbs.json.data as Array<{ uri?: unknown; is_preferred?: unknown }>) : [];
        const best = items.find((item) => item.is_preferred === true && typeof item.uri === "string") ?? items.find((item) => typeof item.uri === "string");
        if (best && typeof best.uri === "string") return { thumbnailUrl: best.uri };
        throw new Error("Meta n'a pas fourni de miniature pour cette vidéo. Réessaie dans un instant.");
      }
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      throw new Error("Meta traite encore la vidéo. Réessaie dans une minute.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/** Envoie la vidéo à Meta et attend qu'elle soit prête. À appeler AVANT de créer la campagne pour ne pas laisser de campagne orpheline en cas d'échec. */
export async function prepareMetaCreativeVideo(input: { accountId: string; accessToken: string; videoUrl: string; name?: string }): Promise<{ videoId: string; thumbnailUrl: string }> {
  const videoId = await uploadMetaAdVideo(input);
  const { thumbnailUrl } = await waitForMetaVideo({ videoId, accessToken: input.accessToken });
  return { videoId, thumbnailUrl };
}

/** Créative vidéo (video_data) : texte principal, titre et bouton d'appel à l'action pointant vers `link`. */
export async function createMetaVideoCreative(input: {
  accountId: string;
  accessToken: string;
  name: string;
  pageId: string;
  link: string;
  message: string;
  headline: string;
  videoId: string;
  thumbnailUrl: string;
  callToAction?: string | null;
}): Promise<{ id: string }> {
  const callToAction = normalizeMetaCta(input.callToAction) ?? LEGACY_META_CTA;
  const body = new URLSearchParams({
    name: input.name.slice(0, 200),
    object_story_spec: JSON.stringify({
      page_id: input.pageId,
      video_data: {
        video_id: input.videoId,
        image_url: input.thumbnailUrl,
        message: input.message,
        title: input.headline,
        call_to_action: { type: callToAction, value: { link: input.link } },
      },
    }),
    access_token: input.accessToken,
  });
  const response = await fetch(`${META_GRAPH_BASE_URL}/${input.accountId}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as GraphResponse;
  if (!response.ok || typeof json.id !== "string") {
    throw new Error(describeGraphError(json, response.status));
  }
  return { id: json.id };
}
