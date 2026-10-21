/** Shared audio processing for slideshow render, remix, and music preview. */
export const SLIDESHOW_AUDIO_CHANGE = "normalized to -16 LUFS (true-peak ceiling -2 dB), faded out over 0.35s, transcoded to AAC";

/**
 * FFmpeg loudnorm in single-pass mode targets integrated -16 LUFS and -2 dBTP.
 * The downstream limiter is a safety ceiling at -1.5 dBFS for codec overshoot.
 */
export function slideshowAudioFilter(duration: number, fadeDuration = 0.35): string {
  const fade = Math.min(fadeDuration, Math.max(0, duration));
  const start = Math.max(0, duration - fade);
  return `aresample=48000,loudnorm=I=-16:TP=-2:LRA=11:print_format=none,alimiter=limit=0.841395:level=false,afade=t=out:st=${start}:d=${fade}`;
}
