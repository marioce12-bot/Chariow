"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignGoal } from "@/lib/studio/slideshow-plan";
import { LoaderCircle } from "lucide-react";
import { SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
import { imageCreditCost } from "@/lib/studio/credits";
import { startEstimatedGenerationProgress } from "@/lib/studio/generation-progress";

type Product = {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
};
type Track = {
  id: string;
  title: string;
  artist: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  credit: string;
  youtubeNotice: string;
};
type RenderResult = {
  generationId: string;
  videoUrl: string;
  attribution: string;
  duration: number;
  musicId: string;
  imageGenerationIds: string[];
};
type Task = {
  id: string;
  kind: string;
  status: "processing" | "completed" | "failed";
  progress?: number;
  message?: string;
  error?: string;
  images?: Array<{ id: string; url: string }>;
  result?: RenderResult;
  createdAt?: string;
  updatedAt?: string;
  revision?: number;
  phase?: string;
  creditsConsumed?: number;
  creditState?: "confirmed" | "uncertain";
};
const jsonResponse = async (response: Response) => {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Cette étape n’a pas pu être terminée.") as Error & { code?: string; details?: unknown };
    error.code = data.code; error.details = data.details; throw error;
  }
  return data;
};
const send = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(jsonResponse);
export function verifySlideImage(url: string, fr = true): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const message = fr
      ? "Visuel inaccessible. Vérifie l’historique sans relancer la génération."
      : "Image unavailable. Check history without regenerating.";
    const timer = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error(message));
    }, 30000);
    image.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error(message));
    };
    image.src = url;
  });
}
function SlideThumbnail({
  url,
  index,
  fr,
}: {
  url: string;
  index: number;
  fr: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <figure style={{ margin: 0, flex: "0 0 56px" }}>
      {failed ? (
        <div
          role="img"
          aria-label={fr ? "Aperçu indisponible" : "Preview unavailable"}
          style={{
            width: 56,
            height: 78,
            borderRadius: 6,
            background: "#f1f5f9",
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            textAlign: "center",
          }}
        >
          {fr ? "Aperçu indisponible" : "Preview unavailable"}
        </div>
      ) : (
        <img
          src={url}
          onError={() => setFailed(true)}
          alt={`${fr ? "Visuel" : "Image"} ${index + 1}`}
          style={{
            display: "block",
            width: 56,
            height: 78,
            objectFit: "cover",
            borderRadius: 6,
          }}
        />
      )}
      <figcaption style={{ fontSize: 11, textAlign: "center" }}>
        {index + 1}/5
      </figcaption>
    </figure>
  );
}
export function SlideshowStudio({
  product,
  locale,
  onComplete,
}: {
  product: Product | null;
  locale: string;
  onComplete?: () => void;
}) {
  const fr = locale !== "en",
    [enabled, setEnabled] = useState(false),
    [tracks, setTracks] = useState<Track[]>([]),
    [musicId, setMusicId] = useState(""),
    [duration, setDuration] = useState(25),
    [campaignGoal, setCampaignGoal] = useState<CampaignGoal>("discover"),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [images, setImages] = useState<Array<{ id: string; url: string }>>([]),
    [attempted, setAttempted] = useState(false),
    [result, setResult] = useState<RenderResult | null>(null),
    [previewId, setPreviewId] = useState(""),
    [creditsUsed, setCreditsUsed] = useState(0),
    [recovery, setRecovery] = useState(false),
    [pendingRequest, setPendingRequest] = useState(false),
    [temporaryDescription, setTemporaryDescription] = useState(product?.description ?? ""),
    [technicalDetails, setTechnicalDetails] = useState("");
  const running = useRef(false),
    taskRef = useRef<Task | null>(null),
    initialDone = useRef(false),
    signature = useRef(`${product?.id ?? ""}`);
  const currentSignature = JSON.stringify([product?.id ?? "", temporaryDescription, duration, campaignGoal, musicId]);
  const currentSignatureRef = useRef(currentSignature);
  currentSignatureRef.current = currentSignature;
  const displayedProgressRef = useRef(0);
  const progressStartedAtRef = useRef(Date.now());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const selectedTrack = tracks.find((track) => track.id === musicId);
  const creationDescription = () => {
    const existing = product?.description?.trim() ?? "";
    const supplied = temporaryDescription.trim();
    return !existing || supplied.includes(existing) ? supplied : `${existing}\n${supplied}`;
  };
  const progressStageRef = useRef("");
  const showProgress = (task: Task) => {
    const key = `${task.id}:${task.revision ?? ""}:${task.images?.length ?? 0}`;
    if (progressStageRef.current !== key) {
      progressStageRef.current = key;
      const updated = Date.parse(task.updatedAt ?? "");
      progressStartedAtRef.current = Number.isFinite(updated) ? updated : Date.now();
    }
    const count = task.images?.length ?? 0;
    const montage = count >= 5 || /montage|render|assembly/i.test(task.message ?? "");
    const floor = Math.max(task.progress ?? 1, montage ? 90 : count ? 5 + count * 17 : task.revision === 0 ? 1 : 5);
    const ceiling = montage ? 99.8 : task.revision === 0 ? 4.9 : Math.min(89.9, 5 + (count + 1) * 17 - 0.1);
    const elapsed = Math.max(0, Date.now() - progressStartedAtRef.current);
    const estimated = floor + Math.max(0, ceiling - floor) * (1 - Math.exp(-elapsed / 90_000));
    displayedProgressRef.current = Math.min(99.8, Math.max(displayedProgressRef.current, Math.round(estimated * 10) / 10));
    setStatus(`${task.message || (fr ? "Génération en cours…" : "Generating…")} ${displayedProgressRef.current}%`);
  };
  const applyTask = (task: Task, notify = false) => {
    const wasProcessing = taskRef.current?.status === "processing";
    const changedTask = taskRef.current?.id !== task.id;
    if (taskRef.current?.id !== task.id) { displayedProgressRef.current = 0; progressStartedAtRef.current = Date.now(); }
    taskRef.current = task;
    setAttempted(true);
    setImages(task.images ?? []);
    setCreditsUsed(task.creditsConsumed ?? (task.images?.length ?? 0) * imageCreditCost("hd", "medium"));
    setBusy(task.status === "processing");
    const stage = task.message || (task.phase === "queued" ? (fr ? "En attente…" : "Queued…") : task.phase === "running" ? (fr ? "Génération des visuels…" : "Generating images…") : "");
    if (task.status === "processing") showProgress(task);
    else setStatus(task.status === "failed" ? "" : task.message || (task.status === "completed" ? (fr ? "Diaporama prêt." : "Slideshow ready.") : ""));
    const insufficient = task.status === "failed" && /INSUFFICIENT_PRODUCT_DETAILS|détails.*produit|product details|informations produit.*insuffisantes|not enough.*product/i.test(`${task.error ?? ""} ${task.message ?? ""}`);
    if (insufficient) { setRecovery(true); setStatus(""); setTemporaryDescription((current) => current || product?.description || ""); setTechnicalDetails(task.error || task.message || ""); }
    setError(
      task.status === "failed" && !insufficient
        ? task.error ||
            (fr
              ? "Génération échouée. Consulte l’historique avant toute nouvelle tentative."
              : "Generation failed. Check history before trying again.")
        : "",
    );
    if (task.status === "completed" && task.result) {
      setResult(task.result);
      if (changedTask || wasProcessing) {
        setMusicId(task.result.musicId);
        setDuration(task.result.duration);
      }
      if (notify || wasProcessing) onCompleteRef.current?.();
    } else setResult(null);
  };
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const stopProgress = startEstimatedGenerationProgress(() => {
      if (alive && taskRef.current?.status === "processing") showProgress(taskRef.current);
    });
    const poll = async () => {
      try {
        const response = await fetch("/api/studio/tasks", {
          signal: controller.signal,
        });
        const data = await jsonResponse(response);
        if (!alive) return;
        const pendingId = (() => { try { return localStorage.getItem(`vendeo-slideshow-request:${product?.id ?? ""}`); } catch { return null; } })();
        const slideshowTasks = ((data.tasks as Task[]) || []).filter((item) => item.kind === "slideshow");
        const task = (pendingId ? slideshowTasks.find((item) => item.id === pendingId) : null) ?? (!pendingId ? slideshowTasks[0] : null);
        if (task) {
          applyTask(task);
          try { localStorage.removeItem(`vendeo-slideshow-request:${product?.id ?? ""}`); } catch { /* ignore */ }
          setPendingRequest(false);
        } else if (pendingId) {
          setPendingRequest(true); setBusy(false); setReady(true); setAttempted(true);
          setError(fr ? "Lancement non confirmé. Vérifie l’historique avant toute nouvelle génération." : "Launch is unconfirmed. Check history before generating again.");
        } else if (!taskRef.current) { setBusy(false); setAttempted(false); }
        initialDone.current = true;
        setReady(true);
      } catch {
        if (alive && !initialDone.current) {
          setReady(false);
          setError(
            fr
              ? "Vérification du suivi en cours. Aucun nouveau lancement avant récupération."
              : "Checking existing work before allowing a new generation.",
          );
        }
      }
    };
    fetch("/api/studio/slideshow/config", { signal: controller.signal })
      .then(jsonResponse)
      .then((data) => {
        if (alive) {
          setEnabled(data.enabled === true);
          setTracks(Array.isArray(data.tracks) ? data.tracks : []);
        }
      })
      .catch(() => {
        if (alive) setEnabled(false);
      });
    void poll();
    const timer = setInterval(() => {
      let pending = false;
      try { pending = !!localStorage.getItem(`vendeo-slideshow-request:${product?.id ?? ""}`); } catch { /* ignore */ }
      if (!initialDone.current || taskRef.current?.status === "processing" || pending) void poll();
    }, 4000);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
      stopProgress();
    };
  }, []);
  useEffect(() => {
    const next = product?.id ?? "";
    if (signature.current === next) return;
    signature.current = next;
    if (taskRef.current?.status === "processing") return;
    setImages([]);
    setResult(null);
    setError("");
    setStatus("");
    setAttempted(false);
    setCreditsUsed(0);
    setRecovery(false); setTemporaryDescription(product?.description ?? "");
  }, [product?.id]);
  async function generate() {
    if (!enabled || !ready || !product || busy || running.current || taskRef.current?.status === "processing") return;
    if (recovery && !temporaryDescription.trim()) return;
    running.current = true;
    setBusy(true); setAttempted(true); setError(""); setImages([]); setResult(null);
    setStatus(fr ? "Vérification des informations…" : "Checking product details…");
    try {
      await send("/api/studio/prompt", { product: { ...product, description: creationDescription() }, mediaType: "video", videoMode: "slideshow", duration, aspectRatio: "9:16", campaignGoal, locale, musicId });
      setRecovery(false); setTechnicalDetails("");
      await createTask();
    } catch (cause) {
      const failure = cause as Error & { code?: string; details?: unknown };
      const insufficient = failure.code === "INSUFFICIENT_PRODUCT_DETAILS" || /détails.*produit|product details|informations produit.*insuffisantes|not enough.*product/i.test(failure.message);
      if (insufficient) {
        setRecovery(true); setStatus("");
        setTechnicalDetails(typeof failure.details === "string" ? failure.details : failure.details ? JSON.stringify(failure.details, null, 2) : "");
        setError(""); setReady(true); return;
      }
      if (failure.message === "Lancement non confirmé") return;
      setBusy(false); setStatus("");
      setError(`${cause instanceof Error ? cause.message : "Erreur réseau."} ${fr ? "Consulte l’historique avant de réessayer." : "Check history before retrying."}`);
    } finally { running.current = false; setBusy((taskRef.current as Task | null)?.status === "processing" || pendingRequest); }
  }
  async function createTask() {
    if (!product || !ready || taskRef.current?.status === "processing") return;
    const key = `vendeo-slideshow-request:${product.id}`;
    let id = "";
    try { id = localStorage.getItem(key) || ""; } catch { /* session persistence may be unavailable */ }
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem(key, id); } catch { /* backend idempotency still protects this request */ }
    }
    setStatus(fr ? "Lancement de la génération…" : "Starting generation…");
    try {
      const response = await send("/api/studio/tasks", { id, kind: "slideshow", input: { product: { ...product, description: creationDescription() }, duration, campaignGoal, locale, musicId } });
      const task = response.task as Task;
      if (!task) throw new Error("Réponse de tâche invalide.");
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      applyTask(task, task.status === "completed");
    } catch {
      // Never issue another paid POST when acceptance is uncertain. Poll only the task list.
      setStatus(""); setBusy(false); setReady(false);
      setPendingRequest(true);
      setError(fr ? "Lancement non confirmé. Vérifie l’historique avant de réessayer ; aucune relance automatique." : "Launch not confirmed. Check history before retrying; no automatic retry.");
      throw new Error("Lancement non confirmé");
    }
  }
  async function replaceMusic() {
    if (!result || running.current || result.musicId === musicId) return;
    running.current = true;
    setBusy(true);
    setError("");
    setStatus(fr ? "Remplacement de la musique…" : "Replacing music…");
    try {
      const data = await send("/api/studio/slideshow/remix", {
        generationId: result.generationId,
        musicId,
      });
      setResult(data);
      setStatus(fr ? "Musique remplacée." : "Music replaced.");
      onComplete?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Remplacement impossible.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function downloadCredits() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([result.attribution], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "VENDEO-CREDITS-MUSIQUE.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!enabled) return null;
  return (
    <section
      className="app-card studio-form"
      style={{ marginTop: 20, display: "grid", gap: 16 }}
      aria-label={fr ? "Diaporama animé" : "Animated slideshow"}
    >
      <h2 style={{ margin: 0 }}>{fr ? "Diaporama" : "Slideshow"}</h2>
      {!product ? (
        <small>
          {fr ? "Choisis un produit ci-dessus." : "Choose a product above."}
        </small>
      ) : null}
      <div className="studio-options">
        <label className="studio-field">
          <span>{fr ? "Objectif" : "Goal"}</span>
          <select
            aria-label={fr ? "Objectif" : "Goal"}
            value={campaignGoal}
            disabled={busy}
            onChange={(e) => setCampaignGoal(e.target.value as CampaignGoal)}
          >
            <option value="discover">{fr ? "Découvrir" : "Discover"}</option>
            <option value="buy">{fr ? "Acheter" : "Buy"}</option>
            <option value="learn">{fr ? "En savoir plus" : "Learn"}</option>
            <option value="contact">{fr ? "Contacter" : "Contact"}</option>
          </select>
        </label>
        <label className="studio-field">
          <span>{fr ? "Durée" : "Duration"}</span>
          <select
            aria-label={fr ? "Durée" : "Duration"}
            value={duration}
            disabled={busy}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {SLIDESHOW_DURATIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} {fr ? "secondes" : "seconds"}
              </option>
            ))}
          </select>
        </label>
        <label className="studio-field">
          <span>{fr ? "Musique" : "Music"}</span>
          <select
            aria-label={fr ? "Musique" : "Music"}
            disabled={busy}
            value={musicId}
            onChange={(e) => {
              setMusicId(e.target.value);
              setPreviewId("");
            }}
          >
            <option value="">{fr ? "Sans musique" : "No music"}</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.title} — {track.artist}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedTrack ? (
        <div style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPreviewId(previewId === musicId ? "" : musicId)}
          >
            {fr ? "Écouter" : "Listen"}
          </button>
          {previewId ? (
            <video
              aria-label={fr ? "Aperçu musical synchronisé" : "Music preview"}
              key={previewId}
              controls
              preload="none"
              src={`/api/studio/slideshow/music/${encodeURIComponent(previewId)}/preview`}
              style={{
                width: "100%",
                maxWidth: 360,
                maxHeight: 180,
                background: "#f7f8fa",
              }}
            />
          ) : null}
          <small>
            {fr ? "Attribution requise · " : "Attribution required · "}
            {selectedTrack.license}
          </small>
          <details>
            <summary>
              {fr ? "Licence et crédits" : "License and credits"}
            </summary>
            <p>{selectedTrack.credit}</p>
            <small>
              <a
                href={selectedTrack.licenseUrl}
                target="_blank"
                rel="noreferrer"
              >
                {fr ? "Licence" : "License"}
              </a>{" "}
              ·{" "}
              <a
                href={selectedTrack.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Source
              </a>
            </small>
            <p>{selectedTrack.youtubeNotice}</p>
            <small>
              {fr
                ? "Sur YouTube, ajoute les crédits exportés à la description. Pas de MP3 séparé ni de dépôt Content ID."
                : "On YouTube, add the exported credits to the description. No standalone MP3 or Content ID registration."}
            </small>
          </details>
        </div>
      ) : null}
      {(!pendingRequest && (!attempted || taskRef.current?.status === "completed" || taskRef.current?.status === "failed" || recovery)) && !busy && ready ? (
        <>
          {recovery ? <><p>{fr ? "Ajoute une précision utile sur le produit pour préparer le diaporama." : "Add a useful product detail to prepare the slideshow."}</p><label>{fr ? "Description temporaire" : "Temporary description"}<textarea aria-label={fr ? "Description temporaire" : "Temporary description"} rows={4} value={temporaryDescription} disabled={busy} onChange={e => setTemporaryDescription(e.target.value)} /></label></> : null}
          <p className="studio-cost">{fr ? `Coût : ${5 * imageCreditCost("hd", "medium")} crédits Studio` : `Cost: ${5 * imageCreditCost("hd", "medium")} Studio credits`}</p>
          <button type="button" className="btn btn-dark studio-generate" disabled={!product || busy || !ready || (!!taskRef.current?.images?.length && taskRef.current.status === "failed")} onClick={() => void generate()}>{recovery ? (fr ? "Relancer" : "Retry") : (fr ? "Créer" : "Create")}</button>
        </>
      ) : null}
      {pendingRequest ? <p role="status">{fr ? "Vérifie l’historique ; aucune nouvelle génération ne sera lancée automatiquement." : "Check history; no new generation will be started automatically."}</p> : null}
      {status ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy={busy}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          {busy ? (
            <LoaderCircle
              className="animate-spin"
              data-testid="slideshow-spinner"
              aria-hidden="true"
              size={22}
              style={{ flexShrink: 0 }}
            />
          ) : null}
          <span>{status}</span>
        </div>
      ) : null}
      {images.length ? (
        <div
          aria-label={fr ? "Visuels générés" : "Generated images"}
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: 8,
            overflowX: "auto",
            minWidth: 0,
            maxWidth: "100%",
            paddingBottom: 4,
          }}
        >
          {images.map((image, index) => (
            <SlideThumbnail
              key={image.id}
              url={image.url}
              index={index}
              fr={fr}
            />
          ))}
        </div>
      ) : null}
      {error && !recovery ? <p role="alert" className="form-error">{error}</p> : null}
      {technicalDetails ? <details><summary>{fr ? "Détails techniques" : "Technical details"}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{technicalDetails}</pre></details> : null}
      {result ? (
        <div style={{ display: "grid", gap: 12 }}>
          <h3>{fr ? "Ton diaporama est prêt" : "Your slideshow is ready"}</h3>
          <video
            key={result.videoUrl}
            aria-label="Diaporama final"
            controls
            preload="metadata"
            src={result.videoUrl}
            style={{
              width: "100%",
              maxWidth: 420,
              maxHeight: 600,
              background: "#111",
              borderRadius: 12,
            }}
          />
          <a
            className="btn btn-dark"
            href={result.videoUrl}
            download="vendeo-diaporama.mp4"
            target="_blank"
            rel="noreferrer"
          >
            {fr ? "Télécharger" : "Download"}
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || result.musicId === musicId}
            onClick={() => void replaceMusic()}
          >
            {fr ? "Remplacer la musique" : "Replace music"}
          </button>
          {result.attribution ? (
            <details>
              <summary>
                {fr ? "Crédits musique à joindre" : "Music credits to include"}
              </summary>
              <label className="studio-field">
                <span>
                  {fr
                    ? "À joindre à la vidéo et à sa description YouTube"
                    : "Include with the video and in its YouTube description"}
                </span>
                <textarea readOnly rows={6} value={result.attribution} />
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={downloadCredits}
              >
                {fr
                  ? "Exporter les crédits musique (.txt)"
                  : "Export music credits (.txt)"}
              </button>
            </details>
          ) : null}
        </div>
      ) : null}
      {attempted ? (
        <small>
          {fr
            ? `${images.length}/5 visuels · ${creditsUsed} crédits Studio utilisés.`
            : `${images.length}/5 images · ${creditsUsed} Studio credits used.`}
        </small>
      ) : null}
    </section>
  );
}
