import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { META_GRAPH_BASE_URL } from "@/lib/meta/api";

export const maxDuration = 30;

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

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => ({}));
  const accountRowId = typeof body?.meta_ad_account_id === "string" ? body.meta_ad_account_id : "";
  const pageId = typeof body?.meta_page_id === "string" ? body.meta_page_id : "";
  const link = typeof body?.link === "string" ? body.link.trim() : "";
  const imageUrl = typeof body?.image_url === "string" ? body.image_url.trim() : "";
  if (!accountRowId || !pageId || !link || !imageUrl) {
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
  const creative = {
    object_story_spec: {
      page_id: pageId,
      link_data: {
        link,
        message: typeof body?.message === "string" ? body.message : "",
        name: typeof body?.headline === "string" ? body.headline : "",
        picture: imageUrl,
        call_to_action: { type: "LEARN_MORE", value: { link } },
      },
    },
  };

  const requestedPlacement = body?.placement === "whatsapp_status" ? "whatsapp_status" : "auto";
  const requestedFormat = typeof body?.format === "string" ? body.format : "";
  const format = PREVIEW_FORMATS.find((item) => item.id === requestedFormat);
  const allowedForPlacement = requestedPlacement === "whatsapp_status"
    ? format?.id === "INSTAGRAM_STORY" || format?.id === "WHATSAPP_STATUS_MEDIA"
    : Boolean(format);
  if (!format || !allowedForPlacement) return NextResponse.json({ error: "Placement Meta invalide." }, { status: 400 });

  const url = new URL(`${META_GRAPH_BASE_URL}/act_${String(account.meta_account_id).replace(/^act_/, "")}/generatepreviews`);
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
    return NextResponse.json({ preview: { id: format.id, label: format.label, html: row.body } });
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
