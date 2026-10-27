"use client";
import { useEffect, useRef, useState } from "react";
import { Film, Sparkles } from "lucide-react";
import type { CampaignGoal } from "@/lib/studio/slideshow-plan";
import { LaunchProgress } from "@/components/chat/LaunchProgress";
import { SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
import { imageCreditCost } from "@/lib/studio/credits";
import type { CreativePerformanceIdea } from "@/lib/creative-performance/client";
import { startEstimatedGenerationProgress } from "@/lib/studio/generation-progress";
import { publicSlideshowError, slideshowPublicFailure } from "@/lib/studio/slideshow-errors";
import { VideoDownloadButton } from "@/components/studio/VideoDownloadButton";

type Product = {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
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
  errorCode?: string;
  images?: Array<{ id: string; url: string }>;
  result?: RenderResult;
  createdAt?: string;
  updatedAt?: string;
  revision?: number;
  phase?: string;
  creditsConsumed?: number;
  creditState?: "confirmed" | "uncertain";
  input?: { product?: Product; duration?: number; musicId?: string; campaignGoal?: CampaignGoal; locale?: string; variationId?: string };
  resume?: { allowed: boolean; reason: string | null; cost: number; nextStep: string; requiresConfirmation: boolean };
};
type SlideshowRequestError = Error & {
  code?: string;
  details?: unknown;
  status?: number;
  responseReadable?: boolean;
  duration?: number;
  requiredWords?: number;
  missingWords?: number;
  wordCount?: number;
};
const MAX_PENDING_MARKER_POLLS = 15;
const jsonResponse = async <T extends Record<string, unknown> = Record<string, unknown>>(response: Response, locale = "fr"): Promise<T> => {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = await response.json();
    data = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    const error = new Error(locale === "en" ? "Unreadable server response." : "Réponse du serveur illisible.") as SlideshowRequestError;
    error.status = response.status;
    error.responseReadable = false;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(publicSlideshowError(data.message || data.error, typeof data.locale === "string" ? data.locale : locale, typeof data.code === "string" ? data.code : null, data)) as SlideshowRequestError;
    if (typeof data.code === "string") error.code = data.code;
    error.details = data.details;
    error.status = response.status;
    error.responseReadable = true;
    for (const field of ["duration", "requiredWords", "missingWords", "wordCount"] as const) {
      if (typeof data[field] === "number") error[field] = data[field];
    }
    throw error;
  }
  return data as T;
};
const send = <T extends Record<string, unknown> = Record<string, unknown>>(url: string, body: unknown, locale = "fr"): Promise<T> =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => jsonResponse<T>(response, locale));
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
  onRefreshProduct,
  selectedTaskId = null,
  creativePerformanceSource = null,
  creativeIdea = null,
}: {
  product: Product | null;
  locale: string;
  onComplete?: () => void;
  onRefreshProduct?: (productId: string) => Promise<Product | null>;
  selectedTaskId?: string | null;
  creativePerformanceSource?: Record<string, unknown> | null;
  creativeIdea?: CreativePerformanceIdea | null;
}) {
  const fr = locale !== "en",
    [enabled, setEnabled] = useState(false),
    [musicId, setMusicId] = useState(""),
    [voiceoverEnabled, setVoiceoverEnabled] = useState(false),
    [voiceoverTestAllowed, setVoiceoverTestAllowed] = useState(false),
    [duration, setDuration] = useState(25),
    [campaignGoal, setCampaignGoal] = useState<CampaignGoal>("discover"),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [images, setImages] = useState<Array<{ id: string; url: string }>>([]),
    [attempted, setAttempted] = useState(false),
    [result, setResult] = useState<RenderResult | null>(null),
    [creditsUsed, setCreditsUsed] = useState(0),
    [recovery, setRecovery] = useState(false),
    [pendingRequest, setPendingRequest] = useState(false),
    [refreshedProduct, setRefreshedProduct] = useState<Product | null>(null),
    [resumeTask, setResumeTask] = useState<Task | null>(null),
    [resumeConfirmed, setResumeConfirmed] = useState(false),
    [available, setAvailable] = useState<number | null>(null);
  const activeProduct = refreshedProduct?.id === product?.id ? refreshedProduct : product;
  const slideshowCost = 5 * imageCreditCost("hd", "medium");
  const lacksCredits = available !== null && available < slideshowCost;
  const resumeCost = resumeTask?.resume?.allowed ? resumeTask.resume.cost : 0;
  const lacksResumeCredits = available !== null && resumeCost > 0 && available < resumeCost;
  // Read-only balance lookup (balance minus credits already reserved). Fail-open: if the balance is
  // unavailable or malformed, the UI does not block and the server (which re-checks) decides.
  const refreshCredits = () =>
    fetch("/api/studio/credits", { cache: "no-store" })
      .then(jsonResponse)
      .then((data) => {
        if (typeof data?.balance !== "number") return;
        setAvailable(Math.max(0, data.balance - (typeof data.reserved === "number" ? data.reserved : 0)));
      })
      .catch(() => undefined);
  const variationIdRef = useRef("");
  const newDraftRef = useRef(false);
  const selectedTaskRef = useRef(selectedTaskId);
  const productRef = useRef(activeProduct);
  productRef.current = activeProduct;
  const requestIdRef = useRef("");
  const requestProductIdRef = useRef(activeProduct?.id ?? "");
  const pendingPollCountRef = useRef(0);
  const pollingRef = useRef(false);
  const pollRef = useRef<(() => Promise<void>) | null>(null);
  const loadedHistoryRef = useRef<string | null>(null);
  const running = useRef(false),
    taskRef = useRef<Task | null>(null),
    initialDone = useRef(false),
    signature = useRef(`${activeProduct?.id ?? ""}`);
  const displayedProgressRef = useRef(0);
  const progressStartedAtRef = useRef(Date.now());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const requestIdFor = (productId: string) => {
    let stored = "";
    try { stored = localStorage.getItem(`vendeo-slideshow-request:${productId}`) || ""; } catch { /* storage can be unavailable */ }
    if (stored) {
      requestIdRef.current = stored;
      requestProductIdRef.current = productId;
      return stored;
    }
    return requestProductIdRef.current === productId ? requestIdRef.current : "";
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
    setProgress(displayedProgressRef.current);
    setStatus(task.message || (fr ? "Génération en cours…" : "Generating…"));
  };
  const applyTask = (task: Task, notify = false) => {
    const wasProcessing = taskRef.current?.status === "processing";
    const changedTask = taskRef.current?.id !== task.id;
    if (taskRef.current?.id !== task.id) { displayedProgressRef.current = 0; progressStartedAtRef.current = Date.now(); }
    taskRef.current = task;
    setResumeTask(task.status === "failed" ? task : null);
    if (changedTask) setResumeConfirmed(false);
    if (task.input && (changedTask || loadedHistoryRef.current === task.id)) {
      if (task.input.variationId) variationIdRef.current = task.input.variationId;
      if (task.input.duration) setDuration(task.input.duration);
      if (typeof task.input.musicId === "string") setMusicId(task.input.musicId);
      if (task.input.campaignGoal) setCampaignGoal(task.input.campaignGoal);
    }
    setAttempted(true);
    setImages(task.images ?? []);
    setCreditsUsed(task.creditsConsumed ?? (task.images?.length ?? 0) * imageCreditCost("hd", "medium"));
    setBusy(task.status === "processing");
    const stage = task.message || (task.phase === "queued" ? (fr ? "En attente…" : "Queued…") : task.phase === "running" ? (fr ? "Génération des visuels…" : "Generating images…") : "");
    if (task.status === "processing") showProgress(task);
    else setStatus(task.status === "completed" && task.result ? (fr ? "Diaporama prêt." : "Slideshow ready.") : "");
    const insufficient = task.status === "failed" && (task.errorCode === "INSUFFICIENT_PRODUCT_DETAILS" || /^(Add product details below, then click Retry\.|Complète la description ci-dessous, puis appuie sur Relancer\.)$/.test(task.error ?? task.message ?? ""));
    if (!insufficient) setRecovery(false);
    if (insufficient) {
      setRecovery(true);
      setStatus("");
    }
    setError(
      insufficient
        ? (fr ? "Complète la description du produit dans ta boutique, puis appuie sur « Réessayer »." : "Complete the product description in your store, then click “Retry”.")
        : (task.status === "failed" || (task.status === "completed" && !task.result))
          ? publicSlideshowError(task.error || task.message || slideshowPublicFailure(fr ? "fr" : "en"), fr ? "fr" : "en")
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
      if (!alive || document.visibilityState === "hidden" || pollingRef.current || running.current) return;
      const productId = productRef.current?.id ?? "";
      const pendingBeforeRequest = requestIdFor(productId);
      if (pendingBeforeRequest && pendingPollCountRef.current >= MAX_PENDING_MARKER_POLLS) {
        setPendingRequest(true); setBusy(false); setReady(true); setAttempted(true);
        setError(fr ? "Lancement à vérifier. Vérifie l’historique ; tu peux réessayer avec le même identifiant." : "Launch to verify. Check history; you can retry with the same ID.");
        return;
      }
      if (pendingBeforeRequest) pendingPollCountRef.current++;
      pollingRef.current = true;
      try {
        const exactId = selectedTaskRef.current || taskRef.current?.id;
        const response = await fetch(exactId ? `/api/studio/tasks/${encodeURIComponent(exactId)}/continue` : "/api/studio/tasks", {
          signal: controller.signal, cache: "no-store",
        });
        const data = await jsonResponse<{ task?: Task; tasks?: Task[] }>(response, fr ? "fr" : "en");
        if (!alive || productRef.current?.id !== (productId || undefined)) return;
        const pendingId = requestIdFor(productId);
        const slideshowTasks = ((data.task ? [data.task] : data.tasks as Task[]) || []).filter((item) => item.kind === "slideshow");
        let task = exactId ? slideshowTasks.find((item) => item.id === exactId) : null;
        task ??= (pendingId ? slideshowTasks.find((item) => item.id === pendingId) : null) ?? (!pendingId ? slideshowTasks[0] : null);
        if (!exactId && !pendingId && newDraftRef.current && task?.status !== "processing") task = undefined;
        if (task) {
          if (task.status === "failed" && !task.resume) {
            const detail = await fetch(`/api/studio/tasks/${encodeURIComponent(task.id)}/continue`, { cache: "no-store", signal: controller.signal }).then((r) => jsonResponse<{ task?: Task }>(r, fr ? "fr" : "en"));
            if (!alive || productRef.current?.id !== (productId || undefined)) return;
            task = detail.task ?? task;
          }
          applyTask(task!);
          if (pendingId && task.id === pendingId) {
            try { localStorage.removeItem(`vendeo-slideshow-request:${productId}`); } catch { /* ignore */ }
            if (requestProductIdRef.current === productId && requestIdRef.current === pendingId) requestIdRef.current = "";
            pendingPollCountRef.current = 0;
            setPendingRequest(false);
          } else if (pendingId) setPendingRequest(true);
        } else if (pendingId) {
          setPendingRequest(true); setBusy(false); setReady(true); setAttempted(true);
          setError(fr ? "Lancement non confirmé. Vérifie l’historique avant toute nouvelle génération." : "Launch is unconfirmed. Check history before generating again.");
        } else if (!taskRef.current) { setBusy(false); setAttempted(false); setPendingRequest(false); }
        initialDone.current = true;
        setReady(true);
      } catch {
        if (!alive || productRef.current?.id !== (productId || undefined)) return;
        const pendingId = requestIdFor(productId);
        if (pendingId) {
          setPendingRequest(true); setBusy(false); setReady(true); setAttempted(true);
          setError(fr ? "Lancement non confirmé. Vérifie l’historique avant de réessayer." : "Launch is unconfirmed. Check history before retrying.");
        } else if (!initialDone.current) {
          setReady(false);
          setError(
            fr
              ? "Vérification du suivi en cours. Aucun nouveau lancement avant récupération."
              : "Checking existing work before allowing a new generation.",
          );
        }
      } finally {
        pollingRef.current = false;
      }
    };
    pollRef.current = poll;
    fetch("/api/studio/slideshow/config", { signal: controller.signal })
      .then(jsonResponse)
      .then((data) => {
        if (alive) {
          setEnabled(data.enabled === true);
          setVoiceoverEnabled(data.voiceoverEnabled === true);
          setVoiceoverTestAllowed(data.voiceoverTestAllowed === true);
        }
      })
      .catch(() => {
        if (alive) setEnabled(false);
      });
    void poll();
    const timer = setInterval(() => {
      const pending = !!requestIdFor(productRef.current?.id ?? "");
      if (!initialDone.current || taskRef.current?.status === "processing" || pending) void poll();
    }, 4000);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden" && (!initialDone.current || taskRef.current?.status === "processing" || requestIdFor(productRef.current?.id ?? ""))) void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (pollRef.current === poll) pollRef.current = null;
      stopProgress();
    };
  }, []);
  useEffect(() => {
    const next = product?.id ?? "";
    if (signature.current === next) return;
    signature.current = next;
    const nextRequestId = requestIdFor(next);
    requestIdRef.current = nextRequestId;
    requestProductIdRef.current = next;
    pendingPollCountRef.current = 0;
    initialDone.current = false;
    setPendingRequest(Boolean(nextRequestId));
    setRefreshedProduct(null);
    if (taskRef.current?.status === "processing") return;
    if (selectedTaskId) return;
    newDraftRef.current = true;
    taskRef.current = null; setResumeTask(null); setResumeConfirmed(false);
    setImages([]);
    setResult(null);
    setError("");
    setStatus("");
    setAttempted(false);
    setCreditsUsed(0);
    variationIdRef.current = "";
    setRecovery(false);
    setReady(false);
    void pollRef.current?.();
  }, [product?.id]);
  useEffect(() => {
    const previous = selectedTaskRef.current;
    selectedTaskRef.current = selectedTaskId;
    if (!selectedTaskId) { if (previous && productRef.current) newSlideshow(); return; }
    let alive = true;
    loadedHistoryRef.current = selectedTaskId; newDraftRef.current = false;
    setReady(false); setError(""); setResumeConfirmed(false);
    fetch(`/api/studio/tasks/${encodeURIComponent(selectedTaskId)}/continue`, { cache: "no-store" })
      .then((response) => jsonResponse<{ task?: Task }>(response, locale)).then(data => { if (alive && data.task) { applyTask(data.task); setReady(true); } })
      .catch(cause => { if (alive) { setError(cause instanceof Error ? cause.message : "Suivi indisponible."); setReady(false); } });
    return () => { alive = false; };
  }, [selectedTaskId]);
  // Show the credit balance before launch, and refresh it whenever a generation ends.
  useEffect(() => {
    if (!busy) void refreshCredits();
  }, [busy]);
  function newSlideshow() {
    if (busy || pendingRequest || taskRef.current?.status === "processing") return;
    selectedTaskRef.current = null; loadedHistoryRef.current = null; newDraftRef.current = true;
    taskRef.current = null; setResumeTask(null); setResumeConfirmed(false);
    displayedProgressRef.current = 0; setProgress(0);
    setImages([]); setCreditsUsed(0); setResult(null); setError(""); setStatus("");
    variationIdRef.current = "";
    setRecovery(false); setAttempted(false);
  }
  async function continueSlideshow() {
    const task = taskRef.current;
    if (running.current || busy || !task?.resume?.allowed || (task.resume.requiresConfirmation && !resumeConfirmed)) return;
    if (available !== null && task.resume.cost > 0 && available < task.resume.cost) return;
    running.current = true; setBusy(true); setError("");
    try {
      const data = await send<{ task?: Task }>(`/api/studio/tasks/${encodeURIComponent(task.id)}/continue`, { expectedRevision: task.revision, confirmCost: task.resume.cost }, locale);
      if (!data.task) throw new Error("Suivi indisponible.");
      applyTask(data.task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reprise non confirmée. Aucun nouvel essai automatique.");
      // Read-only reconciliation; never repeat a potentially accepted continuation POST.
      try { const r = await fetch(`/api/studio/tasks/${encodeURIComponent(task.id)}/continue`, { cache: "no-store" }); const data = await jsonResponse<{ task?: Task }>(r, locale); if (data.task) applyTask(data.task); } catch { /* keep visible error */ }
    } finally { running.current = false; setBusy(taskRef.current?.status === "processing"); }
  }
  async function generate(options: { retrySameId?: boolean } = {}) {
    const retrySameId = options.retrySameId === true;
    const sourceProduct = activeProduct;
    if (!enabled || !ready || !sourceProduct || busy || (pendingRequest && !retrySameId) || running.current || taskRef.current?.status === "processing") return;
    if (lacksCredits && !recovery && !retrySameId) return;
    if (retrySameId && !requestIdFor(sourceProduct.id)) {
      setError(fr ? "L’identifiant de lancement n’est plus disponible. Vérifie l’historique avant de créer une nouvelle demande." : "The launch ID is no longer available. Check history before creating a new request.");
      return;
    }
    const descriptionRetry = recovery;
    let requestProduct = sourceProduct;
    running.current = true;
    if (retrySameId) { pendingPollCountRef.current = 0; setPendingRequest(false); }
    displayedProgressRef.current = 0; setProgress(0);
    setBusy(true); setAttempted(true); setError(""); setImages([]); setResult(null);
    setStatus(descriptionRetry
      ? (fr ? "Actualisation de la description depuis ta boutique…" : "Refreshing the description from your store…")
      : (fr ? "Vérification des informations…" : "Checking product details…"));
    try {
      if (descriptionRetry) {
        const refreshed = onRefreshProduct ? await onRefreshProduct(sourceProduct.id) : sourceProduct;
        if (!refreshed || refreshed.id !== sourceProduct.id) throw new Error("refresh-unavailable");
        requestProduct = refreshed;
        productRef.current = refreshed;
        setRefreshedProduct(refreshed);
      }
      if (!variationIdRef.current) variationIdRef.current = crypto.randomUUID();
      await send("/api/studio/prompt", { variationId: variationIdRef.current, product: requestProduct, mediaType: "video", videoMode: "slideshow", duration, aspectRatio: "9:16", campaignGoal, locale, musicId: "", voiceover: true }, locale);
      setRecovery(false);
      if (descriptionRetry) { taskRef.current = null; setResumeTask(null); }
      await createTask(requestProduct);
    } catch (cause) {
      if (cause instanceof Error && cause.message === "refresh-unavailable") {
        setBusy(false); setStatus(""); setReady(true);
        setError(fr ? "Impossible de recharger le produit depuis ta boutique. Réessaie dans un instant." : "Could not reload the product from your store. Please try again shortly.");
        return;
      }
      const failure = cause as SlideshowRequestError;
      const insufficient = failure.code === "INSUFFICIENT_PRODUCT_DETAILS" || /détails.*produit|product details|informations produit.*insuffisantes|not enough.*product/i.test(failure.message);
      if (insufficient) {
        setRecovery(true); setPendingRequest(false); setStatus(""); setBusy(false); setAttempted(false);
        setError(failure.message); setReady(true); return;
      }
      if (failure.message === "Lancement non confirmé") return;
      setBusy(false); setStatus("");
      if (failure.responseReadable && failure.status !== undefined && failure.status >= 400 && failure.status < 500) {
        setReady(true); setAttempted(false); setError(failure.message); return;
      }
      setError(fr ? "La vérification n’a pas abouti. Aucun nouveau lancement n’a été confirmé ; réessaie." : "The check did not complete. No new launch was confirmed; please try again.");
    } finally { running.current = false; setBusy(taskRef.current?.status === "processing"); }
  }
  async function createTask(sourceProduct: Product) {
    if (!ready || taskRef.current?.status === "processing") return;
    const key = `vendeo-slideshow-request:${sourceProduct.id}`;
    let id = requestIdFor(sourceProduct.id);
    if (!id) {
      id = crypto.randomUUID();
      requestIdRef.current = id;
      requestProductIdRef.current = sourceProduct.id;
      try { localStorage.setItem(key, id); } catch { /* backend idempotency still protects this request */ }
    }
    pendingPollCountRef.current = 0;
    setStatus(fr ? "Lancement de la génération…" : "Starting generation…");
    try {
      const response = await send<{ task?: Task }>("/api/studio/tasks", { id, kind: "slideshow", input: { product: sourceProduct, duration, campaignGoal, locale, musicId: "", voiceover: true, variationId: variationIdRef.current, ...(creativePerformanceSource ? { creativePerformanceSource } : {}), ...(creativeIdea ? { creativeIdea } : {}) } }, locale);
      const task = response.task as Task;
      if (!task) throw new Error("Réponse de tâche invalide.");
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      if (requestProductIdRef.current === sourceProduct.id && requestIdRef.current === id) requestIdRef.current = "";
      setPendingRequest(false);
      applyTask(task, task.status === "completed");
    } catch (cause) {
      const failure = cause as SlideshowRequestError;
      const alreadyAcceptedConflict = failure.status === 409 && failure.code === "TASK_ALREADY_ACCEPTED";
      const definitiveRefusal = !alreadyAcceptedConflict && failure.responseReadable === true && failure.status !== undefined && failure.status >= 400 && failure.status < 500;
      if (failure.code === "INSUFFICIENT_CREDITS" || definitiveRefusal) {
        // A readable JSON 4xx is a definitive refusal: it cannot have queued a task.
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        if (requestProductIdRef.current === sourceProduct.id && requestIdRef.current === id) requestIdRef.current = "";
        pendingPollCountRef.current = 0;
        setPendingRequest(false); setStatus(""); setBusy(false); setReady(true); setAttempted(false);
        if (failure.code === "INSUFFICIENT_CREDITS") {
          setError(failure.message);
          void refreshCredits();
          throw new Error("Lancement non confirmé");
        }
        throw cause;
      }
      // Never issue another paid POST when acceptance is uncertain. Poll only the task list.
      setStatus(""); setBusy(false); setReady(true); setPendingRequest(true); setAttempted(true);
      setError(fr ? "Lancement non confirmé. Vérifie l’historique avant de réessayer ; aucune relance automatique." : "Launch not confirmed. Check history before retrying; no automatic retry.");
      throw new Error("Lancement non confirmé");
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
    <div className="studio-grid studio-slideshow-grid" style={{ marginTop: 20 }}>
    <section
      className="app-card studio-form"
      style={{ display: "grid", gap: 16, alignContent: "start" }}
      aria-label={fr ? "Diaporama animé" : "Animated slideshow"}
    >
      <h2 style={{ margin: 0 }}>{fr ? "Diaporama" : "Slideshow"}</h2>
      {!activeProduct ? (
        <small>
          {fr ? "Choisis un produit ci-dessus pour une nouvelle création." : "Choose a product above for a new creation."}
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
      </div>
      <p>{fr ? "Voix et musique ajoutées automatiquement à la génération." : "Voiceover and music are added automatically during generation."}</p>
      {!voiceoverEnabled || !voiceoverTestAllowed ? <small>{fr ? "La génération de voix est en cours de validation." : "Voice generation is being validated."}</small> : null}
      {resumeTask && !recovery && !busy ? <section aria-label={fr ? "Reprise du diaporama" : "Resume slideshow"}>
        <h3>{fr ? "Diaporama interrompu" : "Interrupted slideshow"}</h3>
        {resumeTask.input?.product?.name ? <p>{resumeTask.input.product.name}</p> : null}
        <p>{fr ? `Progression sauvegardée : ${Math.min(resumeTask.progress ?? 0, 99)} % · ${images.length < 5 ? `prochain visuel ${images.length + 1}/5` : "montage MP4 restant"}.` : `Saved progress: ${Math.min(resumeTask.progress ?? 0, 99)}% · ${images.length < 5 ? `next image ${images.length + 1}/5` : "MP4 assembly remaining"}.`}</p>
        <p>{fr ? `${images.length}/5 visuels conservés · ${creditsUsed} crédits déjà utilisés. Les visuels terminés ne seront pas recréés.` : `${images.length}/5 images preserved · ${creditsUsed} credits already used. Completed images will not be recreated.`}</p>
        {resumeTask.resume?.allowed ? <>
          <p>{fr ? `Coût restant de la reprise : ${resumeTask.resume.cost} crédits Studio.` : `Remaining resume cost: ${resumeTask.resume.cost} Studio credits.`}</p>
          {lacksResumeCredits ? <p role="alert" className="form-error">{fr ? `Solde insuffisant : la reprise coûte ${resumeCost} crédits Studio, il te reste ${available}. Recharge tes crédits pour continuer.` : `Insufficient balance: resuming costs ${resumeCost} Studio credits, you have ${available}. Top up to continue.`}</p> : null}
          {resumeTask.resume.requiresConfirmation ? <label><input type="checkbox" checked={resumeConfirmed} onChange={e => setResumeConfirmed(e.target.checked)} />{fr ? `J’autorise la reprise pour ${resumeTask.resume.cost} crédits maximum.` : `I authorize resuming for up to ${resumeTask.resume.cost} credits.`}</label> : null}
        </> : <p>{fr ? `L’état de l’étape manquante n’est pas confirmé. La reprise reste bloquée pour éviter une nouvelle facturation. Coût restant estimé : ${resumeTask.resume?.cost ?? "—"} crédits, non autorisé tant que cette étape n’est pas vérifiée. Les visuels terminés sont conservés.` : `The missing stage is unconfirmed. Resuming is blocked to prevent another charge. Estimated remaining cost: ${resumeTask.resume?.cost ?? "—"} credits, not authorized until the stage is verified. Completed images are preserved.`}</p>}
        <button type="button" className="btn btn-dark studio-continue" disabled={!resumeTask.resume?.allowed || lacksResumeCredits || (!!resumeTask.resume?.requiresConfirmation && !resumeConfirmed)} onClick={() => void continueSlideshow()}>{fr ? "Continuer" : "Continue"}</button>
        <button type="button" className="btn btn-ghost" onClick={newSlideshow}>{fr ? "Nouveau diaporama" : "New slideshow"}</button>
      </section> : null}
      {(!resumeTask || recovery) && (!pendingRequest && (!attempted || taskRef.current?.status === "completed" || taskRef.current?.status === "failed" || recovery)) && !busy && ready ? (
        <>
          {recovery && error ? <p role="alert" className="form-error">{error}</p> : null}
          <p className="studio-cost">{fr ? `Coût : ${slideshowCost} crédits Studio` : `Cost: ${slideshowCost} Studio credits`}{available !== null ? (fr ? ` · Solde disponible : ${available}` : ` · Available balance: ${available}`) : null}</p>
          {lacksCredits ? <p role="alert" className="form-error">{fr ? `Solde insuffisant : ce diaporama coûte ${slideshowCost} crédits Studio, il te reste ${available}. Recharge tes crédits avant de créer.` : `Insufficient balance: this slideshow costs ${slideshowCost} Studio credits, you have ${available}. Top up before creating.`}</p> : null}
          <button type="button" className="btn btn-dark studio-generate" disabled={!activeProduct || busy || !ready || (lacksCredits && !recovery)} onClick={() => void generate()}>{recovery ? (fr ? `Réessayer et créer (${slideshowCost} crédits)` : `Retry and create (${slideshowCost} credits)`) : (fr ? "Créer" : "Create")}</button>
        </>
      ) : null}
    </section>
    <section className="app-card studio-result studio-slideshow-preview" aria-label={fr ? "Aperçu du diaporama" : "Slideshow preview"} aria-busy={busy}>
      <div className="card-head">
        <div><span className="eyebrow">{fr ? "Résultat" : "Result"}</span><h2>{fr ? "Ton diaporama" : "Your slideshow"}</h2></div>
        <Film size={20} aria-hidden="true" />
      </div>
      <div className={`studio-slideshow-canvas${!result && !busy ? " studio-empty" : ""}`}>
        {!busy && !result ? <>
          <Sparkles size={32} aria-hidden="true" />
          <strong>{pendingRequest ? (fr ? "Lancement à vérifier" : "Check launch status") : recovery ? (fr ? "Description à compléter" : "Update product details") : error || resumeTask ? (fr ? "Création interrompue" : "Creation interrupted") : (fr ? "Prêt à créer" : "Ready to create")}</strong>
          {!pendingRequest && !recovery && !error && !resumeTask ? <p>{fr ? "Choisis ton produit, ajuste les réglages puis lance la création. Ton diaporama apparaîtra ici." : "Choose your product, adjust the settings and start creating. Your slideshow will appear here."}</p> : null}
          {recovery ? <p>{fr ? "Mets à jour la description dans ta boutique, puis appuie sur « Réessayer »." : "Update the description in your store, then click “Retry”."}</p> : null}
        </> : null}
      {pendingRequest ? <p role="status">{fr ? "Vérifie l’historique ; aucune nouvelle génération ne sera lancée automatiquement." : "Check history; no new generation will be started automatically."}</p> : null}
      {pendingRequest && requestIdRef.current && requestProductIdRef.current === activeProduct?.id ? <>
        <p>{fr ? "Un nouvel identifiant pourrait créer un doublon. Cette action réutilise le même identifiant ; le serveur est idempotent sur cet identifiant." : "A new ID could create a duplicate. This action reuses the same ID; the server is idempotent for that ID."}</p>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void generate({ retrySameId: true })}>
          {fr ? "J’ai vérifié l’historique, réessayer" : "I checked history, retry"}
        </button>
      </> : null}
      {status ? (
        busy ? <LaunchProgress progress={progress} label={status}
          subtitle={fr ? "Les visuels terminés sont sauvegardés. Progression estimée entre les étapes." : "Completed images are saved. Progress is estimated between stages."} />
          : <p role="status" aria-live="polite">{status}</p>
      ) : null}
      {error && !recovery ? <p role="alert" className="form-error">{error}</p> : null}
      {result ? (
        <div className="studio-slideshow-final" style={{ display: "grid", gap: 12 }}>
          <h3>{fr ? "Ton diaporama est prêt" : "Your slideshow is ready"}</h3>
          <video
            key={result.videoUrl}
            aria-label={fr ? "Diaporama final" : "Final slideshow"}
            playsInline
            controls
            preload="metadata"
            src={result.videoUrl}
            style={{
              width: "100%",
              maxWidth: "var(--slideshow-player-width, 420px)",
              maxHeight: "var(--slideshow-player-height, 600px)",
              background: "#111",
              borderRadius: 12,
            }}
          />
          <VideoDownloadButton
            className="btn btn-dark"
            url={result.videoUrl}
            filename="vendeo-diaporama.mp4"
            locale={locale}
          >
            {fr ? "Télécharger" : "Download"}
          </VideoDownloadButton>
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
      </div>
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
      {attempted ? (
        <small>
          {fr
            ? `${images.length}/5 visuels · ${creditsUsed} crédits Studio utilisés.`
            : `${images.length}/5 images · ${creditsUsed} Studio credits used.`}
        </small>
      ) : null}
    </section>
    </div>
  );
}
