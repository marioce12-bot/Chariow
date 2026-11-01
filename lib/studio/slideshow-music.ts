/** Default licensed instrumental bed for slideshow renders when no track is selected. */
export const DEFAULT_SLIDESHOW_MUSIC_ID = "sb-amberlight";

/** Empty IDs mean automatic music; unknown non-empty IDs remain explicit for validation. */
export function resolveSlideshowMusicId(musicId?: string | null): string {
  return typeof musicId === "string" && musicId.trim()
    ? musicId.trim()
    : DEFAULT_SLIDESHOW_MUSIC_ID;
}
