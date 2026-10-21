"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignGoal, SlideshowPlan } from "@/lib/studio/slideshow-plan";
import { LoaderCircle } from "lucide-react";
import { SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
import { imageCreditCost } from "@/lib/studio/credits";

type Product = { id: string; name: string; description?: string | null; image?: string | null };
type AdPlan = SlideshowPlan;
type Track = { id: string; title: string; artist: string; sourceUrl: string; license: string; licenseUrl: string; credit: string; youtubeNotice: string };
type RenderResult = { generationId: string; videoUrl: string; attribution: string; duration: number; musicId: string; imageGenerationIds: string[] };
const jsonResponse = async (response: Response) => {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Cette étape n’a pas pu être terminée.");
  return data;
};
const send = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonResponse);

// Verify the returned asset, not merely the provider's success JSON. Never retry generation.
export function verifySlideImage(url: string, fr = true): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const message = fr ? "Visuel inaccessible. Vérifie l’historique sans relancer la génération." : "Image unavailable. Check history without regenerating.";
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error(message)); }, 30000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error(message)); };
    image.src = url;
  });
}
function SlideThumbnail({ url, index, fr }: { url: string; index: number; fr: boolean }) {
  const [failed, setFailed] = useState(false);
  return <figure style={{ margin: 0, flex: "0 0 56px" }}>{failed
    ? <div role="img" aria-label={fr ? "Aperçu indisponible" : "Preview unavailable"} style={{ width: 56, height: 78, borderRadius: 6, background: "#f1f5f9", display: "grid", placeItems: "center", fontSize: 10, textAlign: "center" }}>{fr ? "Aperçu indisponible" : "Preview unavailable"}</div>
    : <img src={url} onError={() => setFailed(true)} alt={`${fr ? "Visuel" : "Image"} ${index + 1}`} style={{ display: "block", width: 56, height: 78, objectFit: "cover", borderRadius: 6 }} />}
    <figcaption style={{ fontSize: 11, textAlign: "center" }}>{index + 1}/5</figcaption></figure>;
}

