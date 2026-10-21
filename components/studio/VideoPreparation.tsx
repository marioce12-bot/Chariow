"use client";

import { useEffect, useMemo, useState } from "react";
import type { MusicTrack } from "@/lib/studio/music-catalog";

type Props = {
  locale: string;
  mode: "slideshow" | "characters";
  onModeChange: (mode: "slideshow" | "characters") => void;
  musicId: string;
  onMusicChange: (musicId: string) => void;
};

const COPY = {
  fr: {
    title: "Préparation de la vidéo", intro: "Choisis un format et une musique. Aucun rendu n’est lancé depuis ce panneau.", mode: "Format vidéo",
    slideshow: "Diaporama animé", characters: "Scènes avec personnages", music: "Musique", search: "Rechercher une musique…", searchButton: "Rechercher",
    mood: "Ambiance", all: "Toutes", calm: "Calme", upbeat: "Enjouée", dramatic: "Dramatique", results: "Résultats provenant de Wikimedia Commons",
    loading: "Recherche…", noResults: "Aucun morceau avec une licence CC0 ou domaine public vérifiable n’a été trouvé.", error: "Catalogue indisponible. Réessaie plus tard.", select: "Sans musique", preview: "Écouter l’aperçu", stop: "Arrêter l’aperçu",
    license: "Licence", attribution: "Attribution", source: "Page du fichier", caveat: "Vérifie les droits sur la page source avant toute utilisation commerciale. Les métadonnées Commons ne constituent pas une validation juridique.",
  },
  en: {
    title: "Video preparation", intro: "Choose a format and music. This panel does not start a render.", mode: "Video format",
    slideshow: "Animated slideshow", characters: "Scenes with characters", music: "Music", search: "Search for music…", searchButton: "Search",
    mood: "Mood", all: "All", calm: "Calm", upbeat: "Upbeat", dramatic: "Dramatic", results: "Results from Wikimedia Commons",
    loading: "Searching…", noResults: "No track with a verifiable CC0 or public-domain label was found.", error: "Catalogue unavailable. Try again later.", select: "No music", preview: "Play preview", stop: "Stop preview",
    license: "License", attribution: "Attribution", source: "File page", caveat: "Check the source page before commercial use. Commons metadata is not legal validation.",
  },
} as const;

export function VideoPreparation({ locale, mode, onModeChange, musicId, onMusicChange }: Props) {
  const t = COPY[locale.toLowerCase().startsWith("fr") ? "fr" : "en"];
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [mood, setMood] = useState("all");
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [previewId, setPreviewId] = useState("");

  useEffect(() => {
    if (!submitted) { setTracks([]); return; }
    const controller = new AbortController();
    setLoading(true); setError(false);
    fetch(`/api/studio/music?q=${encodeURIComponent(submitted)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("request failed"); return response.json(); })
      .then((data: { tracks?: MusicTrack[] }) => setTracks(Array.isArray(data.tracks) ? data.tracks : []))
      .catch((cause) => { if (!controller.signal.aborted) { setError(true); setTracks([]); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [submitted]);

  const filtered = useMemo(() => mood === "all" ? tracks : tracks.filter((track) => track.mood === mood), [tracks, mood]);
  const current = tracks.find((track) => track.id === previewId);

  return (
    <section className="rounded-3xl border border-white/10 bg-[#111827] p-5 text-white" aria-labelledby="video-preparation-title">
      <h2 id="video-preparation-title" className="text-lg font-semibold">{t.title}</h2>
      <p className="mt-1 text-sm text-white/60">{t.intro}</p>
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium">{t.mode}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["slideshow", "characters"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => onModeChange(value)} className={`rounded-xl border px-4 py-3 text-left text-sm transition ${mode === value ? "border-violet-400 bg-violet-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
              {value === "slideshow" ? t.slideshow : t.characters}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-6">
        <h3 className="text-sm font-medium">{t.music}</h3>
        <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); setSubmitted(query.trim()); setPreviewId(""); }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t.search} placeholder={t.search} maxLength={100} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-violet-400" />
          <button type="submit" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">{t.searchButton}</button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor="music-mood" className="text-white/60">{t.mood}</label>
          <select id="music-mood" value={mood} onChange={(event) => setMood(event.target.value)} className="rounded-lg border border-white/10 bg-[#111827] px-2 py-1">
            <option value="all">{t.all}</option><option value="calm">{t.calm}</option><option value="upbeat">{t.upbeat}</option><option value="dramatic">{t.dramatic}</option>
          </select>
          <span className="text-white/45">{t.results}</span>
        </div>
        <button type="button" onClick={() => { onMusicChange(""); setPreviewId(""); }} aria-pressed={!musicId} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${!musicId ? "border-violet-400" : "border-white/10"}`}>{t.select}</button>
        {loading && <p role="status" className="mt-3 text-sm text-white/60">{t.loading}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{t.error}</p>}
        {!loading && !error && submitted && filtered.length === 0 && <p className="mt-3 text-sm text-white/60">{t.noResults}</p>}
        <ul className="mt-3 space-y-3">
          {filtered.map((track) => (
            <li key={track.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium">{track.title}</p><p className="text-xs text-white/55">{track.artist}</p></div>
                <button type="button" onClick={() => { onMusicChange(track.id); setPreviewId(previewId === track.id ? "" : track.id); }} aria-pressed={musicId === track.id} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">{previewId === track.id ? t.stop : t.preview}</button>
              </div>
              <p className="mt-2 text-xs text-white/65">{t.license}: <a href={track.licenseUrl} target="_blank" rel="noreferrer" className="underline">{track.license}</a></p>
              <p className="mt-1 break-words text-xs text-white/55">{t.attribution}: {track.attribution}</p>
              <a href={track.filePageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline">{t.source}</a>
            </li>
          ))}
        </ul>
        {current && <audio key={current.id} controls preload="none" autoPlay={false} src={current.audioUrl} className="mt-3 w-full" onEnded={() => setPreviewId("")} aria-label={`${t.preview}: ${current.title}`} />}
        <p className="mt-3 text-xs text-white/45">{t.caveat}</p>
      </div>
    </section>
  );
}
