import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { META_GRAPH_BASE_URL } from "@/lib/meta/api";
import { prepareMetaCreativeImage } from "@/lib/meta/ad-image";
import { isVideoMediaUrl, prepareMetaCreativeVideo } from "@/lib/meta/ad-video";
import { LEGACY_META_CTA, normalizeMetaCta } from "@/lib/meta/cta";

// La préparation d'une vidéo peut attendre jusqu'à 55 s le traitement de Meta.
export const maxDuration = 60;

// Les identifiants doivent figurer dans la liste ad_format acceptée par Meta
// pour /generatepreviews (ex. FACEBOOK_STORY_MOBILE, pas FACEBOOK_STORY).
const PREVIEW_FORMATS = [
  { id: "MOBILE_FEED_STANDARD", label: "Facebook Feed" },
  { id: "INSTAGRAM_STANDARD", label: "Instagram Feed" },
  { id: "INSTAGRAM_STORY", label: "Instagram Story" },
  { id: "INSTAGRAM_REELS", label: "Instagram Reel" },
  { id: "FACEBOOK_STORY_MOBILE", label: "Facebook Story" },
  { id: "FACEBOOK_REELS_MOBILE", label: "Facebook Reel" },
  { id: "WHATSAPP_STATUS_MEDIA", label: "Statut WhatsApp" },
] as const;

const PREVIEW_TIMEOUT_MS = 20_000;

function graphError(json: Record<string, unknown>, status: number) {
  const error = json.error as { message?: unknown } | undefined;
  return typeof error?.message === "string" ? error.message : `Meta preview failed (${status})`;
}

function validVideoId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value.trim()) ? value.trim() : "";
}

function validThumbnailUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => ({}));
  const accountRowId = typeof body?.meta_ad_account_id === "string" ? body.meta_ad_account_id : "";
  const pageId = typeof body?.meta_page_id === "string" ? body.meta_page_id : "";
  const link = typeof body?.link === "string" ? body.link.trim() : "";
  const imageUrl = typeof body?.image_url === "string" ? body.image_url.trim() : "";
  const isVideo = isVideoMediaUrl(imageUrl);
  // Hash Meta pour les images ; ID vidéo Meta et miniature générée pour les vidéos.
  const providedHash = typeof body?.image_hash === "string" && /^[A-Za-z0-9]{8,64}$/.test(body.image_hash.trim()) ? body.image_hash.trim() : "";
  const providedVideoId = validVideoId(body?.video_id);
  const providedVideoThumbnailUrl = validThumbnailUrl(body?.video_thumbnail_url);
  // Mode préparation : l'étape 2 prépare le bon type de média pour les aperçus de l'étape 5.
  const prepareOnly = body?.prepare_only === true;
  if (prepareOnly ? !accountRowId || !imageUrl : !accountRowId || !pageId || !link || !imageUrl) {
    return NextResponse.json({ error: "Compte Meta, page, lien et visuel requis pour générer les aperçus." }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("meta_ad_accounts")
    .select("meta_account_id,access_token_encrypted")
    .eq("id", accountRowId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "Compte publicitaire Meta introuvable." }, { status: 404 });

  const accessToken = decryptSecret(account.access_token_encrypted);
  const accountId = `act_${String(account.meta_account_id).replace(/^act_/, "")}`;

  if (prepareOnly) {
    if (isVideo) {
      const prepared = await prepareMetaCreativeVideo({ accountId, accessToken, videoUrl: imageUrl });
      return NextResponse.json({ video_id: prepared.videoId, video_thumbnail_url: prepared.thumbnailUrl });
    }
    const prepared = await prepareMetaCreativeImage({ userId: user.id, accountId, accessToken, imageUrl });
    return NextResponse.json({ image_hash: prepared.imageHash ?? null });
  }

  const requestedPlacement = body?.placement === "whatsapp_status" ? "whatsapp_status" : "auto";
  const requestedFormat = typeof body?.format === "string" ? body.format : "";
  const format = PREVIEW_FORMATS.find((item) => item.id === requestedFormat);
  const allowedForPlacement = requestedPlacement === "whatsapp_status"
    ? format?.id === "INSTAGRAM_STORY" || format?.id === "WHATSAPP_STATUS_MEDIA"
    : Boolean(format);
  if (!format || !allowedForPlacement) return NextResponse.json({ error: "Placement Meta invalide." }, { status: 400 });

  const message = typeof body?.message === "string" ? body.message : "";
  const headline = typeof body?.headline === "string" ? body.headline : "";
  const callToAction = { type: normalizeMetaCta(body?.call_to_action) ?? LEGACY_META_CTA, value: { link } };
  let creative: Record<string, unknown>;
  let mediaResult: { image_hash?: string | null; video_id?: string; video_thumbnail_url?: string };

  if (isVideo) {
    // Meta exige video_data.video_id et la miniature de la vidéo ; une URL MP4
    // ne doit jamais être envoyée comme link_data.picture.
    const prepared = providedVideoId && providedVideoThumbnailUrl
      ? { videoId: providedVideoId, thumbnailUrl: providedVideoThumbnailUrl }
      : await prepareMetaCreativeVideo({ accountId, accessToken, videoUrl: imageUrl, timeoutMs: 35_000 });
    creative = {
      object_story_spec: {
        page_id: pageId,
        video_data: {
          video_id: prepared.videoId,
          image_url: prepared.thumbnailUrl,
          message,
          title: headline,
          call_to_action: callToAction,
        },
      },
    };
    mediaResult = { video_id: prepared.videoId, video_thumbnail_url: prepared.thumbnailUrl };
  } else {
    // Pour les images, utiliser image_hash évite les échecs de chargement des URLs signées dans Instagram.
    const imageHash = providedHash || (await prepareMetaCreativeImage({ userId: user.id, accountId, accessToken, imageUrl })).imageHash;
    creative = {
      object_story_spec: {
        page_id: pageId,
        link_data: {
          link,
          message,
          name: headline,
          ...(imageHash ? { image_hash: imageHash } : { picture: imageUrl }),
          call_to_action: callToAction,
        },
      },
    };
    mediaResult = { image_hash: imageHash ?? null };
  }

  const url = new URL(`${META_GRAPH_BASE_URL}/${accountId}/generatepreviews`);
  url.searchParams.set("creative", JSON.stringify(creative));
  url.searchParams.set("ad_format", format.id);
  url.searchParams.set("access_token", accessToken);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const result = await fetch(url.toString(), { cache: "no-store", signal: controller.signal });
    const json = await result.json().catch(() => ({})) as Record<string, unknown>;
    const row = Array.isArray(json.data) ? json.data[0] as { body?: unknown } | undefined : undefined;
    if (!result.ok || typeof row?.body !== "string" || !row.body.includes("iframe")) {
      console.warn("Meta preview rejected", format.id, graphError(json, result.status));
      return NextResponse.json({ error: "Meta n'a pas pu générer cet aperçu pour ce placement." }, { status: 502 });
    }
    return NextResponse.json({ preview: { id: format.id, label: format.label, html: row.body }, ...mediaResult });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.warn("Meta preview format unavailable", format.id, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: timedOut ? "Meta met trop de temps à répondre. Réessaie dans un instant." : "Meta n'a pas pu générer cet aperçu." },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
