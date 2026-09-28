import { TIKTOK_API_BASE_URL } from "./api";

// Helpers vidéo TikTok. Le wizard accepte les vidéos (Step2NetworkCreative), mais
// le lancement n'envoyait que des images : une vidéo échouait à l'upload.

async function post(path: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(`${TIKTOK_API_BASE_URL}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": accessToken }, body: JSON.stringify(body), cache: "no-store" });
  const json = await response.json().catch(() => ({})) as { code: number; message: string; data?: any };
  if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok request failed (${response.status})`);
  return json.data ?? {};
}

export function isVideoUrl(url: string) {
  return url.includes("/video/upload/") || /\.(mp4|mov|m4v|webm)(\?.*)?$/i.test(url);
}

// TikTok exige une image de couverture pour une pub vidéo. Les médias sont
// hébergés sur Cloudinary (champ secure_url) : on demande la première image de
// la vidéo en changeant l'URL (so_0 + extension .jpg).
export function videoCoverUrl(videoUrl: string): string | null {
  if (!videoUrl.includes("/video/upload/")) return null;
  return videoUrl.replace("/video/upload/", "/video/upload/so_0/").replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
}

export async function uploadTikTokAdVideo(input: { advertiserId: string; accessToken: string; videoUrl: string }) {
  const data = await post("file/video/ad/upload/", input.accessToken, { advertiser_id: input.advertiserId, upload_type: "UPLOAD_BY_URL", video_url: input.videoUrl, file_name: `vendeo-${Date.now()}.mp4` });
  // Selon la version, la réponse est un objet ou une liste d'objets.
  const row = Array.isArray(data) ? data[0] : data;
  const videoId = row?.video_id;
  if (!videoId) throw new Error("TikTok n'a pas renvoyé d'identifiant vidéo");
  return { videoId: String(videoId) };
}

export async function createTikTokVideoAd(input: { advertiserId: string; accessToken: string; adgroupId: string; name: string; identityId: string; identityType: string; videoId: string; coverImageId: string; text: string; link: string }) {
  const data = await post("ad/create/", input.accessToken, {
    advertiser_id: input.advertiserId,
    adgroup_id: input.adgroupId,
    creatives: [{
      ad_name: input.name.slice(0, 512),
      ad_format: "SINGLE_VIDEO",
      identity_id: input.identityId,
      identity_type: input.identityType,
      video_id: input.videoId,
      image_ids: [input.coverImageId],
      ad_text: input.text.slice(0, 100),
      landing_page_url: input.link,
      call_to_action: "LEARN_MORE",
      operation_status: "ENABLE",
    }],
  });
  const adIds = (data as { ad_ids?: string[] }).ad_ids ?? [];
  return { id: String(adIds[0] ?? "") };
}
