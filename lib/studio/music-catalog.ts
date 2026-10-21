export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  filePageUrl: string;
  audioUrl: string;
  mood: string;
};

type CommonsImageInfo = {
  url?: string;
  descriptionurl?: string;
  mime?: string;
  mediatype?: string;
  extmetadata?: Record<string, { value?: string }>;
};
export type CommonsApiResponse = {
  query?: { pages?: Record<string, { title?: string; imageinfo?: CommonsImageInfo[] }> };
  continue?: { gsroffset?: number };
};

const API_ORIGIN = "https://commons.wikimedia.org";
const LICENSES = ["CC0", "Public domain"];
const MAX_PAGES = 3;
const PAGE_SIZE = 30;
const REQUEST_TIMEOUT_MS = 8_000;
const stripHtml = (value = "") => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function inferMood(title: string) {
  const value = title.toLowerCase();
  if (/lullaby|calm|peace|soft|meditat|slow|gentle|berceuse|calme|doux/.test(value)) return "calm";
  if (/march|dance|upbeat|happy|joy|fast|energetic|fanfare|danse|joyeux/.test(value)) return "upbeat";
  if (/dramatic|suspense|dark|epic|battle|tension|dramatique|sombre/.test(value)) return "dramatic";
  return "all";
}

/** Search Commons at a fixed origin, requiring file text to declare CC0 or a PD template. */
export function commonsSearchUrl(search: string, offset?: number) {
  const query = `filetype:audio incategory:Audio_files_of_music (insource:"{{Cc-zero}}" OR insource:"{{PD-old}}" OR insource:"{{PD-art}}" OR insource:"{{PD-self}}") ${search.trim()}`.trim();
  const params = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "search",
    gsrsearch: query, gsrnamespace: "6", gsrlimit: String(PAGE_SIZE),
    prop: "imageinfo", iiprop: "url|mime|mediatype|extmetadata",
  });
  if (offset !== undefined) params.set("gsroffset", String(offset));
  return `${API_ORIGIN}/w/api.php?${params.toString()}`;
}

function reusableLicense(label: string) {
  const normalized = stripHtml(label).toLowerCase().replace(/\s+/g, " ").trim();
  return normalized === "cc0" || /^cc0(?:\s|$)/.test(normalized) || /^(?:public domain|public-domain)(?:\s|$)/.test(normalized);
}

function safeHttpsUrl(value: string | undefined, hosts: string[]) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && hosts.includes(url.hostname) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function parseCommonsTracks(payload: CommonsApiResponse): MusicTrack[] {
  return Object.entries(payload.query?.pages ?? {}).flatMap(([id, page]) => {
    const image = page.imageinfo?.[0];
    const metadata = image?.extmetadata ?? {};
    const license = stripHtml(metadata.LicenseShortName?.value || metadata.License?.value || "");
    const title = (page.title || "").replace(/^File:/, "").replace(/\.[^.]+$/, "").replace(/_/g, " ");
    const artist = stripHtml(metadata.Artist?.value || metadata.Credit?.value || "Auteur non indiqué");
    const audioUrl = safeHttpsUrl(image?.url, ["upload.wikimedia.org"]);
    const filePageUrl = safeHttpsUrl(image?.descriptionurl, ["commons.wikimedia.org"]);
    // Commons labels OGG streams application/ogg; mediatype is authoritative for audio, not video.
    const isAudio = /^audio\//i.test(image?.mime || "") || image?.mediatype?.toUpperCase() === "AUDIO";
    if (!image || !isAudio || !audioUrl || !filePageUrl || !reusableLicense(license)) return [];
    const licenseUrl = safeHttpsUrl(metadata.LicenseUrl?.value, ["creativecommons.org", "commons.wikimedia.org"]);
    if (!licenseUrl) return [];
    const providedAttribution = stripHtml(metadata.Attribution?.value || "");
    const attribution = [title, artist, license, providedAttribution].filter(Boolean).join(" — ");
    return [{ id, title, artist, license, licenseUrl, attribution, filePageUrl, audioUrl, mood: inferMood(title) }];
  });
}

export async function searchCommonsMusic(search: string, fetcher: typeof fetch = fetch): Promise<MusicTrack[]> {
  const tracks = new Map<string, MusicTrack>();
  let offset: number | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetcher(commonsSearchUrl(search, offset), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 3600 },
    } as RequestInit);
    if (!response.ok) throw new Error(`Wikimedia Commons returned ${response.status}`);
    const payload = await response.json() as CommonsApiResponse;
    for (const track of parseCommonsTracks(payload)) tracks.set(track.id, track);
    if (payload.continue?.gsroffset === undefined) break;
    offset = payload.continue.gsroffset;
  }
  return [...tracks.values()];
}

export const MUSIC_LICENSE_POLICY = "Catalogue live Wikimedia Commons ; seuls les fichiers dont les métadonnées par fichier déclarent CC0 ou domaine public sont affichés. La recherche est filtrée en amont, mais les résultats disponibles varient et aucun volume n’est garanti. Réexaminer la page source et les droits des enregistrements avant usage commercial.";
