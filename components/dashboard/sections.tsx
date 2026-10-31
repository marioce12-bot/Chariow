"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, BarChart3, Bell, Bot, CreditCard, Plus, Search, Settings, Store, MessageSquare, LayoutDashboard, Package, CalendarDays, Users, Eye, ShoppingBag, Lightbulb, Activity, AlertTriangle, Target, TrendingUp, ShieldAlert, CheckCircle2, Brain, LineChart, Sparkles, LogOut, Megaphone, FileText, Trash2, Sun, Moon, ImageIcon, Layers, Video, Languages, ExternalLink } from "lucide-react";
import { FaFacebookF, FaInstagram, FaMeta, FaTiktok, FaWhatsapp, FaLinkedinIn, FaPinterestP } from "react-icons/fa6";
import { TikTokAdsPanel } from "@/components/TikTokAdsPanel";
import { FeedbackView } from "@/components/FeedbackView";
import { PinterestAdsPanel } from "@/components/PinterestAdsPanel";
import { MetaHistoryOverview } from "@/components/dashboard/MetaHistoryOverview";
import { MetaAccountSkeleton } from "@/components/dashboard/MetaAccountSkeleton";
import { OverviewDetails } from "@/components/dashboard/OverviewDetails";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";
import { StudioDesktopProductFields } from "@/components/studio/StudioDesktopProductFields";
import { VideoDownloadButton } from "@/components/studio/VideoDownloadButton";
import { StorePlatformDialog } from "@/components/dashboard/StorePlatformDialog";
import { STUDIO_VIDEO_LOCKED } from "@/lib/studio/video-plan";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatMoney, formatMoneyInUSD } from "@/lib/format";
import { toUsd } from "@/lib/currency";
import { isAdPlatformAllowed, planMaxStores, type AdPlatform, type PlanId } from "@/lib/plans";
import { CampaignCrossTable, DiagnosticBoutique, type CampaignRow, type CampaignVerdictBadge, type DiagnosticCard } from "@/components/vendeo";
import { DiagnosticFunnel } from "@/components/vendeo/DiagnosticFunnel";
import { AdCampaignsList } from "@/components/vendeo/AdCampaignsList";
import { AutopilotView } from "@/components/vendeo/AutopilotView";
import { LaunchAdWizard } from "@/components/vendeo/wizard";
import { CREDIT_PRICE_XOF, videoCreditCost } from "@/lib/studio/credits";
import { startEstimatedGenerationProgress } from "@/lib/studio/generation-progress";
import { VIDEO_RESOLUTIONS, VIDEO_ASPECT_RATIOS } from "@/lib/studio/creative-workflows";
import { useI18n } from "@/lib/i18n/i18n";
import { MetricHelp, ChannelBadge, SESSION_STORAGE_PROMPT_KEY } from "./shared";
import { useNavigationCache } from "./NavigationDataCache";
import type { StoreData, SubscriptionData, ProductData, AnalyticsData } from "./shared";

function sumInUSD(entries: Array<{ amount: number; currency: string }>): number | null {
  if (!entries.length) return null;
  const converted = entries.map(({ amount, currency }) => toUsd(amount, currency));
  const values = converted.filter((amount): amount is number => amount !== null);
  if (values.length !== entries.length) return null;
  return Math.round(values.reduce((sum, amount) => sum + amount, 0) * 100) / 100;
}

function numericAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function formatUsdTotal(entries: Array<{ amount: number; currency: string }>): string | null {
  const total = sumInUSD(entries);
  if (total === null) return null;
  const approximate = entries.some((entry) => entry.currency.trim().toUpperCase() !== "USD") ? "≈ " : "";
  return `${approximate}${formatMoney(total, "USD")}`;
}

