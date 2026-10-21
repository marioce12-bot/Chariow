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
  const [planSignature, setPlanSignature] = useState("");
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

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/studio/slideshow/config", { signal: controller.signal }).then(jsonResponse).then(data => { setEnabled(data.enabled === true); setTracks(Array.isArray(data.tracks) ? data.tracks : []); }).catch(() => setEnabled(false));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    // Inputs are disabled during a run. A deliberate product/duration change starts a new draft,
    // never an automatic repeat of a failed or uncertain chargeable request.
    if (running.current) return;
    setPlan(null); setImages([]); setAttempted(false); setResult(null); setError(""); setStatus(""); setCreditsUsed(0);
  }, [inputSignature]);

  async function prepare() {
    if (!product || planning || running.current) return;
    setPlanning(true); setError("");
    try {
      const description = product.description ? new DOMParser().parseFromString(product.description, "text/html").body.textContent ?? "" : "";
      const data = await send("/api/studio/prompt", { mediaType: "video", videoMode: "slideshow", duration, campaignGoal, aspectRatio: "9:16", locale, product: { ...product, description } });
      const preparedPlan = data.slideshow as AdPlan | undefined;
      if (!preparedPlan?.slides?.length) throw new Error("Storyboard manquant.");
      if (preparedPlan.slides.length !== 5 || preparedPlan.slides[0].role !== "hook" || preparedPlan.slides[4].role !== "cta" || preparedPlan.slides.slice(1, 4).some(slide => slide.role !== "evidence")) throw new Error(fr ? "Le storyboard publicitaire doit contenir exactement 5 images : une accroche, trois visuels produit et un CTA final. Aucun visuel n’a été généré." : "The ad storyboard must contain exactly 5 images: a hook, three product slides and a final CTA. No images were generated.");
      setPlan(preparedPlan); setPlanSignature(inputSignature); setStatus(fr ? "Prompts prêts. Aucune image n’a encore été générée." : "Prompts ready. No images generated yet.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Préparation impossible."); }
    finally { setPlanning(false); }
  }
  async function generate() {
    if (!enabled || !product || !plan || planSignature !== inputSignature || attempted || running.current) return;
    running.current = true; setBusy(true); setAttempted(true); setError(""); setImages([]); setResult(null);
    const completed: Array<{ id: string; url: string }> = [];
    let totalCredits = 0;
    try {
      const description = product.description ? new DOMParser().parseFromString(product.description, "text/html").body.textContent ?? "" : "";
      const slideshow = { product: { ...product, description }, duration, aspectRatio: "9:16", locale, campaignGoal, imageCount: plan.slides.length };
      setStatus(fr ? "Vérification du moteur et de la musique avant toute génération payante…" : "Checking renderer and music before image generation…");
      await send("/api/studio/slideshow/preflight", { musicId });
      for (const slide of plan.slides) {
        setStatus(fr ? `Génération du visuel ${slide.index + 1}/${plan.slides.length}… Un seul appel, sans nouvelle tentative automatique.` : `Generating image ${slide.index + 1}/${plan.slides.length}… One request, no automatic retry.`);
        const data = await send("/api/studio/image", { prompt: slide.prompt, quality: "medium", resolution: "hd", orientation: "portrait", background: "opaque", referenceUrls: product.image ? [product.image] : [], slideshow: { ...slideshow, slideIndex: slide.index } });
        if (!data.generationId || !data.imageUrl) throw new Error("Réponse image incomplète. Ne relance pas la génération : vérifie l’historique.");
        completed.push({ id: data.generationId, url: data.imageUrl }); totalCredits += Number(data.cost) || 0;
        setImages([...completed]); setCreditsUsed(totalCredits);
      }
      setStatus(fr ? "Montage des images, fondus et musique… Aucune génération par modèle vidéo." : "Assembling images, transitions and music… No video model generation.");
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
  const sectionStyle = { marginTop: 20, display: "grid", gap: 16 } as const;
  return <section className="app-card studio-form" style={sectionStyle} aria-label={fr ? "Diaporama animé Preview" : "Animated slideshow Preview"}>
    <div><span className="eyebrow">Preview uniquement</span><h2>{fr ? "Diaporama animé" : "Animated slideshow"}</h2><p>{fr ? "Des visuels cohérents avec ton produit, des transitions et une musique que tu peux changer après le rendu." : "Product-faithful visuals, transitions and a soundtrack you can change after rendering."}</p></div>
    <div role="group" aria-label="Type de vidéo" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-dark" aria-pressed="true">{fr ? "Diaporama animé" : "Animated slideshow"}</button>
      <button type="button" className="btn btn-ghost" disabled aria-disabled="true" style={{ opacity: 0.4, cursor: "not-allowed" }}>{fr ? "Scènes avec personnages — bientôt" : "Character scenes — coming later"}</button>
    </div>
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{product?.image ? <img src={product.image} alt={product.name} style={{ width: 72, height: 88, objectFit: "contain", borderRadius: 10 }} /> : null}<strong>{product?.name ?? (fr ? "Choisis un produit dans la liste ci-dessus." : "Select a product above.")}</strong></div>
    <label className="studio-field"><span>{fr ? "Objectif de campagne" : "Campaign goal"}</span><select aria-label={fr ? "Objectif de campagne" : "Campaign goal"} value={campaignGoal} disabled={busy || planning} onChange={event => setCampaignGoal(event.target.value as CampaignGoal)}><option value="discover">{fr ? "Découvrir" : "Discover"}</option><option value="buy">{fr ? "Acheter" : "Buy"}</option><option value="learn">{fr ? "En savoir plus" : "Learn"}</option><option value="contact">{fr ? "Contacter" : "Contact"}</option></select></label>
    <label className="studio-field"><span>{fr ? "Durée de la vidéo" : "Video duration"}</span><select value={duration} disabled={busy || planning} onChange={event => setDuration(Number(event.target.value))}><option value={5}>5 {fr ? "secondes" : "seconds"}</option><option value={10}>10 {fr ? "secondes" : "seconds"}</option></select></label>
    <small>{fr ? "Carrousel publicitaire : exactement 5 images — une accroche qui donne envie de continuer, trois visuels promotionnels fidèles au produit et un appel à l’action final." : "Ad carousel: exactly 5 images — a hook that encourages viewers to continue, three product-faithful promotional slides and a final call to action."}</small>
    <button type="button" className="btn btn-ghost" disabled={!product || planning || busy || attempted} onClick={() => void prepare()}>{planning ? (fr ? "Préparation…" : "Preparing…") : (fr ? "1. Générer les prompts du diaporama" : "1. Prepare slideshow prompts")}</button>
    {plan ? <div><p><strong>{fr ? "Storyboard prêt" : "Storyboard ready"}</strong> · {plan.slides.length}/5 images · {duration}s · 9:16</p>{plan.countReason ? <p>{fr ? "Structure : " : "Structure: "}{plan.countReason}</p> : null}{plan.warnings?.length ? <ul>{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}{plan.slides.map(slide => <article key={slide.index} style={{ marginTop: 12, padding: 12, border: "1px solid var(--border, #ddd)", borderRadius: 10 }}><strong>{fr ? "Visuel" : "Slide"} {slide.index + 1} · {slide.role ?? (slide.index === 0 ? "hook" : slide.index === plan.slides.length - 1 ? "cta" : "evidence")}</strong>{slide.headline ? <h3>{slide.headline}</h3> : null}{slide.supportingCopy?.map((copy, index) => <p key={index}>{copy}</p>)}{slide.source ? <small>{fr ? "Source : description produit — " : "Source: product description — "}{slide.source.excerpt}</small> : null}{slide.layout ? <p><small>{fr ? "Mise en page : " : "Layout: "}{slide.layout}</small></p> : null}<details><summary>{fr ? "Prompt du visuel" : "Image prompt"}</summary><pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto", fontSize: 12 }}>{slide.prompt}</pre></details></article>)}</div> : null}
    <fieldset disabled={busy} style={{ border: "1px solid var(--border, #ddd)", borderRadius: 12, padding: 14 }}><legend>{fr ? "2. Choisir la musique" : "2. Choose music"}</legend><small>{fr ? "Musique clairement audible : niveau normalisé et crêtes protégées contre la saturation. Le même mixage est appliqué à l’aperçu et au remplacement audio." : "Clearly audible music: normalized loudness with protected peaks. Preview and audio replacement use the same mix."}</small>
      <label className="studio-field"><span>{fr ? "Bande-son" : "Soundtrack"}</span><select value={musicId} onChange={event => { setMusicId(event.target.value); setPreviewId(""); }}><option value="">{fr ? "Sans musique" : "No music"}</option>{tracks.map(track => <option key={track.id} value={track.id}>{track.title} — {track.artist}</option>)}</select></label>
      {selectedTrack ? <div style={{ display: "grid", gap: 8 }}><small>{selectedTrack.license} · <a href={selectedTrack.licenseUrl} target="_blank" rel="noreferrer">Licence</a> · <a href={selectedTrack.sourceUrl} target="_blank" rel="noreferrer">Source</a></small><p>{selectedTrack.credit}</p><small>{selectedTrack.youtubeNotice}</small><button type="button" className="btn btn-ghost" onClick={() => setPreviewId(previewId === musicId ? "" : musicId)}>{fr ? "Écouter / prévisualiser ce morceau" : "Listen / preview this track"}</button></div> : null}
      {previewId ? <video aria-label="Aperçu musical synchronisé" key={previewId} controls preload="none" src={`/api/studio/slideshow/music/${encodeURIComponent(previewId)}/preview`} style={{ width: "100%", maxWidth: 360, maxHeight: 180, background: "#f7f8fa", marginTop: 12 }} /> : null}
      <small style={{ display: "block", marginTop: 12 }}>{fr ? "Attribution obligatoire. Les MP3 ne sont pas proposés séparément. Sur YouTube, colle les crédits exportés dans la description. Ne soumets pas cette musique aux systèmes Content ID." : "Attribution required. MP3s are not offered separately. On YouTube, paste the exported credits into the description. Do not submit this music to Content ID."}</small>
    </fieldset>
    {!attempted ? <button type="button" className="btn btn-dark" disabled={!plan || planSignature !== inputSignature || !product || busy || planning} onClick={() => void generate()}>{fr ? `3. Générer le diaporama (${plan?.slides.length ?? 5} images)` : `3. Generate slideshow (${plan?.slides.length ?? 5} images)`}</button> : null}
    {!attempted ? <small>{fr ? "Le coût affiché est celui des images standard du Studio. Le montage et le remplacement audio ne relancent pas ces images." : "Standard Studio image pricing applies. Assembly and audio replacement do not regenerate images."} {plan ? `${plan.slides.length} × ${imageCreditCost("hd", "medium")} crédits Studio.` : ""}</small> : null}
    {status ? <div role="status" aria-live="polite" style={{ padding: 12, background: "var(--bg, #f5f5f5)", borderRadius: 10 }}>{status}{busy ? <progress aria-label="Progression du diaporama" style={{ display: "block", width: "100%", marginTop: 10 }} /> : null}</div> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {images.length ? <div aria-label="Visuels générés" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{images.map((image, index) => <figure key={image.id} style={{ margin: 0 }}><img src={image.url} alt={`Visuel généré ${index + 1}`} style={{ maxWidth: 150, maxHeight: 210, borderRadius: 10 }} /><figcaption>Visuel {index + 1}</figcaption></figure>)}</div> : null}
    {attempted ? <small>{images.length} visuel(s) terminé(s). Coût retourné par les appels image réussis : {creditsUsed} crédits Studio.</small> : null}
    {result ? <div style={{ display: "grid", gap: 12 }}><h3>{fr ? "Ton diaporama est prêt" : "Your slideshow is ready"}</h3><video key={result.videoUrl} aria-label="Diaporama final" controls preload="metadata" src={result.videoUrl} style={{ width: "100%", maxWidth: 420, maxHeight: 600, background: "#111", borderRadius: 12 }} /><a className="btn btn-dark" href={result.videoUrl} download="vendeo-diaporama.mp4" target="_blank" rel="noreferrer">{fr ? "Télécharger la vidéo MP4" : "Download MP4 video"}</a><button type="button" className="btn btn-ghost" disabled={busy || result.musicId === musicId} onClick={() => void replaceMusic()}>{fr ? "Remplacer la musique — garder les images" : "Replace soundtrack — keep images"}</button><label className="studio-field"><span>{fr ? "Crédits à joindre à la vidéo et à sa description YouTube" : "Credits to include with the video and in its YouTube description"}</span><textarea readOnly rows={6} value={result.attribution} /></label><button type="button" className="btn btn-ghost" onClick={downloadCredits}>{fr ? "Exporter les crédits musique (.txt)" : "Export music credits (.txt)"}</button></div> : null}
  </section>;
}
