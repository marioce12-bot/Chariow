import path from "node:path";
export const SCOTT_BUCKLEY_SOURCE = "https://www.scottbuckley.com.au/library/using-this-music/";
export const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/";
export type LicensedTrack = { id: string; title: string; artist: string; fileName: string; localPath?: string; sourceUrl: string; downloadUrl: string; license: string; licenseUrl: string; credit: string; youtubeNotice: string };
export type MusicModifications = { changes?: string[] };
/** Server-only catalogue. Audio stays private; previews and exports are synchronized videos.
 * No raw MP3 endpoint, isolated music sale, streaming-platform upload or Content ID submission.
 * These terms authorize attributed commercial synchronization; they are not a certified SaaS legal clearance.
 */
export const LICENSED_MUSIC: readonly LicensedTrack[] = Object.freeze([
  {
    "id": "sb-wonderful",
    "title": "Wonderful",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Wonderful.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/wonderful/",
    "downloadUrl": "https://www.scottbuckley.com.au/wp-content/audio/sb_wonderful.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Wonderful' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-life-is",
    "title": "Life Is",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Life Is.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/life-is/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2017/10/sb_lifeis.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Life Is' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-amberlight",
    "title": "Amberlight",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Amberlight.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/amberlight/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2025/03/Amberlight.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Amberlight' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-home-was-you",
    "title": "Home Was You",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Home Was You.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/home-was-you/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2026/07/HomeWasYou.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Home Was You' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-reverie",
    "title": "Reverie",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Reverie.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/reverie/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2020/03/sb_reverie.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Reverie' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-ephemera",
    "title": "Ephemera",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Ephemera.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/ephemera/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2020/03/sb_ephemera.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Ephemera' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-a-kind-of-hope",
    "title": "A Kind Of Hope",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - A Kind Of Hope.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/a-kind-of-hope/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2022/10/AKindOfHope.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'A Kind Of Hope' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-resolutions",
    "title": "Resolutions",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Resolutions.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/resolutions/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2022/01/Resolutions.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Resolutions' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-horizons",
    "title": "Horizons",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Horizons.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/horizons/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2020/02/sb_horizons.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Horizons' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-ascension",
    "title": "Ascension",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Ascension.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/ascension/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2019/02/sb_ascension.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Ascension' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-this-too-shall-pass",
    "title": "This Too Shall Pass",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - This Too Shall Pass.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/this-too-shall-pass/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2021/01/sb_thistooshallpass.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'This Too Shall Pass' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-signal-to-noise",
    "title": "Signal to Noise",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Signal to Noise.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/signal-to-noise/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2020/04/sb_signaltonoise.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Signal to Noise' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  },
  {
    "id": "sb-filaments",
    "title": "Filaments",
    "artist": "Scott Buckley",
    "fileName": "Scott Buckley - Filaments.mp3",
    "sourceUrl": "https://www.scottbuckley.com.au/library/filaments/",
    "downloadUrl": "https://www.scottbuckley.com.au/library/wp-content/uploads/2019/10/sb_filaments.mp3",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "'Filaments' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
    "youtubeNotice": "Sur YouTube, ce crédit et le lien de licence doivent figurer dans la DESCRIPTION. Ne pas soumettre la musique à Content ID."
  }
]);
export function getLicensedTrack(id: string): LicensedTrack | undefined { return LICENSED_MUSIC.find(track => track.id === id); }
export function musicAttribution(track: LicensedTrack, modifications?: MusicModifications): string {
  const changes = modifications?.changes?.filter(Boolean) ?? [];
  return `${track.credit}\nSource: ${track.sourceUrl}\nLicence: ${track.licenseUrl}\nModifications: ${changes.length ? changes.join(", ") : "aucune"}.\n${track.youtubeNotice}\nNe pas revendre cette musique isolément, la redistribuer sur une plateforme de streaming ou l'enregistrer dans Content ID. La musique de ce rendu est synchronisée aux images.`;
}
export function privateTrackPath(fileName: string): string { return path.join(process.cwd(), "private", "studio-music", fileName); }
export const YOUTUBE_CREDIT_NOTICE = "YouTube: place the music attribution in the video description (not only in the video itself).";