export function StoreOnboarding() {
  const { t , locale } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [platform, setPlatform] = useState<"chariow" | "shopify">("chariow");
  const [shop, setShop] = useState("");

  async function connect() {
    setError("");
    setSaving(true);
    try {
      if (platform === "chariow") {
        window.location.href = "/api/integrations/chariow/connect";
        return;
      }
      const domain = shop.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) throw new Error("invalid-shop-domain");
      const response = await fetch("/api/integrations/shopify/connect/check");
      if (!response.ok) throw new Error("shopify-configuration");
      const config = await response.json();
      if (config?.configured === false || config?.available === false) throw new Error("shopify-not-configured");
      window.location.href = `/api/integrations/shopify/connect?shop=${encodeURIComponent(domain)}`;
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "shopify-not-configured" ? "shopify-not-configured" : cause instanceof Error && cause.message === "invalid-shop-domain" ? "invalid-shop-domain" : t("sectionsExtra.onboarding.error"));
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-wrap">
      <div className="onboarding-card">
        <span className="onboarding-icon">
          <Store size={26} />
        </span>
        <span className="eyebrow">{t("sectionsExtra.onboarding.step")}</span>
        <h1>{t("sectionsExtra.onboarding.title")}</h1>
        <p className="onboarding-lead">{platform === "shopify" ? (locale === "en" ? "Connect your Shopify store securely to sync its products." : "Connecte ta boutique Shopify en toute sécurité pour synchroniser ses produits.") : t("sectionsExtra.onboarding.description")}</p>
        {error && <p className="form-error">{error === "shopify-not-configured" ? (locale === "en" ? "Shopify connection is not configured yet. Please try again later." : "La connexion Shopify n’est pas encore configurée. Réessaie plus tard.") : error === "invalid-shop-domain" ? (locale === "en" ? "Enter a valid *.myshopify.com domain." : "Saisis un domaine *.myshopify.com valide.") : localizeSystemMessage(error, locale)}</p>}
        <label style={{ display: "block", marginTop: 16 }}>{locale === "en" ? "Platform" : "Plateforme"}<select aria-label={locale === "en" ? "Platform" : "Plateforme"} value={platform} onChange={event => setPlatform(event.target.value as "chariow" | "shopify")}><option value="chariow">Chariow</option><option value="shopify">Shopify</option></select></label>
        {platform === "shopify" && <label style={{ display: "block", marginTop: 16 }}>{locale === "en" ? "Shop domain" : "Domaine de la boutique"}<input aria-label={locale === "en" ? "Shop domain" : "Domaine de la boutique"} value={shop} onChange={event => setShop(event.target.value)} placeholder="example.myshopify.com" style={{ display: "block", width: "100%", marginTop: 6 }} /></label>}
        <button className="btn btn-dark" disabled={saving} style={{ width: "100%", marginTop: 18 }} onClick={connect}>
          {saving ? t("sectionsExtra.onboarding.loading") : platform === "shopify" ? (locale === "en" ? "Connect Shopify" : "Connecter Shopify") : t("sectionsExtra.onboarding.connect")} <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

type StudioVideoJob = { id: string; status: string; contentUrl?: string | null; error?: string; progress?: number; phase?: string };
type StudioHistoryItem = { id: string; kind: "image" | "video"; prompt: string; options: Record<string, string | number>; metadata?: Record<string, unknown> | null; creationType?: "slideshow" | "image" | "video"; thumbnailUrl?: string | null; mediaState?: "ready" | "missing" | "processing" | "failed"; sourceImageCount?: number; status: string; credits_cost: number; storage_path?: string | null; video_job_id?: string | null; mediaUrl?: string | null; created_at: string };

function htmlDescriptionToText(description: string): string {
  const document = new DOMParser().parseFromString(description, "text/html");
  const blockTags = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "DL", "DT", "DD", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL"]);

  function render(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    if (element.tagName === "BR") return "\n";
    const content = Array.from(element.childNodes).map(render).join("");
    const withBullet = element.tagName === "LI" && content.trim() ? `• ${content.trim()}` : content;
    return blockTags.has(element.tagName) ? `${withBullet.trimEnd()}\n` : withBullet;
  }

  return render(document.body).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function StudioFormatPreviewVideo({ src, poster }: { src: string; poster: string }) {
  return (
    <video
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      controls={false}
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

export function StudioView({ products }: { products: Array<{ id: string; name: string; description?: string | null; price?: number | string | null; currency?: string | null; image?: string | null }> }) {
  const { t, locale } = useI18n();
  const [promptGenerating, setPromptGenerating] = useState(false);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [studioTab, setStudioTab] = useState<"photo" | "slideshow">("photo");
  const [mobileStudioMode, setMobileStudioMode] = useState<"image" | "slideshow" | "video" | null>(null);
  const [prompt, setPrompt] = useState("");
  const videoMode = "slideshow";
  const [videoStyle, setVideoStyle] = useState<"motion_design" | "ugc">("motion_design");
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [quality, setQuality] = useState("medium");
  const [imageResolution, setImageResolution] = useState("hd");
  const [orientation, setOrientation] = useState("square");
  const [background, setBackground] = useState("auto");
  const duration = 25;
  const [videoResolution, setVideoResolution] = useState<typeof VIDEO_RESOLUTIONS[number]>(VIDEO_RESOLUTIONS[0]);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [videoJob, setVideoJob] = useState<StudioVideoJob | null>(null);
  const videoRequestIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const stopProgressRef = useRef<(() => void) | null>(null);
  const [imageTask, setImageTask] = useState<{ id: string; status: string } | null>(null);
  const [imageTrackingIssue, setImageTrackingIssue] = useState(false);
  const [imageRecoveryReady, setImageRecoveryReady] = useState(false);
  const imageRecoveryReadyRef = useRef(false);
  const imageTaskIdRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState(0);
  const [reservedCredits, setReservedCredits] = useState(0);
  const [creditsLoaded, setCreditsLoaded] = useState(false);
  const videoCostEstimate = videoCreditCost(videoResolution, duration);
  const availableCredits = Math.max(0, balance - reservedCredits);
  const [creditAmount, setCreditAmount] = useState("200");
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [recharging, setRecharging] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[number] | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [history, setHistory] = useState<StudioHistoryItem[]>([]);
  const [historyKind, setHistoryKind] = useState("all");
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedSlideshowTaskId, setSelectedSlideshowTaskId] = useState<string | null>(null);
  const slideshowPanelRef = useRef<HTMLDivElement | null>(null);
  const historyViewerRef = useRef<HTMLElement | null>(null);
  const studioTabTouchedRef = useRef(false);
  useEffect(() => {
    if (!selectedHistoryId) return;
    historyViewerRef.current?.focus({ preventScroll: true });
    historyViewerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [selectedHistoryId]);
  useEffect(() => {
    if (!selectedSlideshowTaskId) return;
    slideshowPanelRef.current?.focus({ preventScroll: true });
    slideshowPanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [selectedSlideshowTaskId]);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  // Verrou synchrone contre le double-tap mobile : `loading` (state React) ne
  // se reflète dans le DOM qu'au prochain rendu, donc deux `touchend`/`click`
  // rapprochés peuvent tous les deux lire `loading === false` et déclencher
  // deux générations (et donc deux débits de crédits) pour un seul tap.
  const generatingRef = useRef(false);
  // Dernier prompt produit généré par l'IA (pour distinguer les consignes de l'utilisateur).
  const lastGeneratedPromptRef = useRef<string | null>(null);
  // Jobs vidéo déjà vérifiés une fois depuis l'historique au chargement de la
  // page, pour ne relancer la vérification serveur qu'une seule fois par job
  // (évite une boucle de re-render infinie sur l'effet ci-dessous).
  const reconciledJobsRef = useRef<Set<string>>(new Set());
  useEffect(() => () => { stopProgressRef.current?.(); stopProgressRef.current = null; }, []);

  // Restore the server-owned photo task after mount/refresh. This is deliberately
  // a GET only: an unknown response must never silently start a second billable job.
  useEffect(() => {
    let active = true;
    let checking = false;
    const recover = async () => {
      if (checking || imageRecoveryReadyRef.current) return;
      checking = true;
      try {
        const response = await fetch("/api/studio/tasks");
        if (!response.ok) throw new Error("Impossible de vérifier la génération photo en cours.");
        const data = await response.json();
        const task = Array.isArray(data.tasks) ? data.tasks.find((item: any) => item.kind === "image") : null;
        if (!active) return;
        setError("");
        const latest = data.tasks?.find((item: any) => item.status === "processing") ?? data.tasks?.[0];
        if (!studioTabTouchedRef.current && latest) setStudioTab(latest.kind === "slideshow" ? "slideshow" : "photo");
        if (task?.status === "processing") {
          imageTaskIdRef.current = task.id;
          setImageTask({ id: task.id, status: "processing" });
          setLoading(true);
          setGenerationProgress(3);
          stopProgressRef.current = startEstimatedGenerationProgress(setGenerationProgress);
        } else if (task?.status === "completed" && task.result?.imageUrl) {
          setImageUrl(task.result.imageUrl);
          setSelectedGenerationId(task.result.generationId ?? null);
          setGenerationProgress(95);
          setLoading(false);
        } else if (task?.status === "completed" && task.mediaPending) {
          setImageTask({ id: task.id, status: "awaiting_media" });
          setLoading(true);
        } else if (task?.status === "completed") {
          setError(locale === "en" ? "This image is no longer available. No new generation was started." : "Cette image n’est plus disponible. Aucune nouvelle génération n’a été lancée.");
          setLoading(false);
        } else if (task?.trackingUnavailable) {
          throw new Error("Suivi temporairement indisponible.");
        } else if (task?.status === "failed") {
          setError(task.error || task.message || "La génération photo a échoué.");
          setLoading(false);
        }
        imageRecoveryReadyRef.current = true;
        setImageRecoveryReady(true);
      } catch {
        if (!active) return;
        setError("Impossible de vérifier si une génération photo est en cours. Réessayez la vérification avant de créer une nouvelle image.");
        imageRecoveryReadyRef.current = false;
        setImageRecoveryReady(false);
      } finally { checking = false; }
    };
    void recover();
    const timer = window.setInterval(() => void recover(), 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!imageTask || !["processing", "awaiting_media"].includes(imageTask.status)) return;
    let active = true;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    // Poll only this photo. Schedule AFTER each response so slow requests never overlap.
    const poll = async () => {
      try {
        const response = await fetch(`/api/studio/tasks?id=${encodeURIComponent(imageTask.id)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Suivi indisponible");
        const data = await response.json();
        const task = Array.isArray(data.tasks) ? data.tasks.find((item: any) => item.id === imageTask.id) : null;
        if (!active) return;
        if (!task || task.trackingUnavailable) throw new Error("Suivi indisponible");
        failures = task.mediaPending ? failures + 1 : 0;
        setImageTrackingIssue(false);
        if (task.status === "completed") {
          stopProgressRef.current?.(); stopProgressRef.current = null;
          if (task.mediaPending) {
            // The provider has finished: do not keep claiming it is generating.
            setImageTask((current) => current?.status === "awaiting_media" ? current : { id: task.id, status: "awaiting_media" });
          } else {
            setImageUrl(task.result?.imageUrl ?? null);
            setSelectedGenerationId(task.result?.generationId ?? null);
            setGenerationProgress(task.result?.imageUrl ? 95 : 0);
            if (!task.result?.imageUrl) setError(locale === "en" ? "This image is no longer available. No new generation was started." : "Cette image n’est plus disponible. Aucune nouvelle génération n’a été lancée.");
            setImageTask({ id: task.id, status: "completed" });
            setLoading(false); generatingRef.current = false;
            void loadHistory(true);
            void fetch("/api/studio/credits").then((r) => r.ok ? r.json() : null).then((credits) => { if (credits) { setBalance(credits.balance ?? 0); setReservedCredits(credits.reserved ?? 0); } }).catch(() => undefined);
            return;
          }
        } else if (task.status === "failed") {
          stopProgressRef.current?.(); stopProgressRef.current = null;
          setError(task.error || task.message || "La génération photo a échoué.");
          setImageTask({ id: task.id, status: "failed" });
          setLoading(false); generatingRef.current = false; setGenerationProgress(0);
          return;
        }
      } catch {
        if (!active) return;
        failures++;
        setImageTrackingIssue(true);
        stopProgressRef.current?.(); stopProgressRef.current = null;
      }
      if (active) timer = setTimeout(() => void poll(), Math.min(30_000, 4_000 * 2 ** Math.min(failures, 3)));
    };
    timer = setTimeout(() => void poll(), 4_000);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [imageTask?.id, imageTask?.status]);

  useEffect(() => {
    fetch("/api/studio/credits").then((response) => response.ok ? response.json() : null).then((data) => { if (data) { setBalance(data.balance ?? 0); setReservedCredits(data.reserved ?? 0); } setCreditsLoaded(true); }).catch(() => setCreditsLoaded(true));
  }, []);

  async function loadHistory(reset = false) {
    setHistoryLoading(true);
    const params = new URLSearchParams();
    if (historyKind !== "all") params.set("kind", historyKind);
    if (!reset && historyCursor) params.set("cursor", historyCursor);
    const result = await fetch(`/api/studio/history?${params}`).then((response) => response.ok ? response.json() : null).catch(() => null);
    if (result) { setHistory((previous) => reset ? result.items : [...previous, ...result.items]); setHistoryCursor(result.nextCursor ?? null); }
    setHistoryLoading(false);
  }
  useEffect(() => { void loadHistory(true); }, [historyKind]);

  // Sans ceci, une vidéo qui continue à traiter côté serveur pendant qu'on
  // ferme ou quitte l'appli restait bloquée sur "processing" pour toujours au
  // retour : rien ne relançait jamais sa vérification tant que l'utilisateur
  // ne rouvrait pas explicitement cette création précise. Au chargement (ou
  // rafraîchissement) de l'historique, on revérifie donc une fois chaque job
  // vidéo encore "processing" — la route appelée applique déjà la bascule en
  // "completed"/"failed" (y compris l'abandon après un délai anormalement
  // long), il suffit de la déclencher.
  useEffect(() => {
    const pending = history.filter(
      (item) => item.kind === "video" && item.status === "processing" && item.video_job_id && !reconciledJobsRef.current.has(item.video_job_id),
    );
    if (!pending.length) return;
    pending.forEach((item) => reconciledJobsRef.current.add(item.video_job_id as string));
    void (async () => {
      let changed = false;
      for (const item of pending) {
        try {
          const response = await fetch(`/api/studio/video/${encodeURIComponent(item.video_job_id as string)}`);
          const data = await response.json().catch(() => null);
          if (response.ok && data?.status) {
            if (data.status === "processing") {
              // Toujours en cours : on reprend le polling pour terminer la
              // génération au lieu de la laisser figée sur "processing".
              setVideoJob((current) => current ?? { id: item.video_job_id as string, status: "processing" });
            } else {
              changed = true;
            }
          }
        } catch {
          // Vérification en tâche de fond : un échec réseau ici n'empêche pas
          // de continuer à utiliser le Studio, on retentera à la prochaine
          // ouverture de la page.
        }
      }
      if (changed) {
        await loadHistory(true);
        const credits = await fetch("/api/studio/credits").then((response) => response.ok ? response.json() : null).catch(() => null);
        if (credits) { setBalance(credits.balance ?? 0); setReservedCredits(credits.reserved ?? 0); }
      }
    })();
  }, [history]);

  useEffect(() => {
    if (!videoJob || ["completed", "failed", "cancelled"].includes(videoJob.status)) return;
    let active = true;
    let timer: number | null = null;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(`/api/studio/video/${encodeURIComponent(videoJob.id)}`, { signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok && typeof result?.status === "string") {
          setVideoJob(result);
          if (typeof result.error === "string") setError(result.error);
          if (["completed", "failed", "cancelled"].includes(result.status)) {
            const credits = await fetch("/api/studio/credits").then((creditResponse) => creditResponse.ok ? creditResponse.json() : null).catch(() => null);
            if (credits) { setBalance(credits.balance ?? 0); setReservedCredits(credits.reserved ?? 0); }
            void loadHistory(true);
          }
        }
        else if (result.error) setError(result.error);
      } catch {
        // Retry after the current request settles; cleanup aborts any in-flight read.
      } finally {
        if (active && !controller.signal.aborted) timer = window.setTimeout(() => void poll(), 4_000);
      }
    };
    timer = window.setTimeout(() => void poll(), 4_000);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      controller.abort();
    };
  }, [videoJob?.id, videoJob?.status]);

  async function uploadReferenceFiles() {
    if (!referenceFiles.length) return [];
    setReferenceUploading(true);
    try {
      return await Promise.all(referenceFiles.slice(0, 3).map(async (file) => {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/uploads/campaign-media", { method: "POST", body: form });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || typeof result.secure_url !== "string") throw new Error(result.error || "Le téléversement de la référence a échoué.");
        return result.secure_url as string;
      }));
    } finally {
      setReferenceUploading(false);
    }
  }

  // Génère, avec la même IA que l'assistant, un prompt structuré à partir des
  // infos du produit choisi. Le prompt remplace la description : changer de
  // produit puis re-cliquer régénère donc tout, sans rien effacer à la main.
  // Si l'utilisateur a écrit ses propres consignes (texte différent du dernier
  // prompt généré), elles sont transmises à l'IA pour être intégrées.
  async function insertProductInfo() {
    if (!selectedProduct || promptGenerating) return;
    setPromptGenerating(true);
    setError("");
    try {
      const current = prompt.trim();
      const userBrief = current && current !== lastGeneratedPromptRef.current ? current : "";
      const response = await fetch("/api/studio/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: {
            name: selectedProduct.name,
            price: selectedProduct.price ?? undefined,
            currency: selectedProduct.currency ?? undefined,
            description: selectedProduct.description ? htmlDescriptionToText(selectedProduct.description) : undefined,
            image: selectedProduct.image ?? undefined,
          },
          orientation,
          background,
          locale,
          mediaType: kind,
          ...(kind === "video" ? { videoStyle } : { videoMode }),
          duration,
          aspectRatio,
          userBrief,
          previousPrompt: lastGeneratedPromptRef.current ?? undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.prompt !== "string") throw new Error(result.error || "Impossible de générer le prompt.");
      lastGeneratedPromptRef.current = result.prompt;
      setPrompt(result.prompt);
    } catch (promptError) {
      setError(promptError instanceof Error ? promptError.message : t("sweep3.text200"));
    } finally {
      setPromptGenerating(false);
    }
  }

  async function generate() {
    if (generatingRef.current) return;
    if (kind === "image" && (!imageRecoveryReadyRef.current || ["processing", "awaiting_media"].includes(imageTask?.status ?? ""))) return;
    if (kind === "video" && STUDIO_VIDEO_LOCKED) {
      setError(locale === "en" ? "Video generation is not available yet." : "La génération vidéo reste indisponible.");
      return;
    }
    if (kind === "video" && (!creditsLoaded || availableCredits < videoCostEstimate)) {
      setError(locale === "en" ? `Insufficient available credits: ${videoCostEstimate} required, ${availableCredits} available. No purchase was started.` : `Solde disponible insuffisant : ${videoCostEstimate} crédits requis, ${availableCredits} disponibles. Aucun achat n’a été lancé.`);
      return;
    }
    if (!prompt.trim()) {
      setError(kind === "image" ? t("sweep1.text201") : t("sweep2.text202"));
      return;
    }
    let photoStillProcessing = false;
    generatingRef.current = true;
    stopProgressRef.current?.();
    stopProgressRef.current = null;
    setLoading(true);
    setImageTrackingIssue(false);
    setError("");
    setImageUrl(null);
    setImageLoaded(false);
    setGenerationProgress(kind === "image" ? 3 : 0);
    if (kind === "image") stopProgressRef.current = startEstimatedGenerationProgress(setGenerationProgress);
    if (kind === "video") setVideoJob(null);
    try {
      const uploadedReferenceUrls = kind === "image" ? await uploadReferenceFiles() : [];
      const referenceUrls = kind === "image"
        ? Array.from(new Set([...(uploadedReferenceUrls.length < 3 && selectedProduct?.image ? [selectedProduct.image] : []), ...uploadedReferenceUrls])).slice(0, 3)
        : [];
      const videoRequestId = kind === "video" ? (videoRequestIdRef.current || crypto.randomUUID()) : undefined;
      if (videoRequestId) videoRequestIdRef.current = videoRequestId;
      const response = await fetch(kind === "image" ? "/api/studio/tasks" : "/api/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "image"
          ? { id: crypto.randomUUID(), kind: "image", input: { prompt, quality, resolution: imageResolution, orientation, background, outputFormat: background === "transparent" ? "png" : "jpeg", referenceUrls, ...(selectedProduct ? { product: { id: selectedProduct.id, name: selectedProduct.name } } : {}) } }
          : { id: videoRequestId, prompt, duration, resolution: videoResolution, aspectRatio, videoStyle, product: selectedProduct ? { id: selectedProduct.id, name: selectedProduct.name, description: selectedProduct.description, price: selectedProduct.price ?? undefined, currency: selectedProduct.currency ?? undefined, imageUrl: selectedProduct.image ?? null } : undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && kind === "video" && [400, 402, 423].includes(response.status)) videoRequestIdRef.current = null;
      if (!response.ok) throw new Error(result.error || "La génération a échoué.");
      if (kind === "image") {
        const task = result.task;
        if (!task?.id) throw new Error("La tâche photo n'a pas pu être enregistrée.");
        imageTaskIdRef.current = task.id;
        setImageTask({ id: task.id, status: task.status === "completed" && task.mediaPending ? "awaiting_media" : task.status });
        photoStillProcessing = task.status === "processing" || (task.status === "completed" && task.mediaPending === true);
        if (task.mediaPending) { stopProgressRef.current?.(); stopProgressRef.current = null; }
        if (task.status === "completed" && task.result?.imageUrl) {
          stopProgressRef.current?.(); stopProgressRef.current = null;
          setImageUrl(task.result.imageUrl);
          setGenerationProgress(95);
          setLoading(false); generatingRef.current = false;
        } else if (task.status === "completed" && !task.mediaPending) {
          setError(locale === "en" ? "This image is no longer available. No new generation was started." : "Cette image n’est plus disponible. Aucune nouvelle génération n’a été lancée.");
          setGenerationProgress(0);
        }
        // For processing, the estimate remains running and polling owns completion.
      }
      if (kind === "image" && result.task?.status === "completed") setSelectedGenerationId(result.task.result?.generationId ?? null);
      if (kind === "image") setReferenceFiles([]);
      else {
        if (typeof result.jobId !== "string" || !result.jobId) throw new Error("La tâche vidéo n'a pas pu être enregistrée.");
        videoRequestIdRef.current = null;
        setVideoJob({ id: result.jobId, status: result.status || "queued" });
      }
      if (kind === "video") {
        const credits = await fetch("/api/studio/credits").then((response) => response.ok ? response.json() : null).catch(() => null);
        if (credits) { setBalance(credits.balance ?? 0); setReservedCredits(credits.reserved ?? 0); }
      }
    } catch (generationError) {
      if (kind === "image") { imageRecoveryReadyRef.current = false; setImageRecoveryReady(false); }
      stopProgressRef.current?.();
      stopProgressRef.current = null;
      setGenerationProgress(0);
      setError(generationError instanceof Error ? generationError.message : t("sweep3.text203"));
    } finally {
      if (!photoStillProcessing || kind === "video") {
        stopProgressRef.current?.();
        stopProgressRef.current = null;
      }
      if (kind === "video" || !photoStillProcessing) {
        setLoading(false);
        generatingRef.current = false;
      }
    }
  }

  async function recharge() {
    const credits = Number(creditAmount);
    if (!Number.isInteger(credits) || credits < 200) { setError(t("sweep1.text204")); return; }
    setRecharging(true);
    try {
      const response = await fetch("/api/studio/credits/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credits }) });
      const result = await response.json();
      if (!response.ok || !result.payment?.url) throw new Error(result.error || "Paiement indisponible.");
      window.location.href = result.payment.url;
    } catch (rechargeError) { setError(rechargeError instanceof Error ? rechargeError.message : t("optionsExtra.text20")); setRecharging(false); }
  }

  const rechargeCredits = Number(creditAmount);
  const rechargePrice = Number.isInteger(rechargeCredits) && rechargeCredits >= 200 ? Math.round(rechargeCredits * CREDIT_PRICE_XOF) : 0;

  async function editImage() {
    if (!selectedGenerationId || !editInstruction.trim()) return;
    setEditSubmitting(true); setError("");
    try {
      const response = await fetch("/api/studio/image/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationId: selectedGenerationId, instruction: editInstruction }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Modification impossible.");
      setImageUrl(result.imageUrl); setSelectedGenerationId(result.generationId); setEditInstruction(""); setEditOpen(false); setHistoryCursor(null); await loadHistory(true);
      const credits = await fetch("/api/studio/credits").then((r) => r.ok ? r.json() : null).catch(() => null); if (credits) { setBalance(credits.balance ?? 0); setReservedCredits(credits.reserved ?? 0); }
    } catch (editError) { setError(editError instanceof Error ? editError.message : t("optionsExtra.text21")); } finally { setEditSubmitting(false); }
  }

  // Téléchargement direct : on récupère le fichier en blob puis on déclenche un
  // vrai téléchargement local. Sur Android (Chrome / PWA), l'image est enregistrée
  // sans menu intermédiaire et apparaît dans la galerie (album « Téléchargements »).
  // Un navigateur ne peut pas écrire dans la galerie à la place de l'utilisateur ;
  // sur iPhone/iPad, seul le menu de partage (« Enregistrer l'image ») permet
  // d'atterrir dans Photos, donc on le garde uniquement là.
  async function downloadMedia(url: string, filename: string) {
    const isIos = typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const triggerLink = (href: string, name: string) => {
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const type = blob.type || (filename.endsWith(".mp4") ? "video/mp4" : "image/png");
      const extension = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("mp4") ? "mp4" : type.includes("png") ? "png" : (filename.split(".").pop() ?? "png");
      const finalName = `${filename.replace(/\.[^.]+$/, "")}-${Date.now().toString(36)}.${extension}`;
      if (isIos && navigator.share && navigator.canShare) {
        const file = new File([blob], finalName, { type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: finalName });
          return;
        }
      }
      const objectUrl = URL.createObjectURL(blob);
      triggerLink(objectUrl, finalName);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (downloadError) {
      if ((downloadError as DOMException)?.name === "AbortError") return;
      // Dernier recours : lien direct (si le serveur interdit la lecture en blob).
      triggerLink(url, filename);
    }
  }

  const videoReady = videoJob?.status === "completed" && videoJob.contentUrl;
  const isSlideshow = (item: StudioHistoryItem) => item.kind === "video" && (item.metadata?.type === "slideshow" || item.creationType === "slideshow");
  const selectedHistory = history.find((item) => item.id === selectedHistoryId) ?? null;
  const openHistoryItem = (item: StudioHistoryItem) => {
    const slideshowTask = (item.metadata?.type === "studio_background_task" && item.metadata?.taskKind === "slideshow")
      || (item.metadata?.taskId === item.id && item.creationType === "slideshow" && item.status !== "completed");
    if (slideshowTask) {
      setSelectedHistoryId(null);
      studioTabTouchedRef.current = true;
      setSelectedSlideshowTaskId(item.id);
      setStudioTab("slideshow");
      return;
    }
    setSelectedHistoryId(item.id);
  };
  const selectProduct = (product: typeof products[number] | null) => {
    setSelectedSlideshowTaskId(null);
    setSelectedProduct(product);
  };
  const openStudioMode = (mode: "image" | "slideshow" | "video") => {
    setMobileStudioMode(mode);
    studioTabTouchedRef.current = true;
    setSelectedHistoryId(null);
    setSelectedSlideshowTaskId(null);
    setKind(mode === "video" ? "video" : "image");
    setStudioTab(mode === "slideshow" ? "slideshow" : "photo");
  };

  return (
      <div className={`studio-page${mobileStudioMode ? " is-open" : ""}`} data-session={mobileStudioMode ?? undefined}>
        <div className="page-top studio-head">
          <div>
            <span className="eyebrow">{t("studio.eyebrow")}</span>
            <h1 id="studio-page-title" className="studio-default-title" tabIndex={-1}>{t("studio.title")}</h1>
            {mobileStudioMode === "slideshow" ? <><h1 className="studio-session-title">{locale === "en" ? "Slideshow session" : "Session diaporama"}</h1><p className="studio-session-subtitle">{locale === "en" ? "Create an impactful video slideshow to showcase your product." : "Créez un diaporama vidéo impactant pour mettre en valeur votre produit."}</p></> : null}
            {mobileStudioMode === "video" ? <><h1 className="studio-session-title">{locale === "en" ? "Video session" : "Session vidéo"}</h1><p className="studio-session-subtitle">{locale === "en" ? "Turn your product into an engaging video with AI." : "Transformez votre produit en une vidéo engageante grâce à l’IA."}</p></> : null}
          </div>
        </div>
      <section className="studio-mobile-start" aria-label={locale === "en" ? "Choose a creation format" : "Choisir un format de création"}>
        <div className="studio-mobile-choice-list">
          <article className="studio-mobile-choice" data-studio-format="image">
            <div className="studio-mobile-choice-preview" data-example-slot="image" aria-hidden="true">
              <img src="/studio-format-previews/image-poster.jpeg" alt="" loading="lazy" decoding="async" />
            </div>
            <div className="studio-mobile-choice-footer">
              <strong className="studio-mobile-choice-title">Image</strong>
              <p className="studio-mobile-choice-description">{locale === "en" ? "Promotional poster" : "Affiche promotionnelle"}</p>
              <button type="button" className="studio-mobile-choice-select" onClick={() => openStudioMode("image")}>{locale === "en" ? "Select" : "Sélectionner"}</button>
            </div>
          </article>
          <article className="studio-mobile-choice" data-studio-format="slideshow">
            <div className="studio-mobile-choice-preview" data-example-slot="slideshow" aria-hidden="true">
              <StudioFormatPreviewVideo src="/studio-format-previews/video-linkedin.mp4" poster="/studio-format-previews/slideshow-poster.webp" />
            </div>
            <div className="studio-mobile-choice-footer">
              <strong className="studio-mobile-choice-title">{locale === "en" ? "Slideshow" : "Diaporama"}</strong>
              <p className="studio-mobile-choice-description">{locale === "en" ? "A sequence of images with voice-over" : "Une suite d’images avec une voix off"}</p>
              <button type="button" className="studio-mobile-choice-select" onClick={() => openStudioMode("slideshow")}>{locale === "en" ? "Select" : "Sélectionner"}</button>
            </div>
          </article>
          <article className="studio-mobile-choice" data-studio-format="video">
            <div className="studio-mobile-choice-preview" data-example-slot="video" aria-hidden="true">
              <StudioFormatPreviewVideo src="/studio-format-previews/slideshow-lonae.mp4" poster="/studio-format-previews/video-poster.webp" />
            </div>
            <div className="studio-mobile-choice-footer">
              <strong className="studio-mobile-choice-title">{locale === "en" ? "Video" : "Vidéo"}</strong>
              <p className="studio-mobile-choice-description">{locale === "en" ? "A short promotional video" : "Une courte vidéo publicitaire"}</p>
              <button type="button" className="studio-mobile-choice-select" onClick={() => openStudioMode("video")}>{locale === "en" ? "Select" : "Sélectionner"}</button>
            </div>
          </article>
        </div>
      </section>
      <button type="button" className="studio-mobile-back" onClick={() => setMobileStudioMode(null)}><ArrowLeft size={16} aria-hidden="true" /> {locale === "en" ? "Choose another format" : "Choisir un autre format"}</button>

      <div className="studio-tabs" role="tablist" aria-label={t("sweep2.text205")}>
        <button type="button" role="tab" id="studio-photo-tab" aria-controls="studio-photo-panel" aria-selected={studioTab === "photo" && kind === "image"} className={studioTab === "photo" && kind === "image" ? "active" : ""} onClick={() => { studioTabTouchedRef.current = true; setStudioTab("photo"); setKind("image"); }}><ImageIcon size={17} /> Photo</button>
        <button type="button" role="tab" id="studio-slideshow-tab" aria-controls="studio-slideshow-panel" aria-selected={studioTab === "slideshow"} className={studioTab === "slideshow" ? "active" : ""} onClick={() => { studioTabTouchedRef.current = true; setStudioTab("slideshow"); }}><ImageIcon size={17} /> {locale === "en" ? "Slideshow" : "Diaporama"}</button>
        <button type="button" role="tab" id="studio-video-tab" aria-controls="studio-photo-panel" aria-selected={studioTab === "photo" && kind === "video"} className={studioTab === "photo" && kind === "video" ? "active" : ""} onClick={() => { studioTabTouchedRef.current = true; setStudioTab("photo"); setKind("video"); setError(""); }}><Video size={17} /> {t("studio.video")}</button>
      </div>
      <section className="studio-product-picker"><div className="studio-product-heading"><span className="eyebrow">{t("studio.product")}</span>{products.length > 6 ? <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={t("studio.search")} /> : null}</div>{products.length ? <div className="studio-product-list"><button type="button" className={!selectedProduct ? "selected" : ""} onClick={() => selectProduct(null)}><Package size={18} /><span>{t("studio.noProduct")}</span></button>{products.filter((product) => !productSearch || product.name.toLowerCase().includes(productSearch.toLowerCase())).map((product) => <button type="button" key={product.id} className={selectedProduct?.id === product.id ? "selected" : ""} onClick={() => selectProduct(product)}>{product.image ? <img src={product.image} alt="" /> : <Package size={18} />}<span>{product.name}</span><small>{product.price ? `${product.price} ${product.currency ?? ""}` : ""}</small></button>)}</div> : <small>{t("studio.noProductText")}</small>}{selectedProduct ? <div className="studio-product-chip">{t("studio.selected")} {selectedProduct.name} <button type="button" onClick={() => selectProduct(null)} aria-label={t("sweep3.text206")}>×</button>{selectedProduct.image ? <em>{kind === "video" ? t("studio.coverRef") : t("studio.imageReferenceNote")}</em> : null}</div> : null}</section>
      <div id="studio-slideshow-panel" ref={slideshowPanelRef} tabIndex={-1} role="tabpanel" aria-labelledby="studio-slideshow-tab" hidden={studioTab !== "slideshow"}>
        <SlideshowStudio product={selectedProduct} products={products} onSelectProduct={(productId) => selectProduct(products.find((product) => product.id === productId) ?? null)} locale={locale} selectedTaskId={selectedSlideshowTaskId} onComplete={() => void loadHistory(true)} />
      </div>
      <div id="studio-photo-panel" role="tabpanel" aria-labelledby={kind === "video" ? "studio-video-tab" : "studio-photo-tab"} hidden={studioTab !== "photo"}>
      <div className={`studio-grid${kind === "video" ? " studio-video-grid" : ""}`}>
        <section className="app-card studio-form">
          {kind === "video" ? <StudioDesktopProductFields products={products} selectedProduct={selectedProduct} onSelect={(productId) => selectProduct(products.find((product) => product.id === productId) ?? null)} locale={locale} mode="video" /> : null}
          <label className={`studio-field${promptGenerating ? " is-generating" : ""}`}>

            <span>{t("studio.describe")}</span>
            <div className="studio-prompt-box">
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={kind === "image" ? t("studio.describeImage") : t("studio.describeVideo")} maxLength={4000} rows={7} readOnly={promptGenerating} aria-busy={promptGenerating} />
              {promptGenerating ? <div className="studio-prompt-status" role="status" aria-live="polite"><Sparkles size={14} /><b>{t("studio.insertProductInfoLoading")}</b><i /><i /><i /></div> : null}
            </div>
            <small>{prompt.length}/4 000</small>
          </label>

          {kind === "video" ? <div className="studio-video-prompt-action studio-video-prompt-action--desktop">{selectedProduct ? <button type="button" className={`studio-insert-btn${promptGenerating ? " is-loading" : ""}`} onClick={() => void insertProductInfo()} disabled={promptGenerating || loading} aria-busy={promptGenerating}><span className="studio-insert-icon"><Package size={18} /></span><span className="studio-insert-text"><strong>{promptGenerating ? "Génération du prompt…" : "Générer le prompt"}</strong><small>{selectedProduct.name}</small></span><Sparkles size={16} className="studio-insert-spark" /></button> : <p className="studio-cost">Sélectionne un produit pour générer un prompt adapté. Tu peux aussi rédiger le prompt ci-dessus.</p>}</div> : null}

          {kind === "image" ? (
            <div className="studio-options">
              {selectedProduct ? <button type="button" className={`studio-insert-btn${promptGenerating ? " is-loading" : ""}`} onClick={() => void insertProductInfo()} disabled={promptGenerating || loading} aria-busy={promptGenerating}><span className="studio-insert-icon"><Package size={18} /></span><span className="studio-insert-text"><strong>{promptGenerating ? t("studio.insertProductInfoLoading") : t("studio.insertProductInfo")}</strong><small>{selectedProduct.name}</small></span><Sparkles size={16} className="studio-insert-spark" /></button> : null}
              <div className="studio-field studio-references"><span>{t("studio.references")}</span><label className={`studio-upload${referenceFiles.length ? " has-files" : ""}${referenceUploading || loading ? " is-disabled" : ""}`}><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => setReferenceFiles(Array.from(event.target.files ?? []).slice(0, 3))} disabled={referenceUploading || loading} /><span className="studio-upload-icon"><ImageIcon size={20} /></span><span className="studio-upload-text"><strong>{referenceFiles.length ? t("dynamicExtra.selectedImages", { count: (referenceFiles.length), plural: (referenceFiles.length > 1 ? "s" : "") }) : t("sweep1.text207")}</strong><small>{referenceFiles.length ? referenceFiles.map((file) => file.name).join(", ") : t("studio.referenceHint")}</small></span></label>{referenceFiles.length ? <button type="button" className="studio-upload-clear" onClick={() => setReferenceFiles([])} disabled={referenceUploading || loading}>{t("sweep2.text208")}</button> : null}</div>
              <StudioSelect label={t("studio.quality")} value={quality} onChange={setQuality} options={[['medium', t("studio.medium")], ['high', t("studio.high")], ['xhigh', t("studio.xhigh")], ['max', t("studio.max")]]} />
              <StudioSelect label={t("studio.resolution")} value={imageResolution} onChange={setImageResolution} options={[['hd', 'HD'], ['full_hd', 'Full HD'], ['2k', '2K'], ['4k', '4K']]} />
              <StudioSelect label={t("studio.format")} value={orientation} onChange={setOrientation} options={[['square', t("studio.square")], ['landscape', t("studio.landscape")], ['portrait', t("studio.portrait")]]} />
              <StudioSelect label={t("studio.background")} value={background} onChange={setBackground} options={[['auto', t("studio.auto")], ['opaque', t("studio.opaque")], ['transparent', t("studio.transparent")]]} />
            </div>
          ) : (
            <>
              <div className="studio-options studio-video-options-mobile">
                <fieldset className="studio-field">
                  <legend>Style de vidéo</legend>
                  <div className="studio-tabs" role="group" aria-label="Style de vidéo">
                    <button type="button" aria-pressed={videoStyle === "motion_design"} className={videoStyle === "motion_design" ? "active" : ""} onClick={() => setVideoStyle("motion_design")}>Motion design</button>
                    <button type="button" aria-pressed={videoStyle === "ugc"} className={videoStyle === "ugc" ? "active" : ""} onClick={() => setVideoStyle("ugc")}>UGC</button>
                  </div>
                  <small>Motion design est sélectionné par défaut; tu peux aussi choisir UGC.</small>
                </fieldset>
                {selectedProduct ? <button type="button" className={`studio-insert-btn${promptGenerating ? " is-loading" : ""}`} onClick={() => void insertProductInfo()} disabled={promptGenerating || loading} aria-busy={promptGenerating}><span className="studio-insert-icon"><Package size={18} /></span><span className="studio-insert-text"><strong>{promptGenerating ? "Génération du prompt…" : "Générer le prompt"}</strong><small>{selectedProduct.name}</small></span><Sparkles size={16} className="studio-insert-spark" /></button> : <p className="studio-cost">Sélectionne un produit pour générer un prompt adapté. Tu peux aussi rédiger le prompt ci-dessus.</p>}
                <div className="studio-field"><span>{t("studio.duration")}</span><strong>{locale === "en" ? "25 seconds (15 s + 10 s)" : "25 secondes (15 s + 10 s)"}</strong><small>{locale === "en" ? "Two clips are assembled into one 25-second video." : "Deux séquences sont assemblées en une seule vidéo finale de 25 s."}</small></div>
                <StudioSelect label={t("studio.resolution")} value={videoResolution} onChange={(value) => setVideoResolution(value as typeof VIDEO_RESOLUTIONS[number])} options={VIDEO_RESOLUTIONS.map((value) => [value, value])} />
                {selectedProduct?.image ? <p className="studio-cost" style={{ marginTop: 8 }}>{t("studio.coverStart")}</p> : null}
                <StudioSelect label={t("studio.format")} value={aspectRatio} onChange={setAspectRatio} options={VIDEO_ASPECT_RATIOS.map((value) => [value, value === "16:9" ? t("studio.landscape16") : t("studio.vertical9")])} />
              </div>
              <div className="studio-options studio-video-options-desktop">
                <fieldset className="studio-field studio-video-style">
                  <legend>Style de vidéo</legend>
                  <div className="studio-video-style-cards" role="group" aria-label="Style de vidéo">
                    <button type="button" aria-pressed={videoStyle === "motion_design"} className={`studio-video-style-card${videoStyle === "motion_design" ? " active" : ""}`} onClick={() => setVideoStyle("motion_design")}>
                      <span className="studio-video-style-icon"><Video size={23} aria-hidden="true" /></span>
                      <span><strong>Motion design</strong><small>Animations modernes et dynamiques</small></span>
                    </button>
                    <button type="button" aria-pressed={videoStyle === "ugc"} className={`studio-video-style-card${videoStyle === "ugc" ? " active" : ""}`} onClick={() => setVideoStyle("ugc")}>
                      <span className="studio-video-style-icon"><Users size={23} aria-hidden="true" /></span>
                      <span><strong>UGC</strong><small>Style authentique et naturel comme sur les réseaux sociaux</small></span>
                    </button>
                  </div>
                  <small className="studio-video-style-help">Motion design est sélectionné par défaut; tu peux aussi choisir UGC.</small>
                </fieldset>
                <div className="studio-video-controls-grid">
                  <div className="studio-field studio-video-duration">
                    <span>{locale === "en" ? "Final duration" : "Durée finale"}</span>
                    <div className="studio-video-duration-value"><div className="studio-video-duration-track" role="img" aria-label={locale === "en" ? "25 seconds, fixed duration" : "25 secondes, durée fixe"}><span /></div><output>25 {locale === "en" ? "seconds" : "secondes"}</output></div>
                    <div className="studio-video-duration-ticks" aria-hidden="true"><span>5 s</span><span>10 s</span><span>15 s</span><span>20 s</span><span>25 s</span></div>
                    <small>{locale === "en" ? "Two clips are assembled: 15 s + 10 s." : "Deux séquences assemblées : 15 s + 10 s."}</small>
                  </div>
                  <div className="studio-video-format-resolution">
                    <StudioSelect label={t("studio.format")} value={aspectRatio} onChange={setAspectRatio} options={VIDEO_ASPECT_RATIOS.map((value) => [value, value === "16:9" ? t("studio.landscape16") : t("studio.vertical9")])} />
                    <StudioSelect label={t("studio.resolution")} value={videoResolution} onChange={(value) => setVideoResolution(value as typeof VIDEO_RESOLUTIONS[number])} options={VIDEO_RESOLUTIONS.map((value) => [value, value])} />
                  </div>
                </div>
                {selectedProduct?.image ? <p className="studio-cost" style={{ marginTop: 8 }}>{t("studio.coverStart")}</p> : null}
              </div>
            </>
          )}

          {error ? <p className="form-error">{localizeSystemMessage(error, locale)}</p> : null}
          <button type="button" className="btn btn-dark studio-generate" onClick={() => void generate()} disabled={loading || promptGenerating || referenceUploading || (kind === "image" && !imageRecoveryReady) || (kind === "video" && (STUDIO_VIDEO_LOCKED || !creditsLoaded || availableCredits < videoCostEstimate))}>
            <Sparkles size={17} /> {kind === "video" ? STUDIO_VIDEO_LOCKED ? "Rendu vidéo verrouillé sur cette Preview" : loading ? (locale === "en" ? "Starting video…" : "Lancement de la vidéo…") : locale === "en" ? "Generate video" : "Créer la vidéo" : loading && (imageTrackingIssue || imageTask?.status === "awaiting_media") ? (locale === "en" ? "Retrieving image…" : "Récupération de l’image…") : loading || referenceUploading ? t("studio.generating") : t("studio.createImage")}
          </button>
          {kind === "image" ? <><p className="studio-cost">{t("studio.imageCost")}</p>
          <div className="studio-balance"><div><span className="eyebrow">{t("studio.balance")}</span><strong>{balance} {t("studio.credits")}</strong></div><button type="button" className="btn btn-ghost" onClick={() => setRechargeOpen(true)}>{t("studio.recharge")}</button><small>{t("studio.balanceHint")}</small>{rechargeOpen ? <div className="studio-recharge-panel"><div><strong>{t("studio.recharge")}</strong><button type="button" className="studio-recharge-close" onClick={() => setRechargeOpen(false)} aria-label={t("wizardExtra.close")}>×</button></div><label className="studio-field"><span>{t("sweep1.text84")}</span><input type="number" min="200" step="1" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} autoFocus /></label><p>{t("finalExtra.text18")} {" "}<strong>{rechargePrice ? `${rechargePrice.toLocaleString("fr-FR")} XOF` : "—"}</strong></p><small>{t("sweep3.text209")}</small><button type="button" className="btn btn-dark" onClick={() => void recharge()} disabled={recharging || !rechargePrice}>{recharging ? t("sweep1.text210") : t("sweep2.text211")}</button></div> : null}</div></> : <div className="studio-video-cost-inline"><p className="studio-cost">Coût estimé : <strong>{videoCostEstimate} crédits Studio</strong> ({duration} s, {videoResolution}). Solde disponible : <strong>{creditsLoaded ? availableCredits : locale === "en" ? "loading…" : "chargement…"}</strong> {t("studio.credits")}.</p><p className="studio-cost">Aucun achat supplémentaire ne sera lancé. La génération est refusée automatiquement si le solde disponible ne couvre pas ce coût.</p></div>}
        </section>

        <section className="app-card studio-result" aria-busy={loading || editSubmitting || Boolean(videoJob && !["completed", "failed", "cancelled"].includes(videoJob.status))}>
          <div className="card-head"><div><span className="eyebrow">{kind === "video" ? <><span className="studio-video-mobile-eyebrow">{t("studio.result")}</span><span className="studio-video-desktop-eyebrow">{locale === "en" ? "Preview" : "Aperçu"}</span></> : t("studio.result")}</span><h2>{kind === "image" ? t("studio.yourImage") : kind === "video" ? <><span className="studio-video-mobile-title">{t("studio.yourVideo")}</span><span className="studio-video-desktop-title">{locale === "en" ? "Video preview" : "Aperçu vidéo"}</span></> : t("studio.yourVideo")}</h2></div>{kind === "image" ? <ImageIcon size={20} /> : kind === "video" ? <><Video className="studio-video-mobile-icon" size={20} /><span className="studio-video-format-badge"><Video size={15} aria-hidden="true" /> Format {aspectRatio}</span></> : <Video size={20} />}</div>
          {imageUrl ? <><div className={editSubmitting ? "studio-media-wrap is-editing" : "studio-media-wrap"}><img className="studio-media" src={imageUrl} alt={t("studio.yourImage")} decoding="async" onLoad={() => { setImageLoaded(true); setGenerationProgress(100); }} onError={() => { setImageLoaded(false); setGenerationProgress((current) => Math.min(current, 95)); setError(t("studio.imageLoadError")); }} /></div><div className="studio-result-actions"><button className="btn btn-ghost" onClick={() => void downloadMedia(imageUrl, "vendeo-studio-image.png")}>{t("studio.downloadImage")}</button><button className="btn btn-ghost" onClick={() => setEditOpen(true)} disabled={editSubmitting}>{t("studio.edit")}</button></div>{editOpen ? <div className="studio-edit-box"><label><span>{t("sweep3.text212")}</span><textarea maxLength={2000} value={editInstruction} onChange={(event) => setEditInstruction(event.target.value)} rows={3} disabled={editSubmitting} /></label><small>{t("sweep1.text213")}</small><div><button className="btn btn-dark" onClick={() => void editImage()} disabled={editSubmitting || !editInstruction.trim()}>{editSubmitting ? t("optionsExtra.text22") : t("studio.edit")}</button><button className="btn btn-ghost" onClick={() => { setEditOpen(false); setEditInstruction(""); }} disabled={editSubmitting}>{t("workspaceExtra.cancel")}</button></div></div> : null}</> : null}
          {videoReady ? <><video className="studio-media" src={videoJob.contentUrl ?? undefined} controls playsInline /><VideoDownloadButton url={videoJob.contentUrl!} filename="vendeo-studio-video.mp4" locale={locale}>{t("studio.downloadVideo")}</VideoDownloadButton></> : null}
          {kind === "video" && videoJob?.status === "failed" && videoJob.error ? <p className="form-error" role="alert">{videoJob.error}</p> : null}
          {!imageUrl && !videoReady ? <div className={loading || videoJob ? "studio-empty studio-loading" : "studio-empty"}>{loading || videoJob ? <><Sparkles size={32} /><strong>{kind === "image" && imageTask?.status === "awaiting_media" ? (locale === "en" ? "Image created" : "Image créée") : kind === "image" && imageTrackingIssue ? (locale === "en" ? "Checking your creation" : "Vérification de ta création") : t("chat.posterGenerating")}</strong><p role="status">{kind === "image" && imageTrackingIssue ? (locale === "en" ? "Tracking is temporarily unavailable. Checking automatically; do not start another generation." : "Suivi temporairement indisponible. Vérification automatique en cours ; ne relance pas de génération.") : kind === "image" && imageTask?.status === "awaiting_media" ? (locale === "en" ? "Retrieving the saved image. No new generation or credit charge." : "Récupération de l’image enregistrée. Aucune nouvelle génération ni dépense de crédits.") : videoJob ? t("dynamicExtra.videoStatus", { status: (videoJob.status) }) : t("optionsExtra.text23")}</p>{kind === "image" && loading && !imageTrackingIssue && imageTask?.status !== "awaiting_media" ? <div className="studio-generation-progress"><span>{t("studio.estimatedProgress")}: {generationProgress}%</span><div role="progressbar" aria-label={t("studio.estimatedProgress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={generationProgress}><div style={{ width: `${generationProgress}%` }} /></div></div> : null}</>  : kind === "video" ? <><div className="studio-video-sample" role="img" aria-label={locale === "en" ? "Sample video preview" : "Exemple d’aperçu vidéo"}><span aria-hidden="true">▶</span></div><div className="studio-video-empty-copy"><Sparkles size={32} /><strong>{t("sweep2.text214")}</strong><p>{t("sweep3.text215")}</p></div></> : <><Sparkles size={32} /><strong>{t("sweep2.text214")}</strong><p>{t("sweep3.text215")}</p></>}</div> : null}
          {imageUrl && kind === "image" ? <div className="studio-generation-progress" aria-live="polite"><span>{t("studio.estimatedProgress")}: {generationProgress}%</span><div role="progressbar" aria-label={t("studio.estimatedProgress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={generationProgress}><div style={{ width: `${generationProgress}%` }} /></div></div> : null}
          {kind === "video" ? <section className="studio-video-cost-card" aria-label={locale === "en" ? "Estimated cost" : "Coût estimé"}><div className="studio-video-cost-icon"><Layers size={22} aria-hidden="true" /></div><div><span className="eyebrow">{locale === "en" ? "Estimated cost" : "Coût estimé"}</span><strong>{videoCostEstimate} {t("studio.credits")}</strong><small>{locale === "en" ? `Final duration · ${duration} seconds · ${videoResolution}` : `Durée finale · ${duration} secondes · ${videoResolution}`}</small><small>{locale === "en" ? "Available balance" : "Solde disponible"} · {creditsLoaded ? availableCredits : locale === "en" ? "loading…" : "chargement…"} {t("studio.credits")}</small></div></section> : null}
        </section>
      </div>
      </div>
      {selectedHistory ? <section ref={historyViewerRef} tabIndex={-1} className="app-card studio-result studio-history-viewer" aria-label={t("studio.result")}>
        <div className="card-head"><div><span className="eyebrow">{t("overview.history")}</span><h2>{selectedHistory.kind === "image" ? t("studio.yourImage") : isSlideshow(selectedHistory) ? (locale === "en" ? "Slideshow" : "Diaporama") : t("studio.yourVideo")}</h2></div>{selectedHistory.kind === "image" ? <ImageIcon size={20} /> : <Video size={20} />}</div>
        {isSlideshow(selectedHistory) && selectedHistory.mediaState === "missing" ? <p role="status">{locale === "en" ? "Final MP4 not found. The source images are preserved. No automatic regeneration." : "MP4 final introuvable. Les images sources sont conservées. Aucune régénération automatique."}</p> : selectedHistory.status === "processing" ? <p role="status">{t("dynamicExtra.videoStatus", { status: selectedHistory.status })}</p> : selectedHistory.status === "failed" || selectedHistory.status === "cancelled" ? <p role="status">{t("overview.importFailed")}</p> : selectedHistory.mediaUrl ? selectedHistory.kind === "video" ? <><video className="studio-media" src={selectedHistory.mediaUrl} poster={isSlideshow(selectedHistory) ? selectedHistory.thumbnailUrl ?? undefined : undefined} controls playsInline preload="metadata" aria-label={isSlideshow(selectedHistory) ? (locale === "en" ? "Slideshow" : "Diaporama") : undefined} /><VideoDownloadButton key={selectedHistory.id} url={selectedHistory.mediaUrl} filename={isSlideshow(selectedHistory) ? "vendeo-diaporama.mp4" : "vendeo-studio-video.mp4"} locale={locale}>{t("studio.downloadVideo")}</VideoDownloadButton></> : <><div className="studio-media-wrap"><img className="studio-media" src={selectedHistory.mediaUrl} alt={t("studio.yourImage")} /></div><div className="studio-result-actions"><button type="button" className="btn btn-ghost" onClick={() => void downloadMedia(selectedHistory.mediaUrl!, "vendeo-studio-image.png")}>{t("studio.downloadImage")}</button><button type="button" className="btn btn-ghost" onClick={() => { setKind("image"); setStudioTab("photo"); setImageUrl(selectedHistory.mediaUrl ?? null); setSelectedGenerationId(selectedHistory.id); setEditOpen(true); }}>{t("studio.edit")}</button></div></> : <p>{t("sweep2.text214")}</p>}
      </section> : null}
      <div className="studio-history-toolbar"><span className="eyebrow">{t("overview.history")}</span><div><button className={historyKind === "all" ? "active" : ""} onClick={() => setHistoryKind("all")}>{t("sweep1.text216")}</button><button className={historyKind === "image" ? "active" : ""} onClick={() => setHistoryKind("image")}>Images</button><button className={historyKind === "video" ? "active" : ""} onClick={() => setHistoryKind("video")}>{locale === "en" ? "Videos / Slideshows" : "Vidéos / Diaporamas"}</button></div></div>
      <section className="studio-history">{history.length ? history.map((item) => { const slideshow = isSlideshow(item); const title = slideshow ? (locale === "en" ? "Slideshow" : "Diaporama") : item.kind === "image" ? "Image" : t("studio.video"); const finalCaption = slideshow ? [typeof item.metadata?.duration === "number" ? `${item.metadata.duration}s` : null, typeof item.sourceImageCount === "number" ? `${item.sourceImageCount} ${locale === "en" ? "source images" : "images sources"}` : null].filter(Boolean).join(" · ") : ""; return <article className="studio-history-card" key={item.id} tabIndex={0} role="group" aria-label={`${title}: ${item.prompt.slice(0, 90)}`} onClick={() => openHistoryItem(item)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openHistoryItem(item); } }}><div className={`studio-history-thumb ${item.status === "processing" ? "is-loading" : ""}`}>{slideshow && item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={title} loading="lazy" decoding="async" /> : item.mediaUrl && item.kind === "image" ? <img src={item.mediaUrl} alt={t("wizardExtra.step.creation")} loading="lazy" decoding="async" /> : item.mediaUrl && item.kind === "video" ? <video src={`${item.mediaUrl}#t=0.5`} muted playsInline preload="metadata" aria-label={t("sweep3.text218")} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : item.kind === "video" ? <Video size={22} /> : <Sparkles size={22} />}</div><div className="studio-history-copy"><strong>{title}</strong><p>{item.prompt.slice(0, 90)}{item.prompt.length > 90 ? "…" : ""}</p><small>{finalCaption ? `${finalCaption} · ` : ""}{new Date(item.created_at).toLocaleString("fr-FR")} · {item.credits_cost} {" "}{t("sweep1.text219")} {item.status === "processing" ? t("optionsExtra.text24") : item.status === "failed" ? t("overview.importFailed") : t("adsExtra.status.completed")}</small></div><div className="studio-history-actions"><button type="button" onClick={(event) => { event.stopPropagation(); setPrompt(item.prompt); }}>{t("sweep2.text220")}</button>{item.kind === "image" ? <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedGenerationId(item.id); setImageUrl(item.mediaUrl ?? null); setEditOpen(true); }}>{t("studio.edit")}</button> : null}<button type="button" onClick={async (event) => { event.stopPropagation(); if (!window.confirm("Supprimer cette création ?")) return; await fetch(`/api/studio/history/${item.id}`, { method: "DELETE" }); await loadHistory(true); }}>{t("ads.correction.deleteCampaign")}</button></div></article>; }) : <div className="studio-history-empty">{t("sweep3.text221")}</div>}{historyCursor ? <button className="btn btn-ghost studio-load-more" onClick={() => void loadHistory()} disabled={historyLoading}>{historyLoading ? t("adminExtra.notifications.loading") : t("optionsExtra.text25")}</button> : null}</section>
    </div>
  );
}

function StudioSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="studio-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

export function Overview({
  stores,
  subscription,
  analytics,
  userFirstName,
  onGoToAI,
  onGoToStores,
  selectedStoreId,
  onStoreChange,
  onLaunchAd,
  campaignsVersion,
}: {
  stores: StoreData[];
  subscription: SubscriptionData | null;
  analytics: AnalyticsData;
  userFirstName: string;
  onGoToAI: () => void;
  onGoToStores: () => void;
  selectedStoreId: string | null;
  onStoreChange: (storeId: string) => void;
  onLaunchAd: () => void;
  campaignsVersion: number;
}) {
  const { t } = useI18n();
  const store = stores.find((item) => item.id === selectedStoreId) ?? stores[0];
  const connected = store?.connection_status === "connected";
  const [periodDays, setPeriodDays] = useState(30);
  const [overviewAnalytics, setOverviewAnalytics] = useState<AnalyticsData>(analytics);
  const [metaDaily, setMetaDaily] = useState<Array<{ date: string; spend: number | null }>>([]);
  const [campaignDaily, setCampaignDaily] = useState<Array<{ date: string; spend: number | null; netRevenue: number | null; campaigns: number }>>([]);
  const periodRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - periodDays + 1);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, [periodDays]);
  const products = overviewAnalytics?.products ?? analytics?.products ?? [];
  const currency = products[0]?.currency ?? "XOF";
  const overview = overviewAnalytics?.overview;
  const overviewCurrency = overview?.currency ?? currency;
  const overviewHasSales = (overview?.sales ?? 0) > 0;
  const [refreshing, setRefreshing] = useState(false);
  const [metaAccount, setMetaAccount] = useState<MetaAccountState | null>(null);
  const [metaPerformance, setMetaPerformance] = useState<MetaPerformance | null>(null);
  useEffect(() => { setOverviewAnalytics(analytics); }, [analytics]);
  useEffect(() => {
    if (!selectedStoreId) return;
    let cancelled = false;
    void fetch(`/api/analytics?store_id=${encodeURIComponent(selectedStoreId)}&from=${periodRange.from}&to=${periodRange.to}`)
      .then((res) => res.ok ? res.json() : null)
      .then((result) => { if (!cancelled && result?.snapshot) setOverviewAnalytics(result.snapshot as AnalyticsData); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [periodRange, selectedStoreId]);

  useEffect(() => {
    if (!selectedStoreId) { setCampaignDaily([]); return; }
    let cancelled = false;
    void fetch(`/api/overview/campaign-history?store_id=${encodeURIComponent(selectedStoreId)}&from=${periodRange.from}&to=${periodRange.to}&currency=${encodeURIComponent(overviewCurrency)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (!cancelled) setCampaignDaily(result?.daily ?? []); })
      .catch(() => { if (!cancelled) setCampaignDaily([]); });
    return () => { cancelled = true; };
  }, [overviewCurrency, periodRange, selectedStoreId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const accountsResponse = await fetch("/api/integrations/meta/accounts");
      const accountsData = accountsResponse.ok ? await accountsResponse.json() : { accounts: [] };
      const accounts = accountsData.accounts ?? [];
      setMetaAccount(accounts[0] ?? null);
      if (accounts[0]) {
        const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(accounts[0].id)}&store_id=${encodeURIComponent(selectedStoreId ?? "")}&from=${periodRange.from}&to=${periodRange.to}`);
        if (metrics.ok) setMetaPerformance(await metrics.json());
        else setMetaPerformance(null);
      } else {
        setMetaPerformance(null);
      }
    } catch {
      setMetaPerformance(null);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => { void refresh(); }, [campaignsVersion, periodRange, selectedStoreId]);

  const performances = metaPerformance?.performances ?? [];
  const adsCurrency = metaPerformance?.currency ?? currency;

  const productPerformance = overviewAnalytics?.productPerformance
    ?? products.map((product) => ({ id: product.id, name: product.name, image: product.image, sales: product.sales ?? 0, revenueNet: null }));
  const productsForOverview = productPerformance.filter((product) => product.sales > 0).map((product) => ({
    ...product,
    revenueNet: product.revenueNet === null ? null : toUsd(product.revenueNet, overviewCurrency),
    approximate: overviewCurrency.trim().toUpperCase() !== "USD",
  }));

  const revenueSeries = (overview?.revenueSeries ?? []).flatMap((point) => {
    const revenueNet = point.revenueNet === null ? null : toUsd(point.revenueNet, overviewCurrency);
    return revenueNet === null ? [] : [{ ...point, revenueNet }];
  });
  const campaignDailyUsd = campaignDaily.map((point) => ({
    ...point,
    spend: point.spend === null ? null : toUsd(point.spend, overviewCurrency),
    netRevenue: point.netRevenue === null ? null : toUsd(point.netRevenue, overviewCurrency),
  }));
  const seriesMax = Math.max(...revenueSeries.map((point) => point.revenueNet), 1);
  const seriesPoints = revenueSeries.map((point, index) => `${revenueSeries.length > 1 ? (index / (revenueSeries.length - 1)) * 100 : 50},${40 - (point.revenueNet / seriesMax) * 32}`).join(" ");
  const periodStart = overview?.period.from ? new Date(`${overview.period.from}T00:00:00`).getTime() : 0;
  const periodEnd = overview?.period.to ? new Date(`${overview.period.to}T23:59:59.999`).getTime() : 0;
  const connectedAt = overview?.connectedAt ? new Date(overview.connectedAt).getTime() : 0;
  const connectionIsInPeriod = Boolean(connectedAt && periodEnd >= periodStart && connectedAt >= periodStart && connectedAt <= periodEnd);
  const connectionX = connectionIsInPeriod ? ((connectedAt - periodStart) / Math.max(1, periodEnd - periodStart)) * 100 : 0;

  return (
    <div className="dashboard-home">
      <div className="home-header overview-command-header">
        <div className="home-context"><span className="eyebrow">{t("dashboard.overview")}</span></div>
        <div className="home-controls">
          <label className="home-store-selector">
            <span>{t("dashboard.analyzedStore")}</span>
            <select aria-label={t("dashboard.analyzedStore")} value={selectedStoreId ?? ""} disabled={!stores.length} onChange={(event) => onStoreChange(event.target.value)}>
              {!stores.length && <option value="">{t("dashboard.noStore")}</option>}
              {stores.map((item) => <option key={item.id} value={item.id}>{item.store_name}</option>)}
            </select>
          </label>
          <div className="home-statuses">
            <span className={connected ? "status-positive" : "status-warning"}>{connected ? t("dashboard.connected") : t("dashboard.notConnected")}</span>
          </div>
          <label className="home-period"><span>{t("overview.period")}</span><select aria-label={t("overview.period")} value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}><option value={7}>{t("overview.last7")}</option><option value={30}>{t("overview.last30")}</option><option value={90}>{t("overview.last90")}</option></select></label>
          <button className="btn btn-ghost" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? t("dashboard.refreshing") : t("dashboard.refresh")}</button>
        </div>
      </div>

      <section className="overview-net-hero app-card">
        <div className="overview-net-copy">
          <MetricHelp label={t("overview.netRevenue")} description={t("overview.netRevenueHelp")} />
          <strong>{overview ? formatMoneyInUSD(overview.revenueNet, overviewCurrency) ?? t("overview.metricUnavailable") : t("overview.metricUnavailable")}</strong>
          <span className="overview-trend-badge">{overview?.revenueChangePct === null || overview?.revenueChangePct === undefined ? t("overview.metricUnavailable") : `${overview.revenueChangePct >= 0 ? "+" : ""}${overview.revenueChangePct.toFixed(1)} %`}</span>
        </div>
        <svg className="overview-revenue-chart" viewBox="0 0 100 44" role="img" aria-label={t("overview.netRevenue")}>
          <polyline points={seriesPoints || "0,40 100,40"} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {connectionIsInPeriod ? <line x1={connectionX} x2={connectionX} y1="3" y2="42" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" aria-label={t("overview.connectedAt")}><title>{t("overview.connectedAt")}</title></line> : null}
        </svg>
        {connectionIsInPeriod ? <span className="overview-connection">{t("overview.connectedAt")}</span> : null}
      </section>

      <section className="overview-store-tiles">
        <OverviewMetricTile label={t("overview.sales")} value={overview ? String(overview.sales) : t("overview.metricUnavailable")} badge={overviewHasSales ? t("overview.history") : undefined} help={t("overview.salesHelp")} />
        <OverviewMetricTile label={t("overview.averageBasket")} value={overview?.averageBasket === null || overview?.averageBasket === undefined ? overview?.sales === 0 ? t("overview.noSales") : t("overview.metricUnavailable") : (formatMoneyInUSD(overview.averageBasket, overviewCurrency) ?? t("overview.metricUnavailable"))} badge={overviewHasSales ? t("overview.history") : undefined} help={t("overview.averageBasketHelp")} />
        <OverviewMetricTile label={t("overview.customers")} value={overview ? String(overview.customers) : t("overview.metricUnavailable")} badge={overviewHasSales ? t("overview.history") : undefined} help={t("overview.customersHelp")} />
        <OverviewMetricTile label={t("overview.repeats")} value={overview?.repeatRate === null || overview?.repeatRate === undefined ? overview?.sales === 0 ? t("overview.noSales") : t("overview.metricUnavailable") : `${(overview.repeatRate * 100).toFixed(1)} %`} badge={overviewHasSales ? t("overview.history") : undefined} help={t("overview.repeatsHelp")} />
        <OverviewMetricTile label={t("overview.abandonedCarts")} value={overview ? String(overview.abandoned) : t("overview.metricUnavailable")} badge={overviewHasSales ? t("overview.history") : undefined} help={t("overview.abandonedCartsHelp")} />
      </section>

      <section className="overview-economics"><div className="overview-economics-card app-card"><MetricHelp label={t("overview.customerValue")} description={t("overview.customerValueHelp")} /><strong>{overview?.customerValue === null || overview?.customerValue === undefined ? t("overview.soon") : formatMoneyInUSD(overview.customerValue, overviewCurrency) ?? t("overview.metricUnavailable")}</strong><span className="overview-badge">{overview?.lowData ? t("overview.lowData") : t("overview.history")}</span></div><div className="overview-economics-card app-card"><MetricHelp label={t("overview.maxCostPerCustomer")} description={t("overview.maxCostPerCustomerHelp")} /><strong>{overview?.maxCostPerCustomer === null || overview?.maxCostPerCustomer === undefined ? t("overview.soon") : formatMoneyInUSD(overview.maxCostPerCustomer, overviewCurrency) ?? t("overview.metricUnavailable")}</strong><span className="overview-badge">{Math.round((overview?.targetMargin ?? 0.3) * 100)} %</span></div></section>

      <MetaHistoryOverview account={metaAccount} storeId={selectedStoreId} confirmedSales={overview?.sales ?? 0} maxCostPerCustomer={overview?.maxCostPerCustomer ?? null} storeCurrency={overviewCurrency} onLaunch={onLaunchAd} onRefresh={() => { void refresh(); }} onDaily={setMetaDaily} />
      <OverviewDetails
        currency="USD"
        period={overview?.period ?? null}
        revenueSeries={revenueSeries}
        metaDaily={metaDaily}
        campaignDaily={campaignDailyUsd}
        products={productsForOverview}
        campaigns={performances.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          spend: toUsd(campaign.spend, adsCurrency),
          currency: "USD",
          approximate: adsCurrency.trim().toUpperCase() !== "USD",
          realRoas: campaign.realRoas,
          realSales: campaign.realSales,
          attributionReliable: campaign.attributionReliable,
          decision: campaign.decision,
          suggestedIncrease: campaign.suggestedIncrease,
        }))}
        kpis={{
          visits: overviewAnalytics?.kpis.visits ?? 0,
          sales: overview?.sales ?? 0,
          conversionRate: overviewAnalytics?.kpis.conversionRate ?? t("overview.metricUnavailable"),
        }}
      />

    </div>
  );
}

function HomeKpi({ label, value, help, tone, action }: { label: string; value: string; help: string; tone: string; action?: () => void }) {
  const { t } = useI18n(); return <div className={`home-kpi ${tone}`}><small>{label}</small><strong>{value}</strong><span>{help}</span>{action ? <button className="btn btn-ghost" onClick={action}>{t("finalExtra.text19")}</button> : null}</div>; }

function OverviewMetricTile({ label, value, badge, help }: { label: string; value: string; badge?: string; help: string }) {
  return <div className="overview-store-tile app-card"><MetricHelp label={label} description={help} /><strong>{value}</strong>{badge ? <span className="overview-badge">{badge}</span> : null}</div>;
}

export function MarketRadarView({ onGoToAI }: { onGoToAI: (prompt: string) => void }) {
  const { t , locale } = useI18n();
  const [idea, setIdea] = useState("");
  const [selectedCountries, setSelectedCountries] = useState(["BJ"]);
  const [selectedAudiences, setSelectedAudiences] = useState(["entrepreneurs"]);
  const [format, setFormat] = useState("ebook");
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [audiencesOpen, setAudiencesOpen] = useState(false);
  const countryOptions = [
    ["DZ", t("sweep1.text222")], ["AO", "Angola"], ["BJ", t("sweep2.text223")], ["BW", "Botswana"], ["BF", "Burkina Faso"], ["BI", "Burundi"], ["CV", t("optionsExtra.text26")], ["CM", t("optionsExtra.text27")], ["CF", t("optionsExtra.text28")], ["TD", t("optionsExtra.text29")], ["KM", t("optionsExtra.text30")], ["CG", "Congo"], ["CD", t("optionsExtra.text31")], ["CI", t("sweep3.text224")], ["DJ", "Djibouti"], ["EG", t("optionsExtra.text32")], ["GQ", t("sweep1.text225")], ["ER", t("sweep2.text226")], ["SZ", "Eswatini"], ["ET", t("optionsExtra.text33")], ["GA", "Gabon"], ["GM", t("optionsExtra.text34")], ["GH", "Ghana"], ["GN", t("sweep3.text227")], ["GW", t("sweep1.text228")],
    ["KE", "Kenya"], ["LS", "Lesotho"], ["LR", "Liberia"], ["LY", t("optionsExtra.text35")], ["MG", "Madagascar"], ["MW", "Malawi"], ["ML", "Mali"], ["MR", t("optionsExtra.text36")], ["MU", t("optionsExtra.text37")], ["MA", t("optionsExtra.text38")], ["MZ", "Mozambique"], ["NA", t("optionsExtra.text39")], ["NE", "Niger"], ["NG", "Nigeria"], ["RW", "Rwanda"], ["ST", t("sweep2.text229")], ["SN", t("sweep3.text230")], ["SC", "Seychelles"], ["SL", "Sierra Leone"], ["SO", t("optionsExtra.text40")], ["ZA", t("sweep1.text231")], ["SS", t("sweep2.text232")], ["SD", t("optionsExtra.text41")], ["TZ", t("optionsExtra.text42")], ["TG", "Togo"], ["TN", t("optionsExtra.text43")], ["UG", t("optionsExtra.text44")], ["ZM", t("optionsExtra.text45")], ["ZW", "Zimbabwe"],
  ] as const;
  const audienceOptions = [
    ["entrepreneurs", t("sweep3.text233")], ["jeunes actifs", t("optionsExtra.text46")], ["étudiants", t("optionsExtra.text47")], ["femmes entrepreneures", t("optionsExtra.text48")], ["créateurs de contenu", t("sweep1.text234")], ["vendeurs en ligne", t("optionsExtra.text49")], ["petites entreprises", t("optionsExtra.text50")], ["freelances", t("optionsExtra.text51")], ["parents", "Parents"], ["salariés en reconversion", t("sweep2.text235")], ["coachs et formateurs", t("sweep3.text236")], ["artisans et créateurs", t("sweep1.text237")], ["influenceurs", t("sweep2.text238")], ["expatriés et diaspora", t("sweep3.text239")], ["retraités actifs", t("sweep1.text240")],
  ] as const;
  function toggleCountry(code: string) { setSelectedCountries((selected) => selected.includes(code) ? selected.filter((country) => country !== code) : [...selected, code]); }
  function toggleAudience(value: string) { setSelectedAudiences((selected) => selected.includes(value) ? selected.filter((audience) => audience !== value) : [...selected, value]); }
  function selectedLabels(values: string[], options: readonly (readonly [string, string])[]) { return options.filter(([value]) => values.includes(value)).map(([, label]) => label); }
  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/market/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea, countries: selectedCountries, audiences: selectedAudiences, audience: selectedAudiences.join(", "), format }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Analyse impossible."); return; }
      setReport(data.report ?? null);
    } catch { setError(t("sweep2.text241")); } finally { setLoading(false); }
  }
  const dimensions = (report?.dimensions ?? {}) as Record<string, number>;
  const ideas = Array.isArray(report?.ideas) ? report.ideas as Array<Record<string, unknown>> : [];
  const countryLabels = selectedLabels(selectedCountries, countryOptions);
  const audienceLabels = selectedLabels(selectedAudiences, audienceOptions);
  return <div className="market-radar-page">
    <div className="page-top"><div><h1>{t("radar.eyebrow")}</h1><p>{t("radar.subtitle")}</p></div></div>
    <section className="market-radar-hero"><div><span className="eyebrow">{t("radar.heroEyebrow")}</span><h2>{t("radar.heroTitle")}</h2><p>{t("radar.heroText")}</p><label className="market-idea-input"><span>{t("radar.ideaLabel")}</span><input value={idea} onChange={(event) => setIdea(event.target.value)} placeholder={t("radar.ideaPlaceholder")} /><small className={idea.trim().length > 0 && idea.trim().length < 8 ? "is-invalid" : ""}>{idea.trim().length < 8 ? t("dynamicExtra.ideaMinimum", { count: (idea.trim().length) }) : t("sweep3.text242")}</small></label></div><TrendingUp size={32} /></section>
    <form className="app-card market-radar-form" onSubmit={analyze}>
      <div className="market-radar-fields">
        <div className="market-radar-control">
          <span className="market-radar-control-label">{t("sweep1.text243")}</span>
          <button type="button" className="market-radar-trigger" aria-haspopup="dialog" aria-expanded={countriesOpen} onClick={() => { setCountriesOpen(true); setAudiencesOpen(false); }}><span>{countryLabels.length ? countryLabels.join(", ") : t("sweep2.text244")}</span><small>{selectedCountries.length} {" "}{t("sweep3.text245")}{selectedCountries.length > 1 ? "s" : ""}</small></button>
          {countriesOpen ? <div className="market-radar-modal-backdrop" role="presentation" onMouseDown={() => setCountriesOpen(false)}><section className="market-radar-modal" role="dialog" aria-modal="true" aria-labelledby="market-country-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="market-radar-modal-head"><div><span className="eyebrow">{t("radar.eyebrow")}</span><h2 id="market-country-dialog-title">{t("sweep1.text246")}</h2></div><button type="button" className="market-radar-modal-close" onClick={() => setCountriesOpen(false)} aria-label={t("wizardExtra.close")}>×</button></div><p className="market-radar-modal-help">{t("sweep2.text247")}</p><div className="market-radar-option-grid">{countryOptions.map(([code, name]) => <label key={code} className={selectedCountries.includes(code) ? "selected" : ""}><input type="checkbox" checked={selectedCountries.includes(code)} onChange={() => toggleCountry(code)} /><span>{name}</span></label>)}</div><button type="button" className="btn btn-dark market-radar-modal-confirm" onClick={() => setCountriesOpen(false)}>{t("finalExtra.text20")}{" "}{selectedCountries.length} {" "}{t("finalExtra.text21")}</button></section></div> : null}
        </div>
        <div className="market-radar-control">
          <span className="market-radar-control-label">Audience</span>
          <button type="button" className="market-radar-trigger" aria-haspopup="dialog" aria-expanded={audiencesOpen} onClick={() => { setAudiencesOpen(true); setCountriesOpen(false); }}><span>{audienceLabels.length ? audienceLabels.join(", ") : t("sweep3.text248")}</span><small>{selectedAudiences.length} {" "}{t("sweep1.text249")}{selectedAudiences.length > 1 ? "s" : ""}</small></button>
          {audiencesOpen ? <div className="market-radar-modal-backdrop" role="presentation" onMouseDown={() => setAudiencesOpen(false)}><section className="market-radar-modal" role="dialog" aria-modal="true" aria-labelledby="market-audience-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="market-radar-modal-head"><div><span className="eyebrow">{t("radar.eyebrow")}</span><h2 id="market-audience-dialog-title">{t("sweep2.text250")}</h2></div><button type="button" className="market-radar-modal-close" onClick={() => setAudiencesOpen(false)} aria-label={t("wizardExtra.close")}>×</button></div><p className="market-radar-modal-help">{t("sweep3.text251")}</p><div className="market-radar-option-grid">{audienceOptions.map(([value, label]) => <label key={value} className={selectedAudiences.includes(value) ? "selected" : ""}><input type="checkbox" checked={selectedAudiences.includes(value)} onChange={() => toggleAudience(value)} /><span>{label}</span></label>)}</div><button type="button" className="btn btn-dark market-radar-modal-confirm" onClick={() => setAudiencesOpen(false)}>{t("finalExtra.text20")}{" "}{selectedAudiences.length} audience{selectedAudiences.length > 1 ? "s" : ""}</button></section></div> : null}
        </div>
        <label>Format<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="ebook">E-book</option><option value="formation">{t("finalExtra.text22")}</option><option value="template">Templates</option><option value="abonnement">{t("workspaceExtra.subscription")}</option></select></label>
      </div>
      {error && <p className="store-error">{localizeSystemMessage(error, locale)}</p>}<button className="btn btn-dark" disabled={loading || idea.trim().length < 8 || selectedCountries.length === 0 || selectedAudiences.length === 0}>{loading ? t("sweep1.text252") : t("optionsExtra.text52")}</button>
    </form>
    {report ? <>
      <section className="market-radar-score"><div><span className="eyebrow">{t("sweep2.text253")}</span><strong>{String(report.score ?? 0)}<small>/100</small></strong><p>{t("finalExtra.text23")}{" "}{String(report.confidence ?? "low")} · {Array.isArray(report.liveSources) && report.liveSources.length ? String(report.liveSources.join(", ")) : t("sweep3.text254")}</p></div><div><div className="market-dimension-grid">{[[t("optionsExtra.text63"),"demand"],[t("optionsExtra.text64"),"growth"],[t("optionsExtra.text65"),"competition"],[t("optionsExtra.text66"),"countryFit"],[t("optionsExtra.text67"),"monetization"]].map(([label,key]) => <div key={key}><small>{label}</small><strong>{dimensions[key] ?? 0}</strong><i><b style={{ width: `${dimensions[key] ?? 0}%` }} /></i></div>)}</div><div className="market-trend"><span>{t("sweep1.text255")}</span><strong>{String((report.trend as Record<string, unknown>)?.current ?? 0)} <small>{(report.trend as Record<string, unknown>)?.direction === "up" ? t("optionsExtra.text53") : (report.trend as Record<string, unknown>)?.direction === "down" ? t("optionsExtra.text54") : "→ stable"}</small></strong><div>{((report.trend as Record<string, unknown>)?.points as number[] ?? []).map((point, index) => <i key={`${point}-${index}`} style={{ height: `${Math.max(8, point)}%` }} />)}</div></div></div></section>
      <section className="market-evidence-grid"><div className="app-card"><div className="card-head"><div><span className="eyebrow">{t("finalExtra.text24")}</span><h2>{t("finalExtra.text25")}</h2></div><Activity size={18} /></div>{(report.evidence as Array<Record<string, string>> ?? []).map((item) => <div className="market-evidence" key={`${item.label}-${item.value}`}><small>{item.label}</small><strong>{item.value}</strong></div>)}</div><div className="app-card"><div className="card-head"><div><span className="eyebrow">{t("autopilot.decision")}</span><h2>{t("sweep2.text256")}</h2></div><ShieldAlert size={18} /></div>{(report.risks as string[] ?? []).map((risk) => <p className="market-risk" key={risk}>{risk}</p>)}<p className="market-price">{t("finalExtra.text26")}{" "}{String((report.recommendedPrice as Record<string, unknown>)?.min)} {" "}{t("sweep3.text257")}{" "}{String((report.recommendedPrice as Record<string, unknown>)?.max)} XOF</p></div></section>
      <section className="app-card market-ideas"><div className="card-head"><div><span className="eyebrow">{t("finalExtra.text27")}</span><h2>{t("finalExtra.text28")}</h2></div><Lightbulb size={18} /></div>{ideas.map((item) => <article className="market-idea" key={String(item.title)}><div><h3>{String(item.title)}</h3><p>{String(item.promise)}</p><small>{t("finalExtra.text29")}{" "}{String(item.audience)}</small></div><button className="btn btn-ghost" onClick={() => onGoToAI(t("dynamicExtra.expandIdea", { title: (String(item.title)), countries: (selectedCountries.join(", ")) }))}>{t("sweep1.text258")}</button></article>)}</section>
    </> : <div className="app-card market-empty"><Lightbulb size={24} /><strong>{t("sweep2.text259")}</strong><span>{t("sweep3.text260")}</span></div>}
  </div>;
}
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="home-empty"><strong>{title}</strong><span>{text}</span></div>; }
function ActionItem({ title, proof, action, onClick }: { title: string; proof: string; action: string; onClick: () => void }) { return <div className="home-action-item"><div><strong>{title}</strong><p>{proof}</p></div><button className="btn btn-dark" onClick={onClick}>{action}</button></div>; }
function SummaryTable({ title, columns, rows, empty }: { title: string; columns: string[]; rows: Array<Array<string | number>>; empty: string }) { return <section className="home-summary app-card"><div className="card-head"><h2>{title}</h2><BarChart3 size={18} /></div>{rows.length ? <div className="home-table"><div className="home-table-row home-table-head">{columns.map((column) => <span key={column}>{column}</span>)}</div>{rows.map((row, index) => <div className="home-table-row" key={index}>{row.map((value, valueIndex) => <span key={valueIndex}>{value}</span>)}</div>)}</div> : <EmptyState title={empty} text="Les données apparaîtront après synchronisation." />}</section>; }

function SalesView({ stores, analytics }: { stores: StoreData[]; analytics: AnalyticsData }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("all");
  const allSales = analytics?.sales ?? [];
  const sales = allSales.filter((sale) => {
    const status = String((sale as Record<string, unknown>)?.status ?? (sale as Record<string, unknown>)?.state ?? "");
    if (filter === "all") return true;
    if (filter === "completed") return status === "completed" || status === "settled";
    return status === filter;
  });
  const revenueByCurrency = analytics?.kpis.revenueByCurrency ?? [];
  const revenueLabel = revenueByCurrency.length
    ? formatUsdTotal(revenueByCurrency.map((item) => ({ amount: item.value, currency: item.currency }))) ?? t("overview.usdUnavailable")
    : formatMoneyInUSD(numericAmount(analytics?.kpis.revenue.value), analytics?.products?.[0]?.currency ?? "XOF") ?? t("overview.usdUnavailable");
  const confirmedCount = analytics?.kpis.sales ?? allSales.filter((sale) => {
    const status = String((sale as Record<string, unknown>)?.status ?? (sale as Record<string, unknown>)?.state ?? "");
    return status === "completed" || status === "settled";
  }).length;
  return <div className="sales-page"><div className="page-top"><div><span className="eyebrow">Chariow</span><h1>{t("dashboard.sales")}</h1><p>{t("sweep1.text261")}</p></div></div><div className="sales-kpis"><HomeKpi label={t("sweep2.text262")} value={String(confirmedCount)} tone="positive" help="Paiements validés par Chariow, statuts completed et settled." /><HomeKpi label={t("overview.grossRevenueUsd")} value={revenueLabel} tone="info" help={t("overview.usdConversionNote")} /><HomeKpi label={t("sweep3.text263")} value={String(sales.length)} tone="neutral" help="Événements Chariow récupérés pour cette boutique." /></div><div className="sales-toolbar"><label>{t("adminComplete.status")}<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t("adminComplete.all")}</option><option value="completed">{t("sweep1.text264")}</option><option value="awaiting_payment">{t("adminComplete.pending")}</option><option value="failed">{t("sweep2.text265")}</option><option value="abandoned">{t("sweep3.text266")}</option><option value="refunded">{t("sweep1.text267")}</option></select></label></div><section className="app-card sales-list"><div className="card-head"><h2>{t("sweep2.text268")}</h2><Activity size={18} /></div>{sales.length ? <ul className="activity">{sales.map((sale, index) => <RecentSale key={index} sale={sale} />)}</ul> : <EmptyState title={t("sweep3.text269")} text="Les événements Chariow apparaîtront après synchronisation." />}</section></div>;
}

const STACK_DAYS = 7;
const STACK_COLORS = ["#4c21f6", "#029bfc", "#43a765", "#f5a524"];
const STACK_OTHERS_COLOR = "#94a3b8";
const stackCompact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
type StackSeries = { key: string; label: string; color: string };
function stackRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stackDayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function stackSaleDay(raw: unknown): string | null { if (typeof raw !== "string" || !raw) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const date = new Date(raw); return Number.isNaN(date.getTime()) ? null : stackDayKey(date); }
function stackAmount(raw: unknown): number { const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>).value : raw; const parsed = typeof source === "number" ? source : typeof source === "string" ? Number(source.replace(/[^\d.,-]/g, "").replace(",", ".")) : 0; return Number.isFinite(parsed) ? parsed : 0; }
function stackScale(maxValue: number) { const rough = Math.max(maxValue, 1) / 4; const magnitude = 10 ** Math.floor(Math.log10(rough)); const residual = rough / magnitude; const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10; const step = factor * magnitude; return { step, max: Math.ceil(Math.max(maxValue, 1) / step) * step }; }
function RealTrendChart({ sales, products, currency, revenueCurrencies = [] }: { sales: unknown[]; products: Array<{ id: string; name: string }>; currency: string; revenueCurrencies?: string[] }) {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null); const rootRef = useRef<HTMLDivElement>(null);
  const observedCurrencies = new Set(sales.filter((item) => { const row = stackRecord(item); const status = row.status ?? row.state; return status === "completed" || status === "settled"; }).map((item) => { const row = stackRecord(item); const amount = stackRecord(row.amount); return String(row.currency ?? amount.currency ?? "").trim().toUpperCase(); }).filter(Boolean));
  const allCurrencySignals = revenueCurrencies.length ? new Set(revenueCurrencies.map((value) => value.toUpperCase())) : observedCurrencies;
  const hasUnknownCurrency = allCurrencySignals.has("UNKNOWN") || sales.some((item) => { const row = stackRecord(item); const status = row.status ?? row.state; if (status !== "completed" && status !== "settled") return false; const amount = stackRecord(row.amount); return !String(row.currency ?? amount.currency ?? "").trim(); });
  const chartCurrency = allCurrencySignals.size === 1 ? [...allCurrencySignals][0] : currency;
  useEffect(() => { const close = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setActive(null); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, []);
  const chart = useMemo(() => {
    const days = Array.from({ length: STACK_DAYS }, (_, index) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (STACK_DAYS - 1 - index)); return { key: stackDayKey(date), weekday: date.toLocaleDateString("fr-FR", { weekday: "short" }), num: String(date.getDate()), long: date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) }; });
    const dayIndex = new Map(days.map((day, index) => [day.key, index] as const)); const names = new Map(products.map((product) => [String(product.id), product.name] as const)); const perProduct = new Map<string, { label: string; total: number; days: number[] }>();
    for (const item of sales) { const row = stackRecord(item); const status = row.status ?? row.state; if (status !== "completed" && status !== "settled") continue; const index = stackSaleDay(row.created_at ?? row.createdAt ?? row.occurred_at); const dayPos = index ? dayIndex.get(index) : undefined; if (dayPos === undefined) continue; const product = stackRecord(row.product); const rawId = row.product_id ?? product.id ?? product.uuid; const id = rawId === undefined || rawId === null ? "" : String(rawId); const label = (id && names.get(id)) || String(row.product_name ?? product.name ?? product.title ?? "") || "Produit"; const key = id || label; const amount = stackAmount(row.amount); const entry = perProduct.get(key) ?? { label, total: 0, days: new Array<number>(STACK_DAYS).fill(0) }; entry.days[dayPos] += amount; entry.total += amount; perProduct.set(key, entry); }
    const ranked = Array.from(perProduct.entries()).sort((a, b) => b[1].total - a[1].total); const top = ranked.slice(0, STACK_COLORS.length); const rest = ranked.slice(STACK_COLORS.length); const series: StackSeries[] = top.map(([key, entry], index) => ({ key, label: entry.label, color: STACK_COLORS[index] })); const matrix: number[][] = days.map((_, dayPos) => top.map(([, entry]) => entry.days[dayPos])); if (rest.length) { series.push({ key: "__others", label: "Autres", color: STACK_OTHERS_COLOR }); matrix.forEach((row, dayPos) => row.push(rest.reduce((sum, [, entry]) => sum + entry.days[dayPos], 0))); } const dayTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0)); const grand = dayTotals.reduce((sum, value) => sum + value, 0); const scale = stackScale(Math.max(...dayTotals)); const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step); return { days, series, matrix, dayTotals, grand, scale, ticks };
  }, [sales, products]);
  const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} ${chartCurrency}`;
  if (allCurrencySignals.size > 1 || hasUnknownCurrency) return <EmptyState title={t("analysisExtra.chart.incomparable")} text="Les ventes utilisent plusieurs devises ou n’indiquent pas leur monnaie. Les montants restent séparés dans les indicateurs." />;
  if (!chart.grand) return <EmptyState title={t("sweep1.text270")} text="Les ventes confirmées des 7 derniers jours apparaîtront ici, empilées par produit." />;
  return <div className="stack-chart" ref={rootRef} role="group" aria-label={t("dynamicExtra.revenueChart", { total: (money(chart.grand)) })}><ul className="stack-legend">{chart.series.map((item) => <li key={item.key}><i style={{ background: item.color }} /><span>{item.label}</span></li>)}</ul><div className="stack-body"><div className="stack-y" aria-hidden="true">{chart.ticks.map((tick) => <span key={tick} style={{ bottom: `${(tick / chart.scale.max) * 100}%` }}>{stackCompact.format(tick)}</span>)}</div><div className="stack-plot">{chart.ticks.map((tick) => <i key={tick} className="stack-grid" aria-hidden="true" style={{ bottom: `${(tick / chart.scale.max) * 100}%` }} />)}<div className="stack-cols">{chart.days.map((day, index) => { const total = chart.dayTotals[index]; return <button type="button" key={day.key} className={`stack-col${active === index ? " active" : ""}`} aria-label={`${day.long} : ${money(total)}`} onPointerEnter={(event) => { if (event.pointerType === "mouse") setActive(index); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setActive(null); }} onClick={(event) => { if ((event.nativeEvent as PointerEvent).pointerType === "mouse") return; setActive((current) => current === index ? null : index); }}><span className="stack-bar" style={{ height: `${(total / chart.scale.max) * 100}%` }}>{chart.series.map((item, seriesIndex) => { const value = chart.matrix[index][seriesIndex]; return value > 0 ? <span key={item.key} className="stack-seg" style={{ height: `${(value / total) * 100}%`, background: item.color }} /> : null; })}</span></button>; })}</div>{active !== null ? <div className="stack-tip" style={{ left: `${((active + 0.5) / STACK_DAYS) * 100}%`, transform: `translateX(${active <= 1 ? "-20%" : active >= STACK_DAYS - 2 ? "-80%" : "-50%"})` }}><strong>{chart.days[active].long}</strong>{chart.dayTotals[active] > 0 ? <>{chart.series.map((item, seriesIndex) => { const value = chart.matrix[active][seriesIndex]; return value > 0 ? <span key={item.key}><i style={{ background: item.color }} />{item.label}<b>{money(value)}</b></span> : null; })}<em>Total {money(chart.dayTotals[active])}</em></> : <span>{t("analysisExtra.chart.noSales")}</span>}</div> : null}</div></div><div className="stack-x" aria-hidden="true">{chart.days.map((day) => <span key={day.key}><b>{day.weekday}</b><small>{day.num}</small></span>)}</div><div className="stack-foot"><span className="stack-unit">{t("finalExtra.text30")}{" "}{chartCurrency}</span><span className="chart-total">{t("finalExtra.text31")}{" "}{money(chart.grand)}</span></div></div>;
}

function displayValue(value: unknown, keys: string[] = ["name", "label", "title", "value", "text", "code"]): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => displayValue(item)).filter(Boolean).join(", ") || undefined;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of keys) {
      const result = displayValue(object[key]);
      if (result) return result;
    }
    return Object.values(object).map((item) => displayValue(item)).filter(Boolean).join(" · ") || undefined;
  }
  return undefined;
}

function RecentSale({ sale }: { sale: unknown }) {
  const { t } = useI18n();
  const rec = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const row = rec(sale);
  const status = String(row.status ?? row.state ?? "unknown");
  const labels: Record<string, string> = { completed: t("sweep2.text271"), settled: t("sweep3.text272"), awaiting_payment: t("optionsExtra.text55"), failed: t("sweep3.text188"), abandoned: t("sweep1.text273"), refunded: t("optionsExtra.text56") };
  const amountRecord = rec(row.amount);
  const amount = Number(amountRecord.value ?? row.amount);
  const currency = String(row.currency ?? amountRecord.currency ?? "-");
  const productName = String(row.product_name ?? rec(row.product).name ?? "-");
  const date = row.created_at ?? row.createdAt ?? row.occurred_at;
  const amountLabel = Number.isFinite(amount) ? formatMoneyInUSD(amount, currency) ?? t("overview.usdUnavailable") : t("overview.metricUnavailable");
  const dateLabel = date ? new Date(String(date)).toLocaleDateString("fr-FR") : "-";
  return <li><i className={`activity-dot activity-${status}`} /><span><b>{labels[status] ?? status}</b><br />{productName} · {amountLabel} · {dateLabel}</span></li>;
}
function BusinessSignals({ analytics, health }: { analytics: AnalyticsData; health: StoreHealth }) {
  const { t } = useI18n();
  if (!analytics) return null;
  const { kpis, products } = analytics;
  const alerts = getBusinessAlerts(analytics);
  const recommendation = getRecommendation(analytics);
  return <div className="business-signals">
    <div className="signal-health app-card">
      <div className="card-head"><div><span className="eyebrow">{t("finalExtra.text32")}</span><h2>{t("sweep2.text274")}</h2></div><Activity size={18} color="#34684d" /></div>
      <div className="health-score"><strong>{health.score}</strong><span>/ 100</span></div>
      <p>{health.label}</p>
      <div className="health-progress"><i style={{ width: `${health.score}%` }} /></div>
      <small>{health.details}</small>
    </div>
    <div className="signal-alerts app-card">
      <div className="card-head"><div><span className="eyebrow">{t("overview.watch")}</span><h2>{t("finalExtra.text33")}</h2></div><AlertTriangle size={18} color="#d28b3d" /></div>
      {alerts.length ? <div className="signal-list">{alerts.map((alert) => <div className={`signal-item ${alert.tone}`} key={alert.title}><span>{alert.icon}</span><div><strong>{alert.title}</strong><p>{alert.description}</p></div></div>)}</div> : <div className="signal-item positive"><span><TrendingUp size={15} /></span><div><strong>{t("sweep3.text275")}</strong><p>{t("sweep1.text276")}</p></div></div>}
      <PersistentAlerts />
    </div>
    <div className="signal-action app-card"><div className="card-head"><div><span className="eyebrow">{t("chat.qNext")}</span><h2>{t("finalExtra.text34")}</h2></div><Target size={18} color="#34684d" /></div><strong>{recommendation.title}</strong><p>{recommendation.description}</p><div className="signal-meta">{products.length} {" "}{t("sweep2.text277")}{products.length > 1 ? "s" : ""} · {kpis.sales} {" "}{t("analysisExtra.saleOne")}{kpis.sales > 1 ? "s" : ""} · {kpis.visits} {" "}{t("finalExtra.text35")}{kpis.visits > 1 ? "s" : ""}</div></div>
  </div>;
}

function PersistentAlerts() {
  const [alerts, setAlerts] = useState<Array<{ id: string; severity: string; title: string; description: string; status: string }>>([]);
  useEffect(() => { void fetch("/api/alerts").then((response) => response.ok ? response.json() : { alerts: [] }).then((data) => setAlerts(data.alerts ?? [])); }, []);
  if (!alerts.length) return null;
  return <div className="signal-list" style={{ marginTop: 12 }}>{alerts.slice(0, 3).map((alert) => <div className={`signal-item ${alert.severity}`} key={alert.id}><span><AlertTriangle size={15} /></span><div><strong>{alert.title}</strong><p>{alert.description}</p></div></div>)}</div>;
}

type StoreHealth = { score: number; label: string; details: string };

function getStoreHealth(analytics: AnalyticsData, t: ReturnType<typeof useI18n>["t"]): StoreHealth {
  if (!analytics) return { score: 0, label: t("dynamicExtra.healthUnavailable"), details: t("dynamicExtra.healthReconnect") };
  const { kpis, products } = analytics;
  let score = 35;
  if (products.length > 0) score += 20;
  if (kpis.visits > 0) score += 15;
  if (kpis.sales > 0) score += 20;
  if (kpis.customers > 0) score += 5;
  if (kpis.conversionRate !== "0 %") score += 5;
  const bounded = Math.min(score, 100);
  return { score: bounded, label: bounded >= 75 ? t("dynamicExtra.healthStrong") : bounded >= 50 ? t("dynamicExtra.healthDevelop") : t("dynamicExtra.healthStart"), details: t("dynamicExtra.catalogSummary", { products: (products.length), productPlural: (products.length > 1 ? "s" : ""), visits: (kpis.visits), visitPlural: (kpis.visits > 1 ? "s" : ""), sales: (kpis.sales), salePlural: (kpis.sales > 1 ? "s" : "") }) };
}

function getBusinessAlerts(analytics: AnalyticsData) {
  if (!analytics) return [];
  const { kpis, products } = analytics;
  const alerts: { title: string; description: string; tone: string; icon: React.ReactNode }[] = [];
  if (!products.length) alerts.push({ title: "Ton catalogue est vide", description: "Ajoute un produit pour commencer à mesurer ta boutique.", tone: "warning", icon: <Package size={15} /> });
  if (kpis.visits > 0 && kpis.sales === 0) alerts.push({ title: "Trafic sans vente", description: "Tes visiteurs ne convertissent pas encore. Travaille l'offre ou la page de vente.", tone: "warning", icon: <Eye size={15} /> });
  if (kpis.visits === 0) alerts.push({ title: "Aucune visite enregistrée", description: "Partage ta boutique auprès d'une audience ciblée pour créer tes premiers signaux.", tone: "neutral", icon: <Eye size={15} /> });
  if (kpis.sales === 0 && kpis.customers === 0) alerts.push({ title: "Pas encore de clients", description: "Commence par promouvoir ton produit principal avec un message clair et une offre simple.", tone: "neutral", icon: <Users size={15} /> });
  return alerts.slice(0, 3);
}

function getRecommendation(analytics: AnalyticsData) {
  if (!analytics) return { title: "Reconnecter ta boutique", description: "Les données sont nécessaires pour proposer une action utile." };
  const { kpis, products } = analytics;
  if (!products.length) return { title: "Ajouter ton premier produit", description: "Sans produit dans le catalogue, Vendeo ne peut pas identifier ton meilleur levier commercial." };
  if (kpis.visits === 0) return { title: "Créer du trafic qualifié", description: "Partage ton produit auprès d'une audience précise et suis les visites sur la prochaine période." };
  if (kpis.sales === 0) return { title: "Améliorer la conversion", description: "Tes prochaines actions doivent rassurer les visiteurs : bénéfice clair, preuve sociale et appel à l'action visible." };
  return { title: "Capitaliser sur tes ventes", description: "Analyse ton produit principal et teste une offre complémentaire pour augmenter la valeur de chaque client." };
}

function ProductCatalog({ products, onPromote }: { products: ProductData[]; onPromote?: (product: ProductData) => void }) {
  const { t } = useI18n();
  return (
    <div className="app-card" style={{ marginTop: 18 }}>
      <div className="card-head"><div><h2>{t("finalExtra.text36")}</h2><p>{products.length ? t("sweep3.text278") : t("sweep1.text279")}</p></div></div>
      {products.length > 0 && <div style={{ display: "grid", gap: 10, marginTop: 15 }}>
        {products.map((product) => <div key={product.id} className="store-row">
          <div className="store-logo">{product.image ? <img src={product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : <Package size={18} />}</div>
          <div className="store-info"><strong>{product.name}</strong><span>{formatProductPrice(product)}</span></div>
           <span className="status">{product.status ?? "Statut non renseigné"}</span>
           {onPromote ? <button className="btn btn-dark" type="button" onClick={() => onPromote(product)}>{t("finalExtra.text37")}</button> : null}
        </div>)}
      </div>}
    </div>
  );
}

export function Reports({ stores, analytics, selectedStoreId }: { stores: StoreData[]; analytics: AnalyticsData; selectedStoreId: string | null }) {
  const { t , locale } = useI18n();
  // Date par défaut alignée sur celle du backend (lib/chariow/analytics.ts) :
  // du 1er du mois en cours jusqu'à aujourd'hui, tant que l'utilisateur n'a
  // rien choisi lui-même.
  const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(analytics?.kpis.period.from || defaultFrom);
  const [to, setTo] = useState(analytics?.kpis.period.to || defaultTo);

  // Les Rapports ont leur propre jeu de données Chariow, réellement filtré par
  // la période choisie (le bouton "Actualiser" appelait auparavant rien du
  // tout : la période affichée à l'écran ne changeait jamais). On part des
  // données déjà chargées par le tableau de bord, puis on ré-interroge
  // /api/analytics avec from/to dès que l'utilisateur clique sur Actualiser.
  const [reportAnalytics, setReportAnalytics] = useState<AnalyticsData>(analytics);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const kpis = reportAnalytics?.kpis;
  const period = from && to ? `${formatReportDate(from)} – ${formatReportDate(to)}` : t("sweep2.text280");
  const currency = reportAnalytics?.products?.[0]?.currency ?? "XOF";
  const reportRevenueCurrencies = kpis?.revenueByCurrency ?? [];
  const reportRevenueLabel = (reportRevenueCurrencies.length
    ? formatUsdTotal(reportRevenueCurrencies.map((item) => ({ amount: item.value, currency: item.currency })))
    : formatMoneyInUSD(numericAmount(kpis?.revenue.value), currency)) ?? t("overview.usdUnavailable");

  async function runReport(nextFrom: string, nextTo: string) {
    if (!selectedStoreId) { setReportError(t("sweep3.text281")); return; }
    setLoadingReport(true);
    setReportError(null);
    try {
      const params = new URLSearchParams({ store_id: selectedStoreId });
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
      const response = await fetch(`/api/analytics?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReportError(data.error ?? "Impossible de charger le rapport pour cette période.");
        return;
      }
      setReportAnalytics(data.snapshot ?? null);
    } catch {
      setReportError(t("sweep1.text282"));
    } finally {
      setLoadingReport(false);
    }
  }

  // Si la boutique analysée change ailleurs dans l'app, on revient à la
  // période par défaut et on recharge un rapport frais pour cette boutique.
  useEffect(() => {
    if (!selectedStoreId) return;
    setFrom(defaultFrom);
    setTo(defaultTo);
    void runReport(defaultFrom, defaultTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  return <>
    <div className="page-top"><div><span className="eyebrow">{t("finalExtra.text38")}</span><h1>{t("workspaceExtra.reports")}</h1><p>{t("sweep2.text283")}</p></div></div>
    <div className="app-card report-filters" style={{ marginBottom: 18 }}>
      <div className="report-filter-title"><CalendarDays size={17} /><div><strong>{t("sweep3.text284")}</strong><span>{t("sweep1.text285")}</span></div></div>
      <div className="report-filter-fields">
        <label>{t("finalExtra.text39")}<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>{t("finalExtra.text40")}<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
        <button type="button" className="btn btn-dark" disabled={!stores.length || !selectedStoreId || loadingReport} onClick={() => void runReport(from, to)}>{loadingReport ? t("adminExtra.admin.refreshing") : t("adminExtra.admin.refresh")}</button>
      </div>
      {reportError ? <p className="store-error" role="alert" style={{ marginTop: 10 }}>{localizeSystemMessage(reportError, locale)}</p> : null}
    </div>
    {!reportAnalytics || !kpis ? <div className="empty-state">{loadingReport ? t("sweep2.text286") : t("sweep3.text287")}</div> : <>
      <div className="report-summary">
        <div className="report-summary-main"><span className="eyebrow">{t("finalExtra.text41")}</span><strong>{reportRevenueLabel}</strong><p>{t("sweep1.text288")}{" "}{period}.</p></div>
        <div className="report-summary-side"><ReportStat icon={<ShoppingBag size={16} />} label={t("dashboard.sales")} value={kpis.sales} /><ReportStat icon={<Eye size={16} />} label={t("adminComplete.visits")} value={kpis.visits} /><ReportStat icon={<Users size={16} />} label={t("overview.customers")} value={kpis.customers} /><ReportStat icon={<BarChart3 size={16} />} label="Conversion" value={kpis.conversionRate} /></div>
      </div>

      <div className="report-columns">
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">{t("sweep2.text289")}</span><h2>{t("sweep3.text290")}</h2></div><strong>{reportAnalytics.products.length} {" "}{t("sweep2.text277")}{reportAnalytics.products.length > 1 ? "s" : ""}</strong></div>{reportAnalytics.products.length === 0 ? <p className="report-muted">{t("sweep1.text291")}</p> : <div className="report-table"><div className="report-table-head"><span>{t("wizardExtra.step.product")}</span><span>{t("adminComplete.status")}</span><span>{t("dashboard.sales")}</span></div>{reportAnalytics.products.map((product) => <div className="report-table-row" key={product.id}><div className="report-product"><span className="report-product-icon">{product.image ? <img src={product.image} alt="" /> : <Package size={16} />}</span><span><strong title={product.name}>{product.name}</strong><small>{formatProductPrice(product)}</small></span></div><span className="report-status">{product.status ?? "Non renseigné"}</span><strong>{product.sales ?? 0}</strong></div>)}</div>}</section>
      </div>

    </>}
  </>;
}

const CONNECTED_ACCOUNT_PLATFORMS: Array<{ id: "meta" | "tiktok" | "pinterest"; label: string; description: string; badge: AdPlatform; live: boolean }> = [
  { id: "meta", label: "Meta (Facebook & Instagram)", description: "Diffuse tes campagnes sur Facebook et Instagram.", badge: "facebook", live: true },
  { id: "tiktok", label: "TikTok", description: "Diffuse tes campagnes sur TikTok Ads.", badge: "tiktok", live: true },
  { id: "pinterest", label: "Pinterest", description: "Diffuse tes campagnes sur Pinterest Ads.", badge: "pinterest", live: true },
];

type SettingsTab = "accounts" | "channels" | "appearance" | "language" | "feedback" | "about" | "session";

export function MobileSettingsView({ onNavigate, onSignOut, plan, focus }: { onNavigate: (section: string) => void; onSignOut: () => void; plan: PlanId; focus?: SettingsTab | "preferences" }) {
  const connectionCache = useNavigationCache();
  const { locale, setLocale, t } = useI18n();
  const [mobileSettingsSection, setMobileSettingsSection] = useState<SettingsTab | null>(focus === "preferences" ? "appearance" : focus ?? null);
  const [settingsSearch, setSettingsSearch] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [metaConnected, setMetaConnected] = useState(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [pinterestConnected, setPinterestConnected] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    setMobileSettingsSection(focus === "preferences" ? "appearance" : focus ?? null);
  }, [focus]);

  useEffect(() => {
    let active = true;
    async function loadConnections() {
      setLoadingAccounts(true);
      setConnectionError(null);
      try {
        const [metaResponse, tiktokResponse, pinterestResponse] = await Promise.all([
          fetch("/api/integrations/meta/accounts"),
          fetch("/api/integrations/tiktok/accounts"),
          fetch("/api/integrations/pinterest/accounts"),
        ]);
        const metaData = metaResponse.ok ? await metaResponse.json().catch(() => ({})) : {};
        const tiktokData = tiktokResponse.ok ? await tiktokResponse.json().catch(() => ({})) : {};
        const pinterestData = pinterestResponse.ok ? await pinterestResponse.json().catch(() => ({})) : {};
        if (!active) return;
        setMetaConnected((metaData.accounts ?? []).length > 0);
        setTiktokConnected((tiktokData.accounts ?? []).length > 0);
        setPinterestConnected((pinterestData.accounts ?? []).length > 0);
      } catch {
        if (active) setConnectionError(t("sweep2.text292"));
      } finally {
        if (active) setLoadingAccounts(false);
      }
    }
    if (mobileSettingsSection === "channels") void loadConnections();
    return () => {
      active = false;
    };
  }, [mobileSettingsSection]);

  function connectAccount(platform: "meta" | "tiktok" | "pinterest") {
    window.location.href = `/api/integrations/${platform}/connect`;
  }

  async function disconnectAccount(platform: "meta" | "tiktok" | "pinterest") {
    setConnectionBusy(platform);
    setConnectionError(null);
    try {
      const response = await fetch(`/api/integrations/${platform}/disconnect`, { method: "POST" });
      if (!response.ok) {
        setConnectionError(t("sweep2.text292"));
        return;
      }
      connectionCache.clear();
      if (platform === "meta") setMetaConnected(false);
      else if (platform === "tiktok") setTiktokConnected(false);
      else setPinterestConnected(false);
    } catch {
      setConnectionError(t("sweep2.text292"));
    } finally {
      setConnectionBusy(null);
    }
  }

  async function deleteAccount() {
    setDeletingAccount(true); setAccountMessage(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAccountMessage(data.error ?? "Impossible de supprimer le compte.");
        return;
      }
      window.location.href = "/?account=deleted";
    } catch {
      setAccountMessage(t("optionsExtra.text57"));
    } finally {
      setDeletingAccount(false);
    }
  }

  const settingsGroups: Array<{ title: string; items: Array<{ id: string; title: string; description: string; keywords: string; icon: React.ReactNode; onSelect: () => void }> }> = [
    {
      title: t("settings.appSection"),
      items: [
        { id: "appearance", title: t("settings.appearance"), description: t("settings.themeDescription"), keywords: "theme couleur clair sombre", icon: <Sun size={18} />, onSelect: () => setMobileSettingsSection("appearance") },
        { id: "language", title: t("settings.language.title"), description: t("settings.language.subtitle"), keywords: "langue français anglais language", icon: <Languages size={18} />, onSelect: () => setMobileSettingsSection("language") },
        { id: "notifications", title: t("notifications.title"), description: t("notifications.description"), keywords: "push alertes notifications", icon: <Bell size={18} />, onSelect: () => onNavigate("Notifications") },
        { id: "feedback", title: t("sweep3.text293"), description: t("settings.feedbackDescription"), keywords: "suggestion avis feedback notes", icon: <MessageSquare size={18} />, onSelect: () => setMobileSettingsSection("feedback") },
        { id: "about", title: t("settings.aboutLegal"), description: t("settings.aboutDescription"), keywords: "à propos légal conditions confidentialité about legal", icon: <Lightbulb size={18} />, onSelect: () => setMobileSettingsSection("about") },
        { id: "session", title: t("settings.session"), description: t("settings.leaveOrDelete"), keywords: "déconnexion supprimer compte session sign out delete", icon: <LogOut size={18} />, onSelect: () => setMobileSettingsSection("session") },
      ],
    },
    {
      title: t("settings.shopSection"),
      items: [
        { id: "stores", title: t("settings.myStores"), description: t("settings.manageStores"), keywords: "boutique boutiques chariow stores", icon: <Store size={18} />, onSelect: () => onNavigate("Mes boutiques") },
        { id: "channels", title: t("settings.connectedAccounts"), description: t("settings.connectedAccountsDescription"), keywords: "comptes publicitaires meta tiktok pinterest ads", icon: <ExternalLink size={18} />, onSelect: () => setMobileSettingsSection("channels") },
        { id: "subscription", title: t("settings.subscription"), description: t("settings.manageSubscription"), keywords: "abonnement plan offre paiement subscription billing", icon: <CreditCard size={18} />, onSelect: () => onNavigate("Abonnement") },
      ],
    },
  ];
  const normalizeSearch = (value: string) => value.toLocaleLowerCase(locale).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const query = normalizeSearch(settingsSearch.trim());
  const filteredSettingsGroups = settingsGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !query || normalizeSearch(`${item.title} ${item.description} ${item.keywords} ${group.title}`).includes(query)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="settings-page" data-mobile-settings-section={mobileSettingsSection ?? "index"}>
      <div className="page-top settings-head">
        <div>
          <span className="eyebrow">{t("settings.account")}</span>
          <h1 id="settings-title">{t("settings.title")}</h1>
          <p>{t("settings.preferencesSubtitle")}</p>
        </div>
      </div>
      {mobileSettingsSection === null ? (
        <section className="settings-index" aria-label={t("settings.sectionsLabel")}>
          <label className="settings-search" data-onboarding="settings-index-search">
            <Search size={20} aria-hidden="true" />
            <input type="search" value={settingsSearch} onChange={(event) => setSettingsSearch(event.target.value)} placeholder={t("settings.searchPlaceholder")} aria-label={t("settings.searchPlaceholder")} />
          </label>
          {filteredSettingsGroups.length ? filteredSettingsGroups.map((group) => (
            <section className="settings-group" key={group.title} aria-label={group.title}>
              <h2>{group.title}</h2>
              <div className="settings-option-list">
                {group.items.map((item) => <button type="button" className="settings-option-row" key={item.id} onClick={item.onSelect}>
                  <span className="settings-option-icon" aria-hidden="true">{item.icon}</span>
                  <span className="settings-option-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>)}
              </div>
            </section>
          )) : <p className="settings-search-empty" role="status">{t("settings.searchEmpty")}</p>}
        </section>
      ) : (
      <>
      <button type="button" className="settings-detail-back mobile-back-button" onClick={() => { setMobileSettingsSection(null); if (focus) onNavigate("Paramètres"); }}><ArrowLeft size={16} /> {t("settings.backToSettings")}</button>
      <div className="settings-detail-panel" role="region" id={`settings-panel-${mobileSettingsSection}`} aria-labelledby="settings-title" tabIndex={0}>
      {mobileSettingsSection === "accounts" && <section className="settings-section settings-section-account" data-settings-panel="accounts" aria-label={t("settings.storesAndSubscription")}>
        <div className="mobile-settings-grid">
          <button type="button" className="mobile-settings-card" onClick={() => onNavigate("Mes boutiques")}>
            <span className="mobile-settings-icon"><Store size={20} /></span>
            <span><strong>{t("settings.myStores")}</strong><small>{t("settings.manageStores")}</small></span>
            <ArrowRight size={16} />
          </button>
          <button type="button" className="mobile-settings-card" onClick={() => onNavigate("Abonnement")}>
            <span className="mobile-settings-icon"><CreditCard size={20} /></span>
            <span><strong>{t("settings.subscription")}</strong><small>{t("settings.manageSubscription")}</small></span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>}
      {mobileSettingsSection === "session" && <section className="settings-section settings-section-session" data-settings-panel="session" aria-label={t("sweep2.text295")}>
        <div className="page-top settings-mobile-only">
          <div>
            <span className="eyebrow">{t("settings.session")}</span>
            <h2>{t("settings.signoutDelete")}</h2>
            <p>{t("settings.leaveOrDelete")}</p>
          </div>
        </div>
        <div className="mobile-settings-grid settings-session-grid">
          <button type="button" className="mobile-settings-card mobile-settings-danger" onClick={onSignOut}>
            <span className="mobile-settings-icon"><LogOut size={20} /></span>
            <span><strong>{t("settings.signout")}</strong><small>{t("settings.signoutDescription")}</small></span>
            <ArrowRight size={16} />
          </button>
          {accountMessage ? <p className="settings-inline-message settings-account-error" role="alert">{accountMessage}</p> : null}
          <button type="button" className="mobile-settings-card mobile-settings-danger settings-delete-account" onClick={() => setShowDeleteAccountModal(true)} disabled={deletingAccount}>
            <span className="mobile-settings-icon"><Trash2 size={20} /></span>
            <span><strong>{deletingAccount ? t("settings.deleteAccount") + "…" : t("settings.deleteAccount")}</strong><small>{t("settings.deleteDescription")}</small></span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>}
      {mobileSettingsSection === "appearance" && <section className="settings-section settings-section-theme settings-section-language" data-settings-panel="appearance" aria-label={t("settings.appearance")}>
        <div className="page-top settings-section-head">
          <div>
            <span className="eyebrow">{t("settings.appearance")}</span>
            <h2>{t("settings.theme")}</h2>
            <p>{locale === "en" ? "One carefully designed palette across your workspace." : "Une seule palette soignée pour toute ton interface."}</p>
          </div>
        </div>
        <div className="theme-choice-grid">
          <div className="theme-choice selected" aria-label={t("sweep3.text296")}>
            <span className="mobile-settings-icon"><Sun size={20} /></span>
            <span><strong>{locale === "en" ? "Vendeo Light" : "Vendeo Clair"}</strong><small>{locale === "en" ? "A consistent, comfortable workspace." : "Un espace de travail unifié, clair et confortable."}</small></span>
            <CheckCircle2 size={16} />
          </div>
        </div>
      </section>}
      {mobileSettingsSection === "language" && <section className="settings-section settings-language-extra" data-settings-panel="language" aria-label={t("settings.language.title")}>
        <div className="page-top settings-section-head">
          <div>
            <h2>{t("settings.language.title")}</h2>
            <p>{t("settings.language.subtitle")}</p>
          </div>
        </div>
        <div className="theme-choice-grid">
          <button type="button" className={`theme-choice ${locale === "fr" ? "selected" : ""}`} onClick={() => setLocale("fr")} aria-pressed={locale === "fr"}>
            <span className="mobile-settings-icon"><Languages size={20} /></span>
            <span><strong>{t("settings.language.french")}</strong><small>{t("settings.language.french")}</small></span>
            {locale === "fr" ? <CheckCircle2 size={16} /> : null}
          </button>
          <button type="button" className={`theme-choice ${locale === "en" ? "selected" : ""}`} onClick={() => setLocale("en")} aria-pressed={locale === "en"}>
            <span className="mobile-settings-icon"><Languages size={20} /></span>
            <span><strong>{t("settings.language.english")}</strong><small>English</small></span>
            {locale === "en" ? <CheckCircle2 size={16} /> : null}
          </button>
        </div>
      </section>}
      {mobileSettingsSection === "about" && <section className="settings-section settings-section-legal" data-settings-panel="about" aria-label={t("settings.aboutLegal")}>
        <div className="page-top settings-section-head">
          <div>
            <span className="eyebrow">{t("settings.aboutLegal")}</span>
            <h2>Vendeo</h2>
            <p>{t("settings.aboutDescription")}</p>
          </div>
        </div>
        <div className="mobile-settings-grid">
          <a className="mobile-settings-card" href="/about" target="_blank" rel="noopener noreferrer">
            <span className="mobile-settings-icon"><Lightbulb size={20} /></span>
            <span><strong>{t("settings.about")}</strong><small>{t("settings.aboutLinkDescription")}</small></span>
            <ArrowRight size={16} />
          </a>
          <a className="mobile-settings-card" href="/terms" target="_blank" rel="noopener noreferrer">
            <span className="mobile-settings-icon"><FileText size={20} /></span>
            <span><strong>{t("settings.terms")}</strong><small>{t("settings.termsDescription")}</small></span>
            <ArrowRight size={16} />
          </a>
          <a className="mobile-settings-card" href="/privacy" target="_blank" rel="noopener noreferrer">
            <span className="mobile-settings-icon"><Eye size={20} /></span>
            <span><strong>{t("settings.privacy")}</strong><small>{t("settings.privacyDescription")}</small></span>
            <ArrowRight size={16} />
          </a>
        </div>
      </section>}
      {mobileSettingsSection === "channels" && <section className="settings-section settings-section-channels" data-settings-panel="channels" aria-label={t("settings.adChannels")}>
        <div className="page-top settings-section-head">
          <div>
            <span className="eyebrow">{t("settings.adChannels")}</span>
            <h2>{t("settings.connectedAccounts")}</h2>
            <p>{t("settings.connectedAccountsDescription")}</p>
          </div>
        </div>
      {connectionError ? <p className="settings-inline-message settings-account-error" role="alert">{localizeSystemMessage(connectionError, locale)}</p> : null}
      {CONNECTED_ACCOUNT_PLATFORMS.map((platform) => {
        const allowed = isAdPlatformAllowed(plan, platform.badge);
        const isConnected = platform.id === "meta" ? metaConnected : platform.id === "tiktok" ? tiktokConnected : pinterestConnected;
        const busy = connectionBusy === platform.id;
        return (
          <div className="settings-integration-card" key={platform.id}>
            <div>
              <span className="mobile-settings-icon"><ChannelBadge id={platform.badge} /></span>
              <div>
                <strong>{platform.label}</strong>
                <small>
                  {!platform.live
                    ? t("settings.comingSoon")
                    : !allowed
                    ? t("settings.notIncluded")
                    : loadingAccounts
                    ? t("settings.checking")
                    : isConnected
                    ? t("settings.connected")
                    : locale === "en"
                    ? ({ meta: "Run campaigns on Facebook and Instagram.", tiktok: "Run campaigns on TikTok Ads.", pinterest: "Run campaigns on Pinterest Ads." }[platform.id])
                    : platform.description}
                </small>
              </div>
            </div>
            {!platform.live || !allowed ? (
              <button type="button" className="settings-connect" disabled>
                {!platform.live ? t("settings.comingSoon") : t("settings.unavailable")}
              </button>
            ) : isConnected ? (
              <button type="button" className="settings-disconnect" onClick={() => void disconnectAccount(platform.id as "meta" | "tiktok" | "pinterest")} disabled={busy}>
                {busy ? t("settings.disconnecting") : t("settings.disconnect")}
              </button>
            ) : (
              <button type="button" className="settings-connect" onClick={() => connectAccount(platform.id as "meta" | "tiktok" | "pinterest")} disabled={busy}>
                {t("settings.connect")}
              </button>
            )}
          </div>
        );
      })}
      </section>}
      {mobileSettingsSection === "feedback" && <section className="settings-section settings-section-feedback" data-settings-panel="feedback"><FeedbackView /></section>}
      </div>
      </>
      )}
      {showDeleteAccountModal ? <div className="account-delete-backdrop" role="presentation" onClick={() => !deletingAccount && setShowDeleteAccountModal(false)}><section className="account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="account-delete-title" onClick={(event) => event.stopPropagation()}><button type="button" className="account-delete-close" aria-label={t("wizardExtra.close")} onClick={() => setShowDeleteAccountModal(false)} disabled={deletingAccount}>×</button><div className="account-delete-icon"><Trash2 size={22} /></div><span className="eyebrow">{t("settings.irreversible")}</span><h2 id="account-delete-title">{t("settings.deleteQuestion")}</h2><p>{t("sweep1.text297")}</p><div className="account-delete-warning">{t("settings.deleteWarning")}</div><div className="account-delete-actions"><button type="button" className="btn btn-ghost" onClick={() => setShowDeleteAccountModal(false)} disabled={deletingAccount}>{t("workspaceExtra.cancel")}</button><button type="button" className="btn account-delete-confirm" onClick={() => void deleteAccount()} disabled={deletingAccount}>{deletingAccount ? t("adminExtra.push.deleting") : t("settings.confirmDelete")}</button></div></section></div> : null}
    </div>
  );
}

type MetaAccountState = { id: string; currency: string; last_backfill_at: string | null; backfill_status: "processing" | "in_progress" | "failed" | "complete" | null; backfill_next_from?: string | null };

type MetaPerformance = {
  currency: string;
  adCurrency: string;
  period: { from: string; to: string };
  chariowRevenueByCurrency: Array<{ currency: string; amount: number }>;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  overview: { spend: number; chariowRevenue: number | null; metaReportedRevenue: number; attributedGrossRevenue: number | null; attributedNetRevenue: number | null; attributedRevenue: number | null; attributedSpend: number | null; attributedCustomers: number; attributedCostPerCustomer: number | null; conversions: number; sales: number; cpa: number | null; cac: number | null; metaRoas: number | null; realRoas: number | null; attributionCoverage: number; state: "A" | "B" | "C" | "D"; vendeoCampaigns: number; verifiedSales: number };
  performances: Array<{ id: string; name: string; impressions: number; clicks: number; spend: number; conversions: number; cpa: number | null; cac: number | null; roas: number | null; realSales: number | null; realGrossRevenue: number | null; realRevenue: number | null; realRoas: number | null; attributionReliable: boolean; trackingReady: boolean; dailyBudget: number | null; daysSinceLaunch: number | null; paybackDays: number | null; suggestedIncrease: number | null; decision: "keep_running" | "pause" | "learning" | "insufficient_data"; decisionReasons: string[]; status: string }>;
};

type MetaPixelOption = { id: string; name: string; configured_on_chariow?: boolean };

type AdsCache = {
  pinterestAccounts?: Array<{ id: string; advertiser_id: string; name: string | null; currency: string; country: string | null }>;
  metaAccounts: Array<{ id: string; name: string | null; currency: string; account_status?: number | null; is_selected?: boolean | null; last_synced_at?: string | null; needs_reconnect?: boolean }>;
  selectedMetaAccount: string;
  metaPerformance: MetaPerformance | null;
  metaResources: { pages: Array<{ id: string; name: string }>; pixels: Array<MetaPixelOption> } | null;
  metaAccountRestricted: boolean;
  tiktokAccounts: Array<{ id: string; advertiser_id: string; name: string | null; currency: string; status: string | null }>;
};

// Verdict compact basé sur l’état et la fiabilité des mesures liées à la campagne.
type AdVerdictTone = "stop" | "optimize" | "watch" | "none";
type AdVerdict = {
  tone: AdVerdictTone;
  labelKey: string;
};

function getCampaignVerdict(campaign: MetaPerformance["performances"][number]): AdVerdict {
  if (campaign.decision === "pause") return { tone: "stop", labelKey: "overview.loss" };
  if (campaign.decision === "keep_running" && campaign.attributionReliable && campaign.realRoas !== null) return { tone: "optimize", labelKey: "overview.gain" };
  if (campaign.spend <= 0) return { tone: "none", labelKey: "overview.noSpend" };
  if (campaign.decision === "learning") return { tone: "watch", labelKey: "overview.campaignStarting" };
  if (campaign.realSales === 0) return { tone: "watch", labelKey: "overview.noSalesDetected" };
  if (!campaign.attributionReliable) return { tone: "watch", labelKey: "overview.salesNotVerified" };
  if (campaign.decision === "insufficient_data") return { tone: "watch", labelKey: "overview.campaignDataInsufficient" };
  return { tone: "watch", labelKey: "overview.watch" };
}

function AdVerdictBadge({ verdict }: { verdict: AdVerdict }) {
  const { t } = useI18n();
  const className = verdict.tone === "stop" ? "meta-status loss" : verdict.tone === "optimize" ? "meta-status profitable" : verdict.tone === "watch" ? "meta-status watch" : "meta-status";
  return <span className={className}>{t(verdict.labelKey)}</span>;
}

// Skeleton affiché pendant la vérification de la connexion TikTok.
function TikTokSkeleton() {
  const { t } = useI18n();
  return (
    <div aria-busy="true" aria-label={t("sweep2.text298")}>
      <style>{`@keyframes vendeo-skeleton-pulse{0%,100%{opacity:.45}50%{opacity:.9}}.vendeo-skeleton{background:rgba(148,163,184,.16);border-radius:10px;animation:vendeo-skeleton-pulse 1.4s ease-in-out infinite}`}</style>
      <div className="app-card" style={{ marginBottom: 18, display: "flex", alignItems: "center" }}>
        <div className="vendeo-skeleton" style={{ height: 36, width: 190, borderRadius: 999 }} />
      </div>
      <div className="vendeo-kpi-grid" style={{ marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div className="vendeo-kpi" key={i}>
            <div className="vendeo-skeleton" style={{ height: 12, width: "60%", marginBottom: 12 }} />
            <div className="vendeo-skeleton" style={{ height: 26, width: "45%" }} />
          </div>
        ))}
      </div>
      <div className="app-card">
        <div className="vendeo-skeleton" style={{ height: 14, width: "40%", marginBottom: 16 }} />
        <div className="vendeo-skeleton" style={{ height: 12, width: "100%", marginBottom: 10 }} />
        <div className="vendeo-skeleton" style={{ height: 12, width: "85%", marginBottom: 10 }} />
        <div className="vendeo-skeleton" style={{ height: 12, width: "70%" }} />
      </div>
    </div>
  );
}

// Vue des performances publicitaires et des campagnes liées au compte sélectionné.
export function AdsView({ plan, onGoToAI, onGoToAccounts, onLaunchAd, storeId, campaignsVersion }: { plan: PlanId; onGoToAI: () => void; onGoToAccounts: () => void; onLaunchAd: () => void; storeId: string | null; campaignsVersion: number }) {
  const { t, locale } = useI18n();
  const en = locale === "en";
  const openAI = (prompt: string) => { sessionStorage.setItem(SESSION_STORAGE_PROMPT_KEY, prompt); onGoToAI(); };
  const navigationCache = useNavigationCache();
  const adsCacheKey = `ads:${storeId ?? "none"}:${plan}`;
  const adsSnapshot = useSyncExternalStore(navigationCache.subscribe, () => navigationCache.snapshot(adsCacheKey), () => navigationCache.snapshot(null));
  const cachedOnce = adsSnapshot.data as AdsCache | undefined;
  const [channel, setChannel] = useState<"overview" | "meta" | "tiktok" | "pinterest">("overview");
  const [message, setMessage] = useState<string | null>(null);

  const [metaAccounts, setMetaAccounts] = useState<Array<{ id: string; name: string | null; currency: string; account_status?: number | null; is_selected?: boolean | null; last_synced_at?: string | null; needs_reconnect?: boolean }>>(cachedOnce?.metaAccounts ?? []);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState(cachedOnce?.selectedMetaAccount ?? "");
  const [metaPerformance, setMetaPerformance] = useState<MetaPerformance | null>(cachedOnce?.metaPerformance ?? null);
  const [metaResources, setMetaResources] = useState<{ pages: Array<{ id: string; name: string }>; pixels: Array<MetaPixelOption> } | null>(cachedOnce?.metaResources ?? null);
  const [metaAccountRestricted, setMetaAccountRestricted] = useState(cachedOnce?.metaAccountRestricted ?? false);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaLoadError, setMetaLoadError] = useState<string | null>(null);
  const metaRequestToken = useRef(0);
  const [copiedPixelId, setCopiedPixelId] = useState<string | null>(null);
  const [configuringPixel, setConfiguringPixel] = useState<string | null>(null);

  const [tiktokAccounts, setTiktokAccounts] = useState<Array<{ id: string; advertiser_id: string; name: string | null; currency: string; status: string | null }>>(cachedOnce?.tiktokAccounts ?? []);
  const [pinterestAccounts, setPinterestAccounts] = useState<Array<{ id: string; advertiser_id: string; name: string | null; currency: string; country: string | null }>>(cachedOnce?.pinterestAccounts ?? []);
  // Tant que le statut TikTok n'est pas connu (pas de cache), on affiche des skeletons
  // au lieu du bouton « Connecter TikTok » pour éviter le flash d'interface.
  const [tiktokLoading, setTiktokLoading] = useState(!cachedOnce);

  // Charge performances, pages/pixels et statut de restriction pour UN compte donné.
  async function loadMetaAccountData(accountId: string, lastSyncedAt?: string | null, needsReconnect = false, requestToken = ++metaRequestToken.current) {
    let perf: MetaPerformance | null = null;
    let resources: { pages: Array<{ id: string; name: string }>; pixels: Array<MetaPixelOption> } | null = null;
    let restricted = false;
    if (needsReconnect) {
      setMetaPerformance(null);
      setMetaResources(null);
      setMetaAccountRestricted(false);
      return { perf, resources, restricted, needsReconnect: true };
    }
    const lastSyncTime = lastSyncedAt ? Date.parse(lastSyncedAt) : 0;
    if (!lastSyncTime || Date.now() - lastSyncTime > 3 * 60 * 60 * 1000) {
      setMetaSyncing(true);
      try {
        const syncResponse = await fetch("/api/meta/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: accountId }) });
        const syncData = await syncResponse.json().catch(() => ({}));
        if (syncResponse.status === 409 && syncData?.needs_reconnect) {
          if (requestToken === metaRequestToken.current) {
            setMetaAccounts((current) => current.map((item) => item.id === accountId ? { ...item, needs_reconnect: true } : item));
            setMetaPerformance(null);
            setMetaResources(null);
            setMetaAccountRestricted(false);
            setMessage(t("ads.reconnectMetaRequired"));
          }
          return { perf: null, resources: null, restricted: false, needsReconnect: true };
        }
        if (!syncResponse.ok && requestToken === metaRequestToken.current) setMessage(t("ads.syncError"));
      } catch {
        if (requestToken === metaRequestToken.current) setMessage(t("ads.syncError"));
      } finally {
        if (requestToken === metaRequestToken.current) setMetaSyncing(false);
      }
    }
    const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(accountId)}`);
    if (!metrics.ok) throw new Error("Meta performance request failed");
    perf = await metrics.json();
    const resourceResponse = await fetch(`/api/integrations/meta/resources?account_id=${encodeURIComponent(accountId)}`);
    if (!resourceResponse.ok) throw new Error("Meta resources request failed");
    const resourceData = await resourceResponse.json();
    resources = resourceData;
    restricted = Boolean(resourceData.account?.restricted);
    if (requestToken !== metaRequestToken.current) return { perf: null, resources: null, restricted: false, needsReconnect: false };
    setMetaPerformance(perf);
    setMetaResources(resources);
    setMetaAccountRestricted(restricted);
    return { perf, resources, restricted, needsReconnect: false };
  }

  async function load() {
    const requestToken = ++metaRequestToken.current;
    type TiktokAccount = { id: string; advertiser_id: string; name: string | null; currency: string; status: string | null };
    // Requête TikTok lancée en parallèle de Meta (avant, elle attendait la fin des appels Meta).
    const tiktokAllowedNow = isAdPlatformAllowed(plan, "tiktok");
    const tiktokPromise: Promise<TiktokAccount[]> = tiktokAllowedNow
      ? fetch("/api/integrations/tiktok/accounts")
          .then((response) => (response.ok ? response.json() : { accounts: [] }))
          .then((data) => (data.accounts ?? []) as TiktokAccount[])
          .catch(() => [] as TiktokAccount[])
      : Promise.resolve([] as TiktokAccount[]);
    void tiktokPromise.then((accounts) => {
      if (requestToken !== metaRequestToken.current) return;
      if (tiktokAllowedNow) setTiktokAccounts(accounts);
      setTiktokLoading(false);
    });
    const pinterestPromise = fetch("/api/integrations/pinterest/accounts")
      .then((response) => (response.ok ? response.json() : { accounts: [] }))
      .then((data) => { const accounts = data.accounts ?? []; if (requestToken === metaRequestToken.current) setPinterestAccounts(accounts); return accounts; })
      .catch(() => []);

    const metaResponse = await fetch("/api/integrations/meta/accounts");
    const metaData = metaResponse.ok ? await metaResponse.json() : { accounts: [] };
    if (requestToken !== metaRequestToken.current) return;
    let nextMetaAccounts = (metaData.accounts ?? []) as Array<{ id: string; name: string | null; currency: string; account_status?: number | null; is_selected?: boolean | null; last_synced_at?: string | null; needs_reconnect?: boolean }>;
    setMetaAccounts(nextMetaAccounts);

    // Conserve le compte déjà choisi (cache) s'il existe encore, sinon le compte
    // marqué is_selected, sinon le premier compte actif. Avant ce correctif, on
    // reprenait toujours le premier compte, ce qui écrasait le choix de l'utilisateur
    // au rechargement de la page.
    const chosenAccount =
      nextMetaAccounts.find((a) => a.id === cachedOnce?.selectedMetaAccount) ??
      nextMetaAccounts.find((a) => a.is_selected) ??
      nextMetaAccounts[0];

    let nextSelectedMetaAccount = "";
    let nextMetaPerformance: MetaPerformance | null = null;
    let nextMetaResources: { pages: Array<{ id: string; name: string }>; pixels: Array<MetaPixelOption> } | null = null;
    let nextMetaAccountRestricted = false;
    if (chosenAccount) {
      if (chosenAccount.id !== selectedMetaAccount) {
        setMetaLoading(true);
        setMetaPerformance(null);
        setMetaResources(null);
        setMetaAccountRestricted(false);
      }
      nextSelectedMetaAccount = chosenAccount.id;
      setSelectedMetaAccount(nextSelectedMetaAccount);
      const loaded = await loadMetaAccountData(chosenAccount.id, chosenAccount.last_synced_at, Boolean(chosenAccount.needs_reconnect), requestToken);
      if (loaded.needsReconnect) {
        nextMetaAccounts = nextMetaAccounts.map((item) => item.id === chosenAccount.id ? { ...item, needs_reconnect: true } : item);
        setMetaAccounts(nextMetaAccounts);
      }
      nextMetaPerformance = loaded.perf;
      nextMetaResources = loaded.resources;
      nextMetaAccountRestricted = loaded.restricted;
    }

    const nextTiktokAccounts = await tiktokPromise;
    if (requestToken !== metaRequestToken.current) return;
    setMetaLoading(false);
    if (!chosenAccount) { setSelectedMetaAccount(""); setMetaPerformance(null); setMetaResources(null); setMetaAccountRestricted(false); }
    return { metaAccounts: nextMetaAccounts, selectedMetaAccount: nextSelectedMetaAccount, metaPerformance: nextMetaPerformance, metaResources: nextMetaResources, metaAccountRestricted: nextMetaAccountRestricted, tiktokAccounts: nextTiktokAccounts, pinterestAccounts: await pinterestPromise };
  }

  // Changement de compte dans le sélecteur : recharge les performances et le statut
  // de restriction pour CE compte. Avant, on gardait les données de l'ancien compte,
  // d'où le message de restriction du mauvais compte affiché sur le nouveau.
  async function selectMetaAccount(accountId: string) {
    const requestToken = ++metaRequestToken.current;
    setSelectedMetaAccount(accountId);
    setMetaLoading(true);
    setMetaLoadError(null);
    setMetaPerformance(null);
    setMetaResources(null);
    setMetaAccountRestricted(false);
    setMessage(null);
    setMetaSyncing(false);
    setConfiguringPixel(null);
    setCopiedPixelId(null);
    try {
      const selectedAccount = metaAccounts.find((account) => account.id === accountId);
      const loaded = await loadMetaAccountData(accountId, selectedAccount?.last_synced_at, Boolean(selectedAccount?.needs_reconnect), requestToken);
      if (requestToken !== metaRequestToken.current) return;
      const nextMetaAccounts = loaded.needsReconnect ? metaAccounts.map((item) => item.id === accountId ? { ...item, needs_reconnect: true } : item) : metaAccounts;
      if (loaded.needsReconnect) setMetaAccounts(nextMetaAccounts);
      await navigationCache.loadComputed(`${adsCacheKey}:account:${accountId}`, async () => ({ perf: loaded.perf, resources: loaded.resources, restricted: loaded.restricted }), campaignsVersion, true);
      navigationCache.invalidate();
      void navigationCache.loadComputed(adsCacheKey, async () => ({ metaAccounts: nextMetaAccounts, selectedMetaAccount: accountId, metaPerformance: loaded.perf, metaResources: loaded.resources, metaAccountRestricted: loaded.restricted, tiktokAccounts }), campaignsVersion, true);
    } catch {
      if (requestToken === metaRequestToken.current) {
        setMetaPerformance(null);
        setMetaResources(null);
        setMetaAccountRestricted(false);
        setMetaLoadError(t("sweep3.text299"));
      }
    } finally {
      if (requestToken === metaRequestToken.current) setMetaLoading(false);
    }
  }

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void navigationCache.loadComputed(adsCacheKey, () => loadRef.current(), campaignsVersion);
  }, [navigationCache, adsCacheKey, campaignsVersion, adsSnapshot]);
  useEffect(() => {
    if (adsSnapshot.error) { setMetaLoading(false); if (!cachedOnce) setMetaLoadError(t("sweep3.text299")); }
  }, [adsSnapshot.error, cachedOnce]);
  useEffect(() => {
    if (!cachedOnce) return;
    setMetaAccounts(cachedOnce.metaAccounts);
    setSelectedMetaAccount(cachedOnce.selectedMetaAccount);
    setMetaPerformance(cachedOnce.metaPerformance);
    setMetaResources(cachedOnce.metaResources);
    setMetaAccountRestricted(cachedOnce.metaAccountRestricted);
    setTiktokAccounts(cachedOnce.tiktokAccounts);
    setPinterestAccounts(cachedOnce.pinterestAccounts ?? []);
    setTiktokLoading(false);
  }, [cachedOnce]);
  useEffect(() => {
    const refreshStale = () => { if (document.visibilityState !== "hidden") void navigationCache.loadComputed(adsCacheKey, () => loadRef.current(), campaignsVersion); };
    window.addEventListener("focus", refreshStale);
    const timer = window.setInterval(refreshStale, 60_000);
    return () => { clearInterval(timer); window.removeEventListener("focus", refreshStale); metaRequestToken.current += 1; };
  }, [navigationCache, adsCacheKey, campaignsVersion]);

  const connectMeta = () => { window.location.href = "/api/integrations/meta/connect"; };
  const connectTiktok = () => { window.location.href = "/api/integrations/tiktok/connect"; };
  const connectPinterest = () => { window.location.href = "/api/integrations/pinterest/connect"; };


  async function syncMeta() {
    if (!selectedMetaAccount || metaAccounts.find((account) => account.id === selectedMetaAccount)?.needs_reconnect) return;
    const accountId = selectedMetaAccount;
    const requestToken = metaRequestToken.current;
    setMetaSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/meta/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: accountId }) });
      const data = await response.json();
      if (requestToken !== metaRequestToken.current) return;
      if (!response.ok) {
        if (data?.needs_reconnect) {
          setMetaAccounts((current) => current.map((account) => account.id === accountId ? { ...account, needs_reconnect: true } : account));
          setMetaPerformance(null);
          setMetaResources(null);
          setMetaAccountRestricted(false);
        }
        setMessage(data.error ?? t("ads.syncError"));
      } else {
        setMessage(t("ads.synced"));
        navigationCache.invalidate();
        const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(accountId)}`);
        if (metrics.ok) {
          const performance = await metrics.json();
          if (requestToken === metaRequestToken.current) setMetaPerformance(performance);
        }
      }
    } finally { if (requestToken === metaRequestToken.current) setMetaSyncing(false); }
  }

  async function copyPixelId(pixelId: string) {
    try {
      await navigator.clipboard.writeText(pixelId);
      setCopiedPixelId(pixelId);
      window.setTimeout(() => setCopiedPixelId((current) => (current === pixelId ? null : current)), 1500);
    } catch {
      // Le presse-papiers peut être indisponible (navigateur ancien) : on ignore.
    }
  }

  async function markPixelConfigured(pixelId: string, configured: boolean) {
    if (!selectedMetaAccount) return;
    const accountId = selectedMetaAccount;
    const requestToken = metaRequestToken.current;
    setConfiguringPixel(pixelId);
    try {
      const response = await fetch("/api/integrations/meta/pixels/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, pixel_id: pixelId, configured }),
      });
      if (response.ok && requestToken === metaRequestToken.current) {
        navigationCache.invalidate();
        setMetaResources((current) =>
          current
            ? { ...current, pixels: current.pixels.map((pixel) => (pixel.id === pixelId ? { ...pixel, configured_on_chariow: configured } : pixel)) }
            : current,
        );
      }
    } finally {
      if (requestToken === metaRequestToken.current) setConfiguringPixel(null);
    }
  }

  const tiktokAllowed = isAdPlatformAllowed(plan, "tiktok");
  const metaConnected = metaAccounts.length > 0;
  const selectedMetaNeedsReconnect = Boolean(metaAccounts.find((account) => account.id === selectedMetaAccount)?.needs_reconnect);
  const tiktokConnected = tiktokAccounts.length > 0;

  const channels: Array<{ id: "overview" | "meta" | "tiktok" | "pinterest"; label: string }> = [{ id: "overview", label: t("ads.overview") }, { id: "meta", label: t("ads.meta") }, ...(tiktokAllowed ? [{ id: "tiktok" as const, label: t("ads.tiktok") }] : []), { id: "pinterest", label: "Pinterest" }];

  return (
    <>
      <div className="page-top" style={{ gap: 12 }}><div><span className="eyebrow">{t("ads.eyebrow")}</span><h1>{t("ads.title")}</h1><p>{t("ads.subtitle")}</p></div><button type="button" className="btn btn-dark" style={{ flexShrink: 0 }} onClick={onLaunchAd}><Plus size={15} /> {t("ads.launch")}</button></div>

      <div className="app-card ads-channel-switcher" role="tablist" aria-label={t("ads.title")}>{channels.map((item) => <button key={item.id} type="button" role="tab" aria-selected={channel === item.id} aria-label={item.label} title={item.label} className={`btn ${channel === item.id ? "btn-dark" : "btn-ghost"}`} onClick={() => setChannel(item.id)}>{item.id === "meta" ? <FaMeta size={18} /> : item.id === "tiktok" ? <FaTiktok size={17} /> : item.id === "pinterest" ? <FaPinterestP size={17} style={{ color: "#E60023" }} /> : null}<span>{item.label}</span></button>)}</div>

      {message && <p className="store-error" role="status">{message}</p>}

      {channel === "overview" ? <AdCampaignsList storeId={storeId} onNewCampaign={onLaunchAd} key={campaignsVersion} /> : null}

      {channel === "pinterest" ? <section className="ads-accounts-panel">
        {pinterestAccounts.length ? <div className="app-card ads-accounts"><div className="card-head"><div><span className="eyebrow">{t("finalExtra.text42")}</span><h2>{t("finalExtra.text43")}</h2></div></div>{pinterestAccounts.map((account) => <div className="ads-account-row" key={account.id}><div><strong>{account.name || account.advertiser_id}</strong><small>{account.advertiser_id}{account.currency ? ` · ${account.currency}` : ""}{account.country ? ` · ${account.country}` : ""}</small></div><span className="status-positive">{t("settings.connected")}</span></div>)}</div> : <div className="empty-state"><FaPinterestP size={28} style={{ color: "#E60023" }} /><strong>{t("sweep1.text300")}</strong><span>{t("sweep2.text301")}</span><button type="button" className="btn btn-dark" onClick={connectPinterest}>{t("finalExtra.text44")}</button></div>}
        {pinterestAccounts.length ? <PinterestAdsPanel accounts={pinterestAccounts} /> : null}
      </section> : null}

      {channel === "overview" ? <section className="app-card"><div className="card-head"><div><span className="eyebrow">{t("ads.stats")}</span><h2>{t("ads.performance")}</h2></div><Activity size={18} /></div><div className="vendeo-kpi-grid"><div className="vendeo-kpi"><span className="metric-label">{t("ads.spend")}</span><strong>{(metaPerformance ? formatMoneyInUSD(metaPerformance.overview.spend, metaPerformance.currency) : null) ?? t("ads.unavailable")}</strong></div><div className="vendeo-kpi"><span className="metric-label">{t("ads.sales")}</span><strong>{metaPerformance?.overview.sales ?? 0}</strong></div><div className="vendeo-kpi"><span className="metric-label">{t("ads.realRoas")}</span><strong>{metaPerformance?.overview.realRoas === null || metaPerformance?.overview.realRoas === undefined ? t("ads.unavailable") : `${(metaPerformance.overview.realRoas * 100).toFixed(1)} %`}</strong></div></div></section> : channel === "meta" ? (
        <>
          {metaConnected ? <div className="app-card" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="status-positive meta-connected-badge"><CheckCircle2 size={14} /> {t("ads.connected")}</span></div> : null}
          {selectedMetaNeedsReconnect ? <div className="meta-account-warning" role="alert"><AlertTriangle size={18} /><div><strong>{t("ads.reconnectMetaRequired")}</strong><p><button type="button" className="btn btn-ghost" onClick={connectMeta}>{t("ads.reconnectMeta")}</button></p></div></div> : null}
          {!metaLoading && metaAccountRestricted ? <div className="meta-account-warning" role="alert"><AlertTriangle size={18} /><div><strong>{t("finalExtra.text45")}</strong><p>{t("sweep3.text302")}</p><a href="https://www.facebook.com/accountquality" target="_blank" rel="noreferrer" className="btn btn-ghost">{t("sweep1.text303")}</a></div></div> : null}
          {!metaLoading && metaConnected && metaResources && !metaResources.pages.length ? <div className="meta-conversion-info">{t("sweep2.text304")}</div> : null}
          {!metaConnected ? <div className="empty-state"><BarChart3 size={24} /><strong>{t("ads.noMeta")}</strong><span>{t("ads.noMetaText")}</span><button className="btn btn-dark" onClick={connectMeta}>{t("ads.connectMeta")}</button></div> : <>
            <div className="app-card meta-toolbar"><label>{t("ads.account")}<select value={selectedMetaAccount} onChange={(event) => void selectMetaAccount(event.target.value)}>{metaAccounts.map((account) => <option key={account.id} value={account.id}>{account.name ?? account.id}</option>)}</select></label><span className="hint-line">{metaLoading ? t("adminExtra.notifications.loading") : <>{t("sweep3.text305")}{" "}{metaPerformance?.lastSyncedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(metaPerformance.lastSyncedAt)) : t("adminComplete.never")}{metaPerformance?.lastSyncError ? ` · Erreur : ${metaPerformance.lastSyncError}` : ""}</>}</span><button className="btn btn-ghost" onClick={syncMeta} disabled={metaSyncing || metaLoading || selectedMetaNeedsReconnect}>{metaSyncing ? t("ads.syncing") : t("ads.sync")}</button></div>
            {metaLoading ? <MetaAccountSkeleton /> : metaLoadError ? <div className="empty-state" role="alert"><strong>{localizeSystemMessage(metaLoadError, locale)}</strong></div> : null}
            {!metaLoading && !metaLoadError && metaConnected && metaResources ? (
              <section className="app-card" style={{ marginBottom: 18 }}>
                <div className="card-head"><div><span className="eyebrow">{t("sweep1.text306")}</span><h2>{t("optionsExtra.text58")}</h2><p>{t("sweep2.text307")}</p></div>{metaResources.pixels.length > 0 && !metaResources.pixels.some((pixel) => pixel.configured_on_chariow) ? <a href="https://business.facebook.com/events_manager2/list" target="_blank" rel="noreferrer" className="btn btn-ghost">{t("sweep3.text308")}</a> : null}</div>
                {metaResources.pixels.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {metaResources.pixels.map((pixel) => (
                      <div key={pixel.id} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--line)" }}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: 13 }}>{pixel.name}</strong>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                            <code style={{ fontSize: 12, background: "#F3F4F6", padding: "2px 6px", borderRadius: 6 }}>{pixel.id}</code>
                            <button type="button" className="btn btn-ghost" onClick={() => void copyPixelId(pixel.id)} style={{ padding: "2px 8px", fontSize: 11 }}>{copiedPixelId === pixel.id ? t("sweep1.text309") : t("chat.copy")}</button>
                          </div>
                        </div>
                        {pixel.configured_on_chariow ? (
                          <button type="button" className="btn btn-ghost" disabled={configuringPixel === pixel.id} onClick={() => void markPixelConfigured(pixel.id, false)} style={{ color: "#065F46" }}>{t("sweep2.text310")}</button>
                        ) : (
                          <button type="button" className="btn btn-dark" disabled={configuringPixel === pixel.id} onClick={() => void markPixelConfigured(pixel.id, true)}>{t("sweep3.text311")}</button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ textAlign: "left" }}>
                    <strong>{t("sweep1.text312")}</strong>
                    <span>{t("sweep2.text313")}</span>
                    <a href="https://business.facebook.com/events_manager2/list" target="_blank" rel="noreferrer" className="btn btn-dark">{t("sweep3.text308")}</a>
                  </div>
                )}
              </section>
            ) : null}
            {!metaLoading && !metaLoadError && metaPerformance ? (
              <>
                <div className="vendeo-kpi-grid meta-kpis">
                  <div className="vendeo-kpi"><MetricHelp label={t("ads.spend")} description={en ? "Spend synced from Meta Insights." : "Dépenses synchronisées depuis Meta Insights."} /><strong>{formatMoneyInUSD(metaPerformance.overview.spend, metaPerformance.currency) ?? t("overview.metricUnavailable")}</strong><small className="source-meta">{t("overview.metaDeclared")}</small></div>
                  <div className="vendeo-kpi"><MetricHelp label={t("overview.netRevenue")} description={en ? "Historical store net revenue, not linked to campaigns." : "Revenu net historique de la boutique, non relié aux campagnes."} /><strong>{formatUsdTotal(metaPerformance.chariowRevenueByCurrency.map((item) => ({ amount: item.amount, currency: item.currency }))) ?? t("overview.metricUnavailable")}</strong><small className="source-history">{t("overview.history")}</small></div>
                  <div className="vendeo-kpi"><MetricHelp label={t("overview.costPerSale")} description={en ? "Spend divided by linked, verified sales." : "Dépenses rapportées aux ventes liées et vérifiées."} /><strong>{metaPerformance.overview.cac === null ? t("overview.metricUnavailable") : formatMoneyInUSD(metaPerformance.overview.cac, metaPerformance.currency) ?? t("overview.metricUnavailable")}</strong></div>
                  <div className="vendeo-kpi"><MetricHelp label={t("overview.profitability")} description={en ? "Purchase value reported by Meta divided by spend." : "Valeur d’achat déclarée par Meta rapportée aux dépenses."} /><strong>{metaPerformance.overview.metaRoas === null ? "-" : `${(metaPerformance.overview.metaRoas * 100).toFixed(1)} %`}</strong><small className="source-meta">{t("overview.metaDeclared")}</small></div>
                  <div className="vendeo-kpi"><MetricHelp label={t("overview.profitability")} description={en ? "Net revenue linked to a Vendeo campaign divided by spend." : "Revenu net lié à une campagne Vendeo, rapporté aux dépenses."} /><strong>{metaPerformance.overview.realRoas === null ? "-" : `${(metaPerformance.overview.realRoas * 100).toFixed(1)} %`}</strong><small className="source-verified">{t("overview.verified")}</small></div>
                </div>
                <section className="app-card meta-campaigns">
                  <div className="card-head"><div><span className="eyebrow">Meta</span><h2>{t("overview.campaigns")}</h2></div><Activity size={18} color="#103ef8" /></div>
                  <div className="meta-table">
                    <div className="meta-table-head"><span>{t("autopilot.campaign")}</span><span>{t("ads.spend")}</span><span>{t("overview.verified")}</span><span>{t("overview.profitability")}</span><span>{t("autopilot.decision")}</span></div>
                    {metaPerformance.performances.map((campaign) => {
                      const verdict = getCampaignVerdict(campaign);
                      return <div className="meta-table-row" key={campaign.id}>
                        <strong>{campaign.name}</strong>
                        <span>{formatMoneyInUSD(campaign.spend, metaPerformance.currency) ?? t("overview.metricUnavailable")}</span>
                        <span>{campaign.realSales === null ? "-" : campaign.realSales}</span>
                        <span>{campaign.realRoas === null ? "-" : `${(campaign.realRoas * 100).toFixed(1)} %`} <small className="source-verified">{t("overview.verified")}</small></span>
                        <AdVerdictBadge verdict={verdict} />
                      </div>;
                    })}
                  </div>
                  {!metaPerformance.performances.length ? <div className="empty-state"><span className="meta-status" title={en ? "Synced campaigns will appear here." : "Les campagnes synchronisées apparaîtront ici."}>{t("overview.soon")}</span></div> : null}
                </section>
                {metaPerformance.performances.length ? <section className="app-card reco-card" style={{ marginTop: 18 }}>
                  <div className="card-head"><div><span className="eyebrow">{t("overview.actions")}</span><h2>{t("overview.actions")}</h2></div><Activity size={18} /></div>
                  <div className="reco-list">{metaPerformance.performances.map((campaign) => {
                    const verdict = getCampaignVerdict(campaign);
                    return <div className={`reco-item reco-item-${verdict.tone}`} key={campaign.id}>
                      <div className="reco-body"><strong>{campaign.name}</strong><AdVerdictBadge verdict={verdict} /></div>
                      <button type="button" className={`reco-action reco-action-${verdict.tone}`} onClick={() => openAI(t("dynamicExtra.analyzeCampaign", { name: (campaign.name), status: (t(verdict.labelKey)) }))}>{t("overview.analyzeCampaign")}</button>
                    </div>;
                  })}</div>
                </section> : null}
              </>
            ) : !metaLoading && !metaLoadError ? <div className="empty-state"><span className="meta-status">{t("overview.soon")}</span></div> : null}
          </>}
        </>
      ) : channel === "tiktok" ? (
        tiktokLoading ? <TikTokSkeleton /> : <>
          {tiktokConnected ? <div className="app-card" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="status-positive meta-connected-badge"><CheckCircle2 size={14} /> {t("ads.tiktokConnected")}</span></div> : null}
          {!tiktokConnected ? <div className="empty-state"><BarChart3 size={24} /><strong>{t("ads.noTiktok")}</strong><span>{t("ads.noTiktokText")}</span><button className="btn btn-dark"
onClick={connectTiktok}>{t("ads.connectTiktok")}</button></div> : <TikTokAdsPanel accounts={tiktokAccounts} />}        </>
      ) : null}
    </>
  );
}

function ReportStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return <div className="report-stat"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function formatReportDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatProductPrice(product: ProductData) {
  const raw = product.price as unknown;
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>).value ?? (raw as Record<string, unknown>).amount ?? (raw as Record<string, unknown>).price : raw;
  const currency = product.currency ?? (raw && typeof raw === "object" ? String((raw as Record<string, unknown>).currency ?? (raw as Record<string, unknown>).currency_code ?? "") : "");
  if (value === null || value === undefined || value === "") return "Prix non renseigné";
  return `${value}${currency ? ` ${currency}` : ""}`;
}

export function StoresView({ stores, subscription, onStoresChange, onBackToSettings }: { stores: StoreData[]; subscription: SubscriptionData | null; onStoresChange: (stores: StoreData[]) => void; onBackToSettings?: () => void }) {
  const { t , locale } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [showShopifyForm, setShowShopifyForm] = useState(false);
  const [showPlatformDialog, setShowPlatformDialog] = useState(false);
  const shopifyInput = useRef<HTMLInputElement>(null);
  const currentPlan: PlanId = "starter";
  const maxStores = planMaxStores(currentPlan);
  const storeLimitReached = stores.length >= maxStores;

  useEffect(() => { if (showShopifyForm) shopifyInput.current?.focus(); }, [showShopifyForm]);

  function choosePlatform(platform: "chariow" | "shopify") {
    if (saving || storeLimitReached) return;
    setError("");
    if (platform === "chariow") void connectChariow();
    else setShowShopifyForm(true);
  }

  async function connectChariow(storeId?: string) {
    if (!storeId && storeLimitReached) return;
    setError("");
    setSaving(true);
    try {
      if (!storeId) {
        const check = await fetch("/api/integrations/chariow/connect/check");
        const checkData = await check.json().catch(() => ({}));
        if (!check.ok) {
          if (checkData.code === "STORE_LIMIT") setError(checkData.error ?? "Limite de boutiques atteinte.");
          else setError(checkData.error ?? "Impossible de lancer la connexion Chariow.");
          return;
        }
      }

      const target = storeId
        ? `/api/integrations/chariow/connect?store_id=${encodeURIComponent(storeId)}`
        : "/api/integrations/chariow/connect";
      window.location.href = target;
    } catch {
      setError(locale === "en" ? "Unable to start the Chariow connection. Please try again." : "Impossible de lancer la connexion Chariow. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  async function connectShopify(storeId?: string) {
    if (!storeId && storeLimitReached) return;
    setError(""); setSaving(true);
    try {
      if (!storeId) {
        const domain = shopifyDomain.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) { setError(locale === "en" ? "Enter a valid *.myshopify.com domain." : "Saisis un domaine *.myshopify.com valide."); return; }
        const check = await fetch("/api/integrations/shopify/connect/check");
        const checkData = await check.json().catch(() => ({}));
        if (!check.ok || checkData.configured === false || checkData.available === false) { setError(checkData.error ?? (locale === "en" ? "Shopify connection is not configured." : "La connexion Shopify n’est pas configurée.")); return; }
        window.location.href = `/api/integrations/shopify/connect?shop=${encodeURIComponent(domain)}`;
      } else window.location.href = `/api/integrations/shopify/connect?store_id=${encodeURIComponent(storeId)}`;
    } catch {
      setError(locale === "en" ? "Unable to start the Shopify connection. Please try again." : "Impossible de lancer la connexion Shopify. Réessaie.");
    } finally { setSaving(false); }
  }

  async function disconnectShopify(id: string) {
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/integrations/shopify/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ store_id: id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Impossible de déconnecter."); return; }
      onStoresChange(stores.map((store) => store.id === id ? data.store : store));
    } finally { setSaving(false); }
  }

  async function disconnectChariow(id: string) {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/chariow/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Impossible de déconnecter.");
        return;
      }
      onStoresChange(stores.map((s) => (s.id === id ? data.store : s)));
    } finally {
      setSaving(false);
    }
  }


  async function deleteStore(id: string) {
    if (!window.confirm(t("sweep3.text314"))) return;
    setError("");
    setDeletingId(id);
    try {
      const res = await fetch(`/api/stores/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Impossible de supprimer la boutique.");
        return;
      }
      onStoresChange(stores.filter((store) => store.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {onBackToSettings && <button type="button" className="mobile-back-button settings-detail-back" onClick={onBackToSettings}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} aria-hidden="true" /> {t("settings.backToSettings")}</button>}
      <div className="page-top">
        <div>
          <span className="eyebrow">{t("finalExtra.text46")}</span>
          <h1>{t("settings.myStores")}</h1>
          <p>{t("sweep1.text315")}{" "}<strong className="store-count">{stores.length}/{maxStores}</strong></p>
        </div>

        <button type="button" className="btn btn-dark" aria-haspopup="dialog" onClick={() => { setError(""); setShowShopifyForm(false); setShowPlatformDialog(true); }} disabled={saving}><Plus size={16} /> {saving ? t("optionsExtra.text59") : t("sweep2.text316")}</button>
      </div>

      {showPlatformDialog && <StorePlatformDialog full={storeLimitReached} busy={saving} error={localizeSystemMessage(error, locale)} showShopifyForm={showShopifyForm} onChoose={choosePlatform} onBack={() => { setError(""); setShowShopifyForm(false); }} onClose={() => setShowPlatformDialog(false)}>
      {showShopifyForm && <form className="store-platform-form" onSubmit={(event) => { event.preventDefault(); void connectShopify(); }}>
        <label htmlFor="store-shopify-domain">{locale === "en" ? "Shopify domain" : "Domaine Shopify"}</label>
        <input id="store-shopify-domain" ref={shopifyInput} aria-label={locale === "en" ? "Shopify domain" : "Domaine Shopify"} value={shopifyDomain} onChange={(event) => setShopifyDomain(event.target.value)} placeholder="example.myshopify.com" autoComplete="url" autoCapitalize="none" spellCheck={false} disabled={saving || storeLimitReached} aria-invalid={!!error} aria-describedby="store-platform-description" />
        <button className="btn btn-dark" type="submit" disabled={saving || storeLimitReached}>{locale === "en" ? "Connect Shopify" : "Connecter Shopify"}</button>
      </form>}
      </StorePlatformDialog>}
      {error && !showPlatformDialog && <p className="store-error" role="alert">{localizeSystemMessage(error, locale)}</p>}

      <div className="app-card" style={{ maxWidth: 760 }}>
        {stores.map((store) => {
          const status = store.connection_status ?? "pending";
          const canDisconnect = status === "connected";
          return (
            <div className="store-row" key={store.id}>
              <div className="store-logo">
                {store.logo_url || store.image ? <img src={store.logo_url ?? store.image ?? ""} alt="" /> : store.platform.slice(0, 1).toUpperCase()}
              </div>
              <div className="store-info">
                <strong>{store.store_name}</strong>
                <span>{store.platform} · {status === "connected" ? t("sweep3.text317") : status === "failed" ? t("sweep1.text318") : status === "expired" ? t("sweep2.text319") : t("sweep3.text320")}</span>
              </div>
              {canDisconnect ? (
                <button className="btn btn-ghost" onClick={() => store.platform === "shopify" ? disconnectShopify(store.id) : disconnectChariow(store.id)} disabled={saving} style={{ fontSize: 10, padding: "7px 10px" }}>
                  {t("settings.disconnect")}</button>
              ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => store.platform === "shopify" ? connectShopify(store.id) : connectChariow(store.id)} disabled={saving} style={{ fontSize: 10, padding: "7px 10px" }}>
                  {status === "failed" || status === "expired" ? t("optionsExtra.text60") : t("adminExtra.admin.retry")}
                 </button>
               )}
               <button className="btn btn-danger-ghost" onClick={() => deleteStore(store.id)} disabled={saving || deletingId === store.id} style={{ fontSize: 10, padding: "7px 10px" }}>
                 {deletingId === store.id ? t("adminExtra.push.deleting") : t("ads.correction.deleteCampaign")}
               </button>
            </div>
          );
        })}
        {stores.length === 0 && <div className="empty-state compact">{t("adminComplete.noStores")}</div>}

      </div>
    </>
  );
}

export function SubscriptionView({ subscription, onBackToSettings }: { subscription: SubscriptionData | null; onBackToSettings?: () => void }) {
  const { t, locale } = useI18n();
  const trial = subscription?.trial_active ?? true;
  const isActive = subscription?.status === "active" && !trial;
  const currentPlan: PlanId = "starter";
  const trialEndsAt = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000)) : null;
  const [changingPlan, setChangingPlan] = useState<PlanId | null>(null);

  async function subscribe(plan: PlanId) {
    setChangingPlan(plan);
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (response.ok && data.payment?.url) {
        window.location.href = data.payment.url;
      } else {
        window.alert(data.error ?? t("sectionsExtra.subscription.paymentError"));
        setChangingPlan(null);
      }
    } catch {
      window.alert(t("sectionsExtra.subscription.paymentError"));
      setChangingPlan(null);
    }
  }

  if (isActive) {
    const periodStart = subscription?.current_period_start ? new Date(subscription.current_period_start).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US") : t("sectionsExtra.subscription.unavailable");
    const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US") : t("sectionsExtra.subscription.unavailable");
    return (
      <>
        {onBackToSettings && <button type="button" className="mobile-back-button settings-detail-back" onClick={onBackToSettings}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} aria-hidden="true" /> {t("settings.backToSettings")}</button>}
      <div className="page-top"><div><span className="eyebrow">{t("sectionsExtra.subscription.heading")}</span><h1>{t("sectionsExtra.subscription.active")}</h1><p>{t("sectionsExtra.subscription.activeDescription")}</p></div></div>
        <div className="app-card" style={{ maxWidth: 520 }}>
          <span className="eyebrow">{t("finalExtra.text47")}</span>
          <h2 style={{ marginTop: 6 }}>{t("sweep1.text321")}</h2>
          <div className="sale-detail-grid" style={{ marginTop: 18 }}>
            <div><small>{t("sweep2.text322")}</small><strong>{periodStart}</strong></div>
            <div><small>{t("finalExtra.text48")}</small><strong>{periodEnd}</strong></div>
            <div><small>{t("finalExtra.text49")}</small><strong>{planMaxStores(currentPlan)}</strong></div>
            <div><small>{t("finalExtra.text50")}</small><strong>{t("sweep3.text323")}</strong></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {onBackToSettings && <button type="button" className="mobile-back-button settings-detail-back" onClick={onBackToSettings}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} aria-hidden="true" /> {t("settings.backToSettings")}</button>}
      <div className="page-top">
        <div>
          <span className="eyebrow">{t("sectionsExtra.subscription.heading")}</span>
          <h1>{t("finalExtra.text51")}</h1>
          <p>{trial && trialDaysLeft !== null ? t("dynamicExtra.trialRemaining", { days: (trialDaysLeft), plural: (trialDaysLeft > 1 ? "s" : "") }) : t("sweep1.text324")}</p>
        </div>

      </div>
      <div className="pricing-wrap" style={{ maxWidth: 820 }}>
        <article className="price-card">
          <span className="eyebrow">{trial ? t("landing.pricing.pill") : t("optionsExtra.text61")}</span>
          <h3>Vendeo</h3>
          <div className="price">{t("landing.pricing.price")} <small>{t("landing.pricing.perMonth")}</small></div>
          <p className="pricing-billing-note">{t("landing.pricing.billingNote")}</p>
          <ul>
            <li>{t("sweep2.text325")}</li>
            <li>{t("sweep3.text326")}</li>
            <li>{t("sweep1.text327")}</li>
            <li>{t("sweep2.text328")}</li>
          </ul>
          <button className="btn btn-ghost" onClick={() => void subscribe("starter")} disabled={changingPlan === "starter"} style={{ width: "100%" }}>
            {changingPlan === "starter" ? t("workspaceExtra.redirecting") : t("workspaceExtra.subscribe")}
          </button>
        </article>
      </div>
    </>
  );
}
