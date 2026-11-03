type StudioPreviewMode = "image" | "video";
type StudioPreviewVideoJob = { status: string; contentUrl?: string | null } | null | undefined;

/** Prevents stale media from another Studio session from leaking into the active preview. */
export function resolveStudioPreviewMedia(
  mode: StudioPreviewMode,
  imageUrl: string | null,
  videoJob: StudioPreviewVideoJob,
) {
  return {
    imageUrl: mode === "image" ? imageUrl : null,
    videoUrl: mode === "video" && videoJob?.status === "completed" ? videoJob.contentUrl ?? null : null,
  };
}
