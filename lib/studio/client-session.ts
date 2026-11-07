export type StudioActiveMode = "image" | "video" | "slideshow";
export type StudioKind = "image" | "video";
export type StudioTab = "photo" | "slideshow";
export type StudioHistoryKind = "all" | "image" | "video";

export type StudioClientSession = {
  version: 1;
  activeMode: StudioActiveMode | null;
  kind: StudioKind;
  studioTab: StudioTab;
  prompt: string;
  productId: string | null;
  selectedHistoryId: string | null;
  selectedGenerationId: string | null;
  selectedSlideshowTaskId: string | null;
  historyKind: StudioHistoryKind;
  quality: string;
  imageResolution: string;
  orientation: string;
  background: string;
  videoResolution: string;
  aspectRatio: string;
  videoLanguage: string;
  videoTone: string;
  videoPlatform: string;
  videoAngle: string;
  videoJobId: string | null;
  videoRequestId: string | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const STUDIO_CLIENT_SESSION_KEY = "vendeo_studio_client_session_v1";

const DEFAULT_SESSION: StudioClientSession = {
  version: 1,
  activeMode: null,
  kind: "image",
  studioTab: "photo",
  prompt: "",
  productId: null,
  selectedHistoryId: null,
  selectedGenerationId: null,
  selectedSlideshowTaskId: null,
  historyKind: "all",
  quality: "medium",
  imageResolution: "hd",
  orientation: "square",
  background: "auto",
  videoResolution: "480p",
  aspectRatio: "9:16",
  videoLanguage: "auto",
  videoTone: "naturel",
  videoPlatform: "Reels",
  videoAngle: "",
  videoJobId: null,
  videoRequestId: null,
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function nullableId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.slice(0, 256) : null;
}

export function parseStudioClientSession(serialized: string | null): StudioClientSession | null {
  if (!serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!record(value) || value.version !== 1) return null;
    const activeMode = value.activeMode === "image" || value.activeMode === "video" || value.activeMode === "slideshow"
      ? value.activeMode
      : null;
    const kind = value.kind === "video" ? "video" : "image";
    const studioTab = value.studioTab === "slideshow" ? "slideshow" : "photo";
    const historyKind = value.historyKind === "image" || value.historyKind === "video" ? value.historyKind : "all";
    return {
      version: 1,
      activeMode,
      kind,
      studioTab,
      prompt: boundedString(value.prompt, "", 4_000),
      productId: nullableId(value.productId),
      selectedHistoryId: nullableId(value.selectedHistoryId),
      selectedGenerationId: nullableId(value.selectedGenerationId),
      selectedSlideshowTaskId: nullableId(value.selectedSlideshowTaskId),
      historyKind,
      quality: boundedString(value.quality, DEFAULT_SESSION.quality, 32),
      imageResolution: boundedString(value.imageResolution, DEFAULT_SESSION.imageResolution, 32),
      orientation: boundedString(value.orientation, DEFAULT_SESSION.orientation, 32),
      background: boundedString(value.background, DEFAULT_SESSION.background, 32),
      videoResolution: boundedString(value.videoResolution, DEFAULT_SESSION.videoResolution, 32),
      aspectRatio: boundedString(value.aspectRatio, DEFAULT_SESSION.aspectRatio, 16),
      videoLanguage: boundedString(value.videoLanguage, DEFAULT_SESSION.videoLanguage, 32),
      videoTone: boundedString(value.videoTone, DEFAULT_SESSION.videoTone, 64),
      videoPlatform: boundedString(value.videoPlatform, DEFAULT_SESSION.videoPlatform, 64),
      videoAngle: boundedString(value.videoAngle, "", 1_000),
      videoJobId: nullableId(value.videoJobId),
      videoRequestId: nullableId(value.videoRequestId),
    };
  } catch {
    return null;
  }
}

function getStorage(explicit?: StorageLike): StorageLike | null {
  if (explicit) return explicit;
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStudioClientSession(storage?: StorageLike): StudioClientSession | null {
  try {
    return parseStudioClientSession(getStorage(storage)?.getItem(STUDIO_CLIENT_SESSION_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeStudioClientSession(session: StudioClientSession, storage?: StorageLike): boolean {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.setItem(STUDIO_CLIENT_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function defaultStudioClientSession(): StudioClientSession {
  return { ...DEFAULT_SESSION };
}