export function SlideshowStudio({ product, locale, onComplete }: { product: Product | null; locale: string; onComplete?: () => void }) {
  const fr = locale !== "en";
  const [enabled, setEnabled] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [musicId, setMusicId] = useState("");
  const [duration, setDuration] = useState(25);
  const [campaignGoal, setCampaignGoal] = useState<CampaignGoal>("discover");
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [images, setImages] = useState<Array<{ id: string; url: string }>>([]);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [previewId, setPreviewId] = useState("");
  const [creditsUsed, setCreditsUsed] = useState(0);
  const running = useRef(false);
  const selectedTrack = tracks.find(track => track.id === musicId);
  const inputSignature = `${product?.id ?? ""}:${duration}:${campaignGoal}`;
  const draftSignature = useRef(inputSignature);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/studio/slideshow/config", { signal: controller.signal }).then(jsonResponse).then(data => { setEnabled(data.enabled === true); setTracks(Array.isArray(data.tracks) ? data.tracks : []); }).catch(() => setEnabled(false));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    // Inputs are disabled during a run. A deliberate product/duration change starts a new draft,
    // never an automatic repeat of a failed or uncertain chargeable request.
    if (running.current) return;
    if (draftSignature.current === inputSignature) return;
    draftSignature.current = inputSignature;
    setImages([]); setAttempted(false); setResult(null); setError(""); setStatus(""); setCreditsUsed(0);
  }, [inputSignature, busy]);

  async function prepare() {
    if (!product) return;
    setPlanning(true); setError("");
    try {
      const description = product.description ? new DOMParser().parseFromString(product.description, "text/html").body.textContent ?? "" : "";
      const data = await send("/api/studio/prompt", { mediaType: "video", videoMode: "slideshow", duration, campaignGoal, aspectRatio: "9:16", locale, product: { ...product, description } });
      const preparedPlan = data.slideshow as AdPlan | undefined;
      if (!preparedPlan?.slides?.length) throw new Error("Storyboard manquant.");
      if (preparedPlan.slides.length !== 5 || preparedPlan.slides[0].role !== "hook" || preparedPlan.slides[4].role !== "cta" || preparedPlan.slides.slice(1, 4).some(slide => slide.role !== "evidence")) throw new Error(fr ? "Le storyboard publicitaire doit contenir exactement 5 images : une accroche, trois visuels produit et un CTA final. Aucun visuel n’a été généré." : "The ad storyboard must contain exactly 5 images: a hook, three product slides and a final CTA. No images were generated.");
      return preparedPlan;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Préparation impossible."); }
    finally { setPlanning(false); }
  }
  async function generate() {
    if (!enabled || !product || attempted || running.current) return;
    running.current = true; setBusy(true); setAttempted(true); setError(""); setImages([]); setResult(null);
    const completed: Array<{ id: string; url: string }> = [];
    let totalCredits = 0;
    try {
      setStatus(fr ? "Préparation du diaporama…" : "Preparing slideshow…");
      const preparedPlan = await prepare();
      if (!preparedPlan) { setAttempted(false); setStatus(""); return; }
      const description = product.description ? new DOMParser().parseFromString(product.description, "text/html").body.textContent ?? "" : "";
      const slideshow = { product: { ...product, description }, duration, aspectRatio: "9:16", locale, campaignGoal, imageCount: preparedPlan.slides.length };
      setStatus(fr ? "Vérification…" : "Checking…");
      await send("/api/studio/slideshow/preflight", { musicId });
      for (const slide of preparedPlan.slides) {
        setStatus(fr ? `Génération du visuel ${slide.index + 1}/${preparedPlan.slides.length}…` : `Generating image ${slide.index + 1}/${preparedPlan.slides.length}…`);
        const data = await send("/api/studio/image", { prompt: slide.prompt, quality: "medium", resolution: "hd", orientation: "portrait", background: "opaque", referenceUrls: product.image ? [product.image] : [], slideshow: { ...slideshow, slideIndex: slide.index } });
        if (!data.generationId || !data.imageUrl) throw new Error("Réponse image incomplète. Ne relance pas la génération : vérifie l’historique.");
        totalCredits += Number(data.cost) || 0; setCreditsUsed(totalCredits);
        await verifySlideImage(data.imageUrl, fr);
        completed.push({ id: data.generationId, url: data.imageUrl });
        setImages([...completed]); setCreditsUsed(totalCredits);
      }
      setStatus(fr ? "Montage du diaporama…" : "Assembling slideshow…");
      const data = await send("/api/studio/slideshow/render", { generationIds: completed.map(image => image.id), duration, musicId });
      if (!data.generationId || !data.videoUrl) throw new Error(fr ? "Vidéo finale manquante. Vérifie l’historique sans relancer les images." : "Final video missing. Check history without regenerating images.");
      setResult(data); setStatus(fr ? "Diaporama prêt." : "Slideshow ready.");
      onComplete?.();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Génération interrompue."} ${fr ? "Aucune nouvelle tentative automatique. Les visuels terminés restent dans l’historique." : "No automatic retry. Completed images remain in history."}`);
      setStatus(fr ? "Arrêt du parcours — aucune étape payante n’est relancée." : "Stopped — no paid step is repeated.");
    } finally { running.current = false; setBusy(false); }
  }
  async function replaceMusic() {
    if (!result || running.current || result.musicId === musicId) return;
    running.current = true; setBusy(true); setError("");
    setStatus(fr ? "Remplacement de la musique…" : "Replacing music…");
    try {
      const data = await send("/api/studio/slideshow/remix", { generationId: result.generationId, musicId });
      setResult(data); setStatus(fr ? "Musique remplacée." : "Music replaced."); onComplete?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Remplacement impossible."); }
    finally { running.current = false; setBusy(false); }
  }
  function downloadCredits() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.attribution], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "VENDEO-CREDITS-MUSIQUE.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!enabled) return null;
  return <section className="app-card studio-form" style={{ marginTop: 20, display: "grid", gap: 16 }} aria-label={fr ? "Diaporama animé" : "Animated slideshow"}>
    <h2 style={{ margin: 0 }}>{fr ? "Diaporama" : "Slideshow"}</h2>
    {!product ? <small>{fr ? "Choisis un produit ci-dessus." : "Choose a product above."}</small> : null}
    <div className="studio-options">
      <label className="studio-field"><span>{fr ? "Objectif" : "Goal"}</span><select aria-label={fr ? "Objectif" : "Goal"} value={campaignGoal} disabled={busy || planning} onChange={event => setCampaignGoal(event.target.value as CampaignGoal)}><option value="discover">{fr ? "Découvrir" : "Discover"}</option><option value="buy">{fr ? "Acheter" : "Buy"}</option><option value="learn">{fr ? "En savoir plus" : "Learn"}</option><option value="contact">{fr ? "Contacter" : "Contact"}</option></select></label>
      <label className="studio-field"><span>{fr ? "Durée" : "Duration"}</span><select aria-label={fr ? "Durée" : "Duration"} value={duration} disabled={busy || planning} onChange={event => setDuration(Number(event.target.value))}>{SLIDESHOW_DURATIONS.map(seconds => <option key={seconds} value={seconds}>{seconds} {fr ? "secondes" : "seconds"}</option>)}</select></label>
      <label className="studio-field"><span>{fr ? "Musique" : "Music"}</span><select aria-label={fr ? "Musique" : "Music"} disabled={busy} value={musicId} onChange={event => { setMusicId(event.target.value); setPreviewId(""); }}><option value="">{fr ? "Sans musique" : "No music"}</option>{tracks.map(track => <option key={track.id} value={track.id}>{track.title} — {track.artist}</option>)}</select></label>
    </div>
    {selectedTrack ? <div style={{ display: "grid", gap: 8 }}>
      <button type="button" className="btn btn-ghost" onClick={() => setPreviewId(previewId === musicId ? "" : musicId)}>{fr ? "Écouter" : "Listen"}</button>
      {previewId ? <video aria-label={fr ? "Aperçu musical synchronisé" : "Music preview"} key={previewId} controls preload="none" src={`/api/studio/slideshow/music/${encodeURIComponent(previewId)}/preview`} style={{ width: "100%", maxWidth: 360, maxHeight: 180, background: "#f7f8fa" }} /> : null}
      <small>{fr ? "Attribution requise · " : "Attribution required · "}{selectedTrack.license}</small>
      <details><summary>{fr ? "Licence et crédits" : "License and credits"}</summary>
        <p>{selectedTrack.credit}</p>
        <small><a href={selectedTrack.licenseUrl} target="_blank" rel="noreferrer">{fr ? "Licence" : "License"}</a> · <a href={selectedTrack.sourceUrl} target="_blank" rel="noreferrer">Source</a></small>
        <p>{selectedTrack.youtubeNotice}</p>
        <small>{fr ? "Sur YouTube, ajoute les crédits exportés à la description. Pas de MP3 séparé ni de dépôt Content ID." : "On YouTube, add the exported credits to the description. No standalone MP3 or Content ID registration."}</small>
      </details>
    </div> : null}
    {!attempted ? <>
      <p className="studio-cost" style={{ margin: 0 }}>{fr ? `5 images · ${5 * imageCreditCost("hd", "medium")} crédits Studio` : `5 images · ${5 * imageCreditCost("hd", "medium")} Studio credits`}</p>
      <button type="button" className="btn btn-dark studio-generate" disabled={!product || busy || planning} onClick={() => void generate()}>{fr ? "Créer" : "Create"}</button>
      <small>{fr ? "Au moins 4 secondes de lecture par visuel. Montage et changement de musique sans crédits d’images supplémentaires." : "At least 4 seconds of reading per image. Assembly and music changes use no additional image credits."}</small>
    </> : null}
    {status ? <div role="status" aria-live="polite" aria-busy={busy} style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {busy ? <LoaderCircle className="animate-spin" data-testid="slideshow-spinner" aria-hidden="true" size={22} style={{ flexShrink: 0, animation: "spin 1s linear infinite" }} /> : null}
      <span>{status}</span>
    </div> : null}
    {images.length ? <div aria-label={fr ? "Visuels générés" : "Generated images"} style={{ display: "flex", flexWrap: "nowrap", gap: 8, overflowX: "auto", minWidth: 0, maxWidth: "100%", paddingBottom: 4 }}>{images.map((image, index) => <SlideThumbnail key={image.id} url={image.url} index={index} fr={fr} />)}</div> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {result ? <div style={{ display: "grid", gap: 12 }}>
      <h3>{fr ? "Ton diaporama est prêt" : "Your slideshow is ready"}</h3>
      <video key={result.videoUrl} aria-label="Diaporama final" controls preload="metadata" src={result.videoUrl} style={{ width: "100%", maxWidth: 420, maxHeight: 600, background: "#111", borderRadius: 12 }} />
      <a className="btn btn-dark" href={result.videoUrl} download="vendeo-diaporama.mp4" target="_blank" rel="noreferrer">{fr ? "Télécharger" : "Download"}</a>
      <button type="button" className="btn btn-ghost" disabled={busy || result.musicId === musicId} onClick={() => void replaceMusic()}>{fr ? "Remplacer la musique" : "Replace music"}</button>
      {result.attribution ? <details><summary>{fr ? "Crédits musique à joindre" : "Music credits to include"}</summary>
        <label className="studio-field"><span>{fr ? "À joindre à la vidéo et à sa description YouTube" : "Include with the video and in its YouTube description"}</span><textarea readOnly rows={6} value={result.attribution} /></label>
        <button type="button" className="btn btn-ghost" onClick={downloadCredits}>{fr ? "Exporter les crédits musique (.txt)" : "Export music credits (.txt)"}</button>
      </details> : null}
    </div> : null}
    {attempted ? <small>{fr ? `${images.length}/5 visuels · ${creditsUsed} crédits Studio utilisés.` : `${images.length}/5 images · ${creditsUsed} Studio credits used.`}</small> : null}
  </section>;
}
