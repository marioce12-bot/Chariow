"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignGoal, SlideshowPlan } from "@/lib/studio/slideshow-plan";
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

export function SlideshowStudio({ product, locale, onComplete }: { product: Product | null; locale: string; onComplete?: () => void }) {
  const fr = locale !== "en";
  const [enabled, setEnabled] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [musicId, setMusicId] = useState("");
  const [duration, setDuration] = useState(10);
  const [campaignGoal, setCampaignGoal] = useState<CampaignGoal>("discover");
  const [plan, setPlan] = useState<AdPlan | null>(null);
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
    setPlan(null); setImages([]); setAttempted(false); setResult(null); setError(""); setStatus(""); setCreditsUsed(0);
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
      setPlan(preparedPlan);
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
      setStatus(fr ? "Vérification du moteur et de la musique avant toute génération payante…" : "Checking renderer and music before image generation…");
      await send("/api/studio/slideshow/preflight", { musicId });
      for (const slide of preparedPlan.slides) {
        setStatus(fr ? `Génération du visuel ${slide.index + 1}/${preparedPlan.slides.length}…` : `Generating image ${slide.index + 1}/${preparedPlan.slides.length}…`);
        const data = await send("/api/studio/image", { prompt: slide.prompt, quality: "medium", resolution: "hd", orientation: "portrait", background: "opaque", referenceUrls: product.image ? [product.image] : [], slideshow: { ...slideshow, slideIndex: slide.index } });
        if (!data.generationId || !data.imageUrl) throw new Error("Réponse image incomplète. Ne relance pas la génération : vérifie l’historique.");
        completed.push({ id: data.generationId, url: data.imageUrl }); totalCredits += Number(data.cost) || 0;
        setImages([...completed]); setCreditsUsed(totalCredits);
      }
      setStatus(fr ? "Montage du diaporama…" : "Assembling slideshow…");
      const data = await send("/api/studio/slideshow/render", { generationIds: completed.map(image => image.id), duration, musicId });
      setResult(data); setStatus(fr ? "Diaporama terminé. Tu peux remplacer la musique sans regénérer les images." : "Slideshow ready. Change the soundtrack without generating images again.");
      onComplete?.();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Génération interrompue."} ${fr ? "Aucune nouvelle tentative automatique. Les visuels terminés restent dans l’historique." : "No automatic retry. Completed images remain in history."}`);
      setStatus(fr ? "Arrêt du parcours — aucune étape payante n’est relancée." : "Stopped — no paid step is repeated.");
    } finally { running.current = false; setBusy(false); }
  }
  async function replaceMusic() {
    if (!result || running.current || result.musicId === musicId) return;
    running.current = true; setBusy(true); setError("");
    setStatus(fr ? "Remplacement audio uniquement… Les images et la piste vidéo sont conservées." : "Replacing audio only… Images and video stream are preserved.");
    try {
      const data = await send("/api/studio/slideshow/remix", { generationId: result.generationId, musicId });
      setResult(data); setStatus(fr ? "Musique remplacée. Aucune image regénérée, aucun nouvel appel de génération." : "Music replaced. No images regenerated, no new generation request."); onComplete?.();
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
    {!product ? <small>{fr ? "Choisis un produit ci-dessus." : "Choose a product above."}</small> : null}
    <div className="studio-options">
      <label className="studio-field"><span>{fr ? "Objectif" : "Goal"}</span><select aria-label={fr ? "Objectif" : "Goal"} value={campaignGoal} disabled={busy || planning} onChange={event => setCampaignGoal(event.target.value as CampaignGoal)}><option value="discover">{fr ? "Découvrir" : "Discover"}</option><option value="buy">{fr ? "Acheter" : "Buy"}</option><option value="learn">{fr ? "En savoir plus" : "Learn"}</option><option value="contact">{fr ? "Contacter" : "Contact"}</option></select></label>
      <label className="studio-field"><span>{fr ? "Durée" : "Duration"}</span><select aria-label={fr ? "Durée" : "Duration"} value={duration} disabled={busy || planning} onChange={event => setDuration(Number(event.target.value))}><option value={5}>5 {fr ? "secondes" : "seconds"}</option><option value={10}>10 {fr ? "secondes" : "seconds"}</option></select></label>
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
      <button type="button" className="btn btn-dark studio-generate" disabled={!product || busy || planning} onClick={() => void generate()}>{fr ? "Générer le diaporama" : "Generate slideshow"}</button>
      <small>{fr ? "Montage et changement de musique sans crédits d’images supplémentaires." : "Assembly and music changes use no additional image credits."}</small>
    </> : null}
    {status ? <div role="status" aria-live="polite" style={{ padding: 12, background: "var(--bg, #f5f5f5)", borderRadius: 10 }}>{status}{busy ? <progress aria-label={fr ? "Progression du diaporama" : "Slideshow progress"} style={{ display: "block", width: "100%", marginTop: 10 }} /> : null}</div> : null}
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
    {plan ? <details><summary>{fr ? "Détails du diaporama" : "Slideshow details"}</summary>
      <p>{plan.slides.length}/5 images · {duration}s · 9:16</p>
      {plan.countReason ? <p>{plan.countReason}</p> : null}
      {plan.warnings?.length ? <ul>{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
      {plan.slides.map(slide => <article key={slide.index} style={{ marginTop: 12 }}>
        <strong>{fr ? "Visuel" : "Slide"} {slide.index + 1}</strong>
        {slide.headline ? <h3>{slide.headline}</h3> : null}
        {slide.supportingCopy?.map((copy, index) => <p key={index}>{copy}</p>)}
        {slide.source ? <small>{fr ? "Source : description produit — " : "Source: product description — "}{slide.source.excerpt}</small> : null}
        <details><summary>{fr ? "Prompt du visuel" : "Image prompt"}</summary><pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto", fontSize: 12 }}>{slide.prompt}</pre></details>
      </article>)}
      {images.length ? <div aria-label="Visuels générés" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{images.map((image, index) => <img key={image.id} src={image.url} alt={`Visuel ${index + 1}`} style={{ maxWidth: 100, maxHeight: 140, borderRadius: 10 }} />)}</div> : null}
      {attempted ? <small>{fr ? `${images.length} visuel(s) terminé(s) · ${creditsUsed} crédits Studio utilisés.` : `${images.length} image(s) completed · ${creditsUsed} Studio credits used.`}</small> : null}
    </details> : null}
  </section>;
}
