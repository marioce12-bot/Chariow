"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import { Activity, ArrowRight, Camera, Copy, FileText, History, Megaphone, Package, Paperclip, Plus, Rocket, ShieldAlert, Sparkles, Target, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cleanAiText } from "@/lib/ai/format";
import { NavigationCard } from "@/components/chat/NavigationCard";
import { resolveChatNavigationForAssistantReply, type ChatNavigationSection } from "@/components/chat/navigation-intent";
import { LaunchProgress } from "@/components/chat/LaunchProgress";
import { CampaignAction, type CampaignActionData } from "@/components/chat/CampaignAction";
import { LinkifiedText } from "@/components/LinkifiedText";
import { AssistantMessageText } from "@/components/AssistantMessageText";
import { normalizeCurrency, type SupportedCurrency } from "@/lib/currency";
import { META_CTA_TYPES, META_CTA_LABELS, normalizeMetaCta, type MetaCtaType } from "@/lib/meta/cta";
import { useI18n } from "@/lib/i18n/i18n";
import { uploadCampaignMedia } from "@/lib/media/direct-upload";
import { SERVER_UPLOAD_LIMIT, prepareChatImage } from "@/lib/media/chat-attachment";
import "../app/vendeo-ai.css";
import "../app/dashboard-fullwidth.css";

// Assistant Vendeo AI : composant autonome (sorti de Dashboard.tsx).
// Les styles de cette mise en page sont dans app/vendeo-ai.css (sélecteurs préfixés .ai-page).
// Contrat de design : voir docs/VENDEO_AI_LAYOUT.md.

const SESSION_STORAGE_PROMPT_KEY = "vendeo_ai_prompt";
const LAUNCH_TAG = "[[LANCE_CAMPAGNE]]";
const CAMPAIGN_ACTION_TAG = "[[GERER_CAMPAGNE]]";
// Au-delà, on arrête d'attendre l'IA : le message d'erreur s'affiche et le bouton d'envoi
// est débloqué (sinon une réponse jamais arrivée laissait le chat « en train d'écrire » à vie).
const CHAT_REQUEST_TIMEOUT_MS = 70_000;
// Carrousel Meta : 10 cartes au maximum (1 image principale + 9 supplémentaires).
const MAX_LAUNCH_IMAGES = 10;
// Pièces jointes par message : doit rester aligné avec le `.slice(0, 5)` de app/api/chat/route.ts.
const MAX_CHAT_ATTACHMENTS = 5;

type UsagePlan = "starter";
type UsagePatch = { plan?: UsagePlan; status?: string; trial_active?: boolean };

// `text` (texte extrait à l'upload pour un document PDF/Word) n'est jamais affiché
// dans une bulle : il sert uniquement à être renvoyé tel quel dans le corps de
// /api/chat, qui l'injecte dans le contexte envoyé à l'IA.
// `id` (client-only) et `uploading` servent à afficher un aperçu immédiat pendant
// l'import du fichier vers Cloudinary, avant d'avoir l'URL distante définitive.
type ChatAttachment = { url: string; type: "image" | "video" | "document"; name?: string; text?: string; id?: string; uploading?: boolean };
type ChatMessageItem = { role: string; content: string; imageUrl?: string; attachments?: ChatAttachment[] };
type ChatUsage = { trialActive: boolean; status: string; plan: string; trialEndsAt?: string | null };
type MetaAdAccount = { id: string; name: string | null; is_selected?: boolean; currency?: string | null };
type PinterestAdAccount = { id: string; name: string | null; is_selected?: boolean };
type ChatConversation = { id: string; title: string; created_at: string; updated_at: string };
type ChatApiResponse = {
  message?: ChatMessageItem;
  conversationId?: string;
  error?: string;
  code?: string;
  usage?: { trial_active?: boolean; status: string; plan: string; trial_ends_at?: string | null };
};

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_SALES: "Ventes / conversions",
  OUTCOME_TRAFFIC: "Trafic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_LEADS: "Leads",
  OUTCOME_AWARENESS: "Notoriété",
};

const CURRENCY_OPTIONS: Array<{ code: SupportedCurrency; label: string }> = [
  { code: "XOF", label: "F CFA (XOF)" },
  { code: "USD", label: "Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
];

// Payload structuré que l'IA renvoie juste après la balise [[LANCE_CAMPAGNE]], une fois
// que l'utilisateur a validé le lancement dans le chat. Sert à pré-remplir le formulaire
// de lancement au lieu de faire retaper les infos déjà données pendant la conversation.
type LaunchPayload = {
  name?: string | null;
  objective?: string | null;
  dailyBudget?: number | null;
  currency?: string | null;
  countries?: string[] | null;
  ageMin?: number | null;
  ageMax?: number | null;
  message?: string | null;
  headline?: string | null;
  linkUrl?: string | null;
  storeId?: string | null;
  productId?: string | null;
  durationDays?: number | null;
  platform?: "meta" | "pinterest" | "tiktok" | null;
  callToAction?: string | null;
};

// Le lien de redirection est propre à chaque utilisateur (sa page de vente) : il n'y a
// aucun lien par défaut. On n'accepte qu'une URL http(s) valide, renvoyée normalisée.
function normalizeLinkUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Si l'IA a oublié la devise dans son JSON, on la retrouve dans les messages de
// l'utilisateur (« 2 dollars », « 20 € », « 1000 FCFA »…) plutôt que de supposer XOF.
function guessCurrencyFromMessages(list: ChatMessageItem[]): SupportedCurrency | null {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (item.role !== "user" || typeof item.content !== "string") continue;
    const text = item.content.toLowerCase();
    if (/\$|\busd\b|dollars?/.test(text)) return "USD";
    if (/€|\beur\b|euros?/.test(text)) return "EUR";
    if (/f\s?\.?\s?cfa|\bxof\b|\bxaf\b|\bcfa\b|francs?/.test(text)) return "XOF";
  }
  return null;
}

// Média de la pub : tout ce que l'utilisateur a envoyé dans le chat depuis le dernier bouton de
// lancement. Images : dans l'ordre d'envoi, sans doublon, 10 au plus — une seule = pub classique,
// deux ou plus = carrousel Meta. Vidéo : si l'utilisateur a envoyé une vidéo, c'est elle (la plus
// récente) qui sert de créative, seule — une vidéo ne se combine pas avec un carrousel d'images.
// Le média reste modifiable (images) dans la popup de lancement.
type LaunchMedia = { urls: string[]; kind: "image" | "video" };

function collectLaunchMedia(previous: ChatMessageItem[]): LaunchMedia {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  for (let index = previous.length - 1; index >= 0; index -= 1) {
    const item = previous[index];
    if (item.role !== "user") {
      if (typeof item.content === "string" && item.content.includes(LAUNCH_TAG)) break;
      continue;
    }
    const usable = (item.attachments ?? []).filter((a) => a.url && !a.uploading);
    imageUrls.unshift(...usable.filter((a) => a.type === "image").map((a) => a.url));
    videoUrls.unshift(...usable.filter((a) => a.type === "video").map((a) => a.url));
  }
  const uniqueVideos = Array.from(new Set(videoUrls));
  if (uniqueVideos.length) return { urls: [uniqueVideos[uniqueVideos.length - 1]], kind: "video" };
  return { urls: Array.from(new Set(imageUrls)).slice(0, MAX_LAUNCH_IMAGES), kind: "image" };
}

// Extrait le texte affichable et, si présent, le JSON de lancement d'un message assistant.
// La balise et son JSON ne doivent jamais apparaître dans la bulle de chat.
function parseAssistantMessage(rawContent: string): { content: string; launchPayload: LaunchPayload | null; campaignAction: CampaignActionData | null } {
  let launchPayload: LaunchPayload | null = null;
  let campaignAction: CampaignActionData | null = null;
  const positions = [LAUNCH_TAG, CAMPAIGN_ACTION_TAG].map((tag) => ({ tag, index: rawContent.indexOf(tag) })).filter(({ index }) => index >= 0).sort((a, b) => a.index - b.index);
  const first = positions[0];
  if (!first) return { content: cleanAiText(rawContent, { preserveStrong: true }), launchPayload, campaignAction };
  try {
    // Parse the complete suffix, not a brace regex: ad copy may contain braces.
    const value = JSON.parse(rawContent.slice(first.index + first.tag.length).trim());
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (first.tag === LAUNCH_TAG) launchPayload = value as LaunchPayload;
      else if (typeof value.campaignId === "string" && value.campaignId.trim() && ["edit", "delete", "pause", "activate", "duplicate"].includes(value.action)) campaignAction = { campaignId: value.campaignId, action: value.action };
    }
  } catch { /* malformed or multiple proposals cannot authorize any operation */ }
  const content = rawContent.slice(0, first.index).trim();
  return { content: cleanAiText(content, { preserveStrong: true }), launchPayload, campaignAction };
}

// Suggestions de démarrage : chacune correspond à une capacité réellement disponible
// dans Vendeo AI (verdicts pub, produits, résumé d'activité, génération d'affiche)
// plutôt qu'à des questions génériques qui ne mèneraient nulle part.
type QuickPrompt = { icon: React.ReactNode; label: string; prompt?: string; action?: "poster" };

function formatConversationDate(value: string, locale: "fr" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" });
}

// Envoie un fichier et renvoie la pièce jointe prête à être jointe au message.
// - Images : redimensionnées côté navigateur si elles dépassent la limite de Vercel (~4,5 Mo).
// - Vidéos lourdes : envoyées directement à Cloudinary (comme pour les créatives de campagne).
// - Documents : envoyés au serveur (qui en extrait le texte), limités à 4 Mo.
// Lance une Error avec un message lisible en cas d'échec.
async function uploadChatFile(file: File): Promise<Omit<ChatAttachment, "id" | "uploading">> {
  if (file.type.startsWith("video/") && file.size > SERVER_UPLOAD_LIMIT) {
    const media = await uploadCampaignMedia(file);
    if (typeof media.secure_url !== "string") throw new Error("Impossible d'envoyer cette vidéo.");
    return { url: media.secure_url, type: "video", name: file.name };
  }
  const prepared = file.type.startsWith("image/") ? await prepareChatImage(file) : file;
  if (prepared.size > SERVER_UPLOAD_LIMIT) {
    throw new Error(prepared.type.startsWith("image/") ? "Cette image est trop lourde, choisis-en une plus légère." : "Ce fichier est trop lourd (4 Mo maximum).");
  }
  const data = new FormData();
  data.append("file", prepared);
  const response = await fetch("/api/chat/upload", { method: "POST", body: data });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.url) {
    throw new Error(result.error ?? (response.status === 413 ? "Ce fichier est trop lourd." : "Impossible d'envoyer ce fichier."));
  }
  // `text` (présent seulement pour un document) est conservé pour être renvoyé à /api/chat.
  return { url: result.url, type: result.type, name: result.name, text: result.text };
}

// Rendu d'une pièce jointe (image, vidéo ou document) : factorisé car utilisé à la
// fois dans les bulles de la conversation et dans le composeur. Quand `uploading` est
// vrai (import Cloudinary en cours), un spinner s'affiche par-dessus l'aperçu local.
function AttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  const { t } = useI18n();
  const spinner = attachment.uploading ? <span className="chat-attachment-spinner" aria-hidden="true" /> : null;
  if (attachment.type === "image") {
    return (
      <span className="chat-attachment-media">
        {attachment.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.url} alt="" className="chat-attachment-thumb" />
        ) : (
          <span className="chat-attachment-thumb chat-attachment-thumb-placeholder" />
        )}
        {spinner}
      </span>
    );
  }
  if (attachment.type === "video") {
    return (
      <span className="chat-attachment-media">
        {attachment.url ? (
          <video src={attachment.url} className="chat-attachment-thumb" muted playsInline preload="metadata" controls={!attachment.uploading} />
        ) : (
          <span className="chat-attachment-thumb chat-attachment-thumb-placeholder" />
        )}
        {spinner}
      </span>
    );
  }
  return (
    <span className="chat-attachment-doc">
      <FileText size={14} />
      <span>{attachment.name ?? t("workspaceExtra.document")}</span>
      {spinner}
    </span>
  );
}

export function ChatView({ onGoToSubscription, onUsageChange, onBack, onNavigateSection }: { onGoToSubscription: () => void; onUsageChange: (patch: UsagePatch) => void; onBack?: () => void; onNavigateSection?: (section: ChatNavigationSection) => void }) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [plansRequired, setPlansRequired] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [quickPromptsOpen, setQuickPromptsOpen] = useState(true);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Galerie (photos/vidéos, sélection multiple), documents (PDF/Word) et appareil photo : trois inputs distincts.
  // Mélanger images et PDF dans un seul input ouvre, sur Android, le gestionnaire de fichiers où la
  // sélection multiple demande un appui long : séparés, la galerie native permet de cocher plusieurs photos.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchPayload, setLaunchPayload] = useState<LaunchPayload | null>(null);
  // Média de la pub : la première image est l'image principale, les suivantes forment le carrousel.
  // En mode vidéo (launchMediaKind === "video"), launchImageUrls contient la seule URL de la vidéo.
  const [launchImageUrls, setLaunchImageUrls] = useState<string[]>([]);
  const [launchMediaKind, setLaunchMediaKind] = useState<"image" | "video">("image");
  const [launchLink, setLaunchLink] = useState("");
  const [launchCta, setLaunchCta] = useState<MetaCtaType | "">("");
  const [launchBudget, setLaunchBudget] = useState("");
  const [launchCurrency, setLaunchCurrency] = useState<SupportedCurrency>("XOF");
  const [launching, setLaunching] = useState(false);
  const [launchComplete, setLaunchComplete] = useState(false);
  const launchInFlightRef = useRef(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [metaAccounts, setMetaAccounts] = useState<MetaAdAccount[]>([]);
  const [pinterestAccounts, setPinterestAccounts] = useState<PinterestAdAccount[]>([]);
  const [launchAccountId, setLaunchAccountId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const historyDrawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!historyOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    historyDrawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function handleHistoryKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setHistoryOpen(false);
      }
      if (event.key !== "Tab") return;
      const buttons = historyDrawerRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleHistoryKey);
    return () => {
      document.removeEventListener("keydown", handleHistoryKey);
      document.body.style.overflow = previousOverflow;
      historyToggleRef.current?.focus();
    };
  }, [historyOpen]);
  // Numéro de « session » de conversation : incrémenté à chaque changement de conversation
  // (nouvelle ou ouverte depuis l'historique). Une réponse de l'IA n'est affichée que si la
  // session qui l'a demandée est toujours la session courante — sinon l'ancienne réponse
  // atterrissait dans la nouvelle conversation et laissait le bouton d'envoi bloqué.
  const sessionEpochRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const AI_QUICK_PROMPTS: QuickPrompt[] = [
    { icon: <Rocket size={14} />, label: t("chat.launchSuggestion"), prompt: t("chat.launchSuggestionPrompt") },
    { icon: <Megaphone size={14} />, label: t("chat.qStop"), prompt: t("chat.qStopPrompt") },
    { icon: <TrendingUp size={14} />, label: t("chat.qScale"), prompt: t("chat.qScalePrompt") },
    { icon: <Package size={14} />, label: t("chat.qBest"), prompt: t("chat.qBestPrompt") },
    { icon: <Activity size={14} />, label: t("chat.qSummary"), prompt: t("chat.qSummaryPrompt") },
    { icon: <Target size={14} />, label: t("chat.qNext"), prompt: t("chat.qNextPrompt") },
  ];

  const [bottomNode, setBottomNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Prefill from Overview actions without leaking the prompt in the URL.
    const pending = sessionStorage.getItem(SESSION_STORAGE_PROMPT_KEY);
    if (pending && typeof pending === "string") {
      setInput(pending);
      setQuickPromptsOpen(false);
      sessionStorage.removeItem(SESSION_STORAGE_PROMPT_KEY);
    }
  }, []);

  useEffect(() => {
    // Quitter la vue coupe l'attente d'une réponse en cours.
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    void loadConversations();
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : { subscription: null }))
      .then((data) => {
        const nextUsage = data.subscription
          ? {
              trialActive: Boolean(data.subscription.trial_active),
              status: data.subscription.status,
              plan: data.subscription.plan,
              trialEndsAt: data.subscription.trial_ends_at ?? null,
            }
          : null;
        setUsage(nextUsage);
        // La limite de l'essai gratuit est désormais la date trial_ends_at (5 jours),
        // pas un nombre de messages : le serveur (consume_message_quota) est la seule
        // source de vérité. Côté client on se contente de refléter le statut renvoyé.
        if (nextUsage) setPlansRequired(nextUsage.status === "past_due");
      });
  }, []);

  useEffect(() => {
    // Comptes Meta Ads disponibles, pour laisser choisir lequel financera la pub
    // au moment du lancement (au lieu de toujours prendre le plus récent).
    fetch("/api/integrations/meta/accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((data) => setMetaAccounts(data.accounts ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/integrations/pinterest/accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((data) => setPinterestAccounts(data.accounts ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // Auto-scroll to the latest message.
    if (!bottomNode) return;
    bottomNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, sending, bottomNode]);

  async function loadConversations() {
    try {
      const response = await fetch("/api/conversations");
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.conversations)) setConversations(data.conversations);
    } catch {
      // L'historique est optionnel : une erreur ne bloque pas l'assistant.
    }
  }

  // Change de session : la requête IA en cours (s'il y en a une) est abandonnée côté client
  // — le serveur enregistre quand même la réponse, on la retrouvera en rouvrant la
  // conversation — et le bouton d'envoi est immédiatement débloqué pour la nouvelle session.
  function beginNewSession() {
    sessionEpochRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    return sessionEpochRef.current;
  }

  function startNewConversation() {
    beginNewSession();
    setConversationId(null);
    setMessages([]);
    setExpandedMessages({});
    setQuickPromptsOpen(true);
    setHistoryOpen(false);
  }

  async function openConversation(id: string) {
    const epoch = beginNewSession();
    setConversationId(id);
    setMessages([]);
    setExpandedMessages({});
    setHistoryOpen(false);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
      const data = await response.json().catch(() => ({}));
      if (sessionEpochRef.current !== epoch) return;
      if (!response.ok || !Array.isArray(data.messages)) {
        setMessages([{ role: "assistant", content: t("chat.error") }]);
        return;
      }
      setMessages(data.messages ?? []);
    } catch {
      if (sessionEpochRef.current !== epoch) return;
      setMessages([{ role: "assistant", content: t("chat.error") }]);
    }
  }

  async function send(rawMessage = input) {
    // Pas d'envoi tant qu'un fichier est en cours d'import : sinon l'aperçu local (blob:) partirait au serveur.
    if (uploading) return;
    // Photos/vidéos/documents sans texte : on envoie un message par défaut plutôt que de bloquer l'envoi.
    const message = !rawMessage.trim() && attachments.length ? (attachments.every((a) => a.type === "document") ? t("workspaceExtra.sendDocument") : t("workspaceExtra.sendImages")) : rawMessage;
    if (!message.trim() || sending || plansRequired) return;
    const epoch = sessionEpochRef.current;
    const isCurrentSession = () => sessionEpochRef.current === epoch;
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CHAT_REQUEST_TIMEOUT_MS);
    setSending(true);
    setInput("");
    setQuickPromptsOpen(false);
    const pendingAttachments = attachments;
    setAttachments([]);
    // Les pièces jointes sont intégrées au message affiché immédiatement : sans ça,
    // l'image/vidéo/document tout juste envoyé disparaissait visuellement de la
    // conversation dès l'envoi (il n'était plus ni dans le composeur, ni dans la
    // bulle du message).
    const userMessage: ChatMessageItem = { role: "user", content: message, attachments: pendingAttachments.length ? pendingAttachments : undefined };
    setMessages((current) => [...current, userMessage]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, attachments: pendingAttachments, conversationId, locale }),
        signal: controller.signal,
      });
      // Corps lu en texte puis parsé à la main : si le serveur coupe la requête (timeout de la
      // fonction), la réponse n'est pas du JSON et response.json() jetait une exception qui
      // laissait `sending` à true pour toujours.
      const raw = await response.text().catch(() => "");
      let data: ChatApiResponse = {};
      try {
        data = raw ? (JSON.parse(raw) as ChatApiResponse) : {};
      } catch {
        data = {};
      }
      if (!isCurrentSession()) {
        // L'utilisateur a changé de conversation entre-temps : on n'affiche rien ici,
        // on rafraîchit juste l'historique (la réponse est déjà enregistrée côté serveur).
        void loadConversations();
        return;
      }
      if (response.ok && data.message) {
        setMessages((current) => [...current, data.message as ChatMessageItem]);
        if (data.conversationId) {
          setConversationId(data.conversationId);
          void loadConversations();
        }
        if (data.usage) {
          const nextUsage: ChatUsage = {
            trialActive: Boolean(data.usage.trial_active),
            status: data.usage.status,
            plan: data.usage.plan,
            trialEndsAt: data.usage.trial_ends_at ?? usage?.trialEndsAt ?? null,
          };
          setUsage(nextUsage);
          setPlansRequired(nextUsage.status === "past_due");

          // Sync statut d'abonnement vers le parent (sidebar + page Abonnement)
          onUsageChange({
            plan: nextUsage.plan as UsagePlan,
            status: nextUsage.status,
            trial_active: nextUsage.trialActive,
          });
        }
      } else if (data.code === "PLANS_REQUIRED") {
        setPlansRequired(true);
        setMessages((current) => [...current, { role: "assistant", content: t("chat.trialEndedMessage") }]);
      } else {
        setMessages((current) => [...current, { role: "assistant", content: data.error ?? t("chat.error") }]);
      }
    } catch {
      if (!isCurrentSession()) return;
      setMessages((current) => [
        ...current,
        { role: "assistant", content: timedOut ? t("workspaceExtra.chatTimeout") : t("chat.error") },
      ]);
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
      // On ne débloque le bouton que pour la session qui l'avait bloqué : une ancienne
      // requête qui se termine ne doit pas toucher à l'état de la nouvelle conversation.
      if (isCurrentSession()) setSending(false);
    }
  }

  function resetFileInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (docInputRef.current) docInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleAttach(files: FileList | null) {
    if (!files || !files.length) return;
    // Copie des fichiers AVANT toute remise à zéro des inputs (la FileList est « vivante »).
    const selected = Array.from(files);
    const remaining = MAX_CHAT_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      setUploadError(t("dynamicExtra.maxAttachmentsSimple", { max: (MAX_CHAT_ATTACHMENTS) }));
      resetFileInputs();
      return;
    }
    setUploading(true);
    setUploadError(null);
    const fileList = selected.slice(0, remaining);
    let firstError: string | null = selected.length > remaining ? t("dynamicExtra.maxAttachments", { max: (MAX_CHAT_ATTACHMENTS), kept: (remaining) }) : null;
    // Aperçu immédiat : dès que les fichiers sont choisis (galerie ou caméra), on les
    // ajoute tout de suite au composeur avec un aperçu local (blob) et `uploading: true`,
    // avant même que l'upload ne démarre. Sans ça, il y avait un blanc de
    // quelques secondes où l'utilisateur ne savait pas si sa sélection avait été prise en
    // compte. On remplace ensuite chaque entrée par l'URL distante une fois l'upload fini.
    const pending = fileList.map((file) => {
      const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const type: ChatAttachment["type"] = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document";
      const url = type === "document" ? "" : URL.createObjectURL(file);
      return { file, placeholder: { id, url, type, name: file.name, uploading: true } as ChatAttachment };
    });
    setAttachments((current) => [...current, ...pending.map((p) => p.placeholder)]);

    for (const { file, placeholder } of pending) {
      try {
        const uploaded = await uploadChatFile(file);
        setAttachments((current) => current.map((a) => (a.id === placeholder.id ? { ...uploaded, id: placeholder.id } : a)));
      } catch (error) {
        if (!firstError) firstError = error instanceof Error && error.message ? error.message : t("interfaceExtra.fileUploadFailed");
        setAttachments((current) => current.filter((a) => a.id !== placeholder.id));
      } finally {
        if (placeholder.url) URL.revokeObjectURL(placeholder.url);
      }
    }
    if (firstError) setUploadError(firstError);
    setUploading(false);
    resetFileInputs();
  }

  // Ouvre une popup de confirmation au lieu du formulaire complet : l'IA a déjà
  // collecté toutes les infos dans la conversation, on ne fait que les relire et
  // demander « confirmer et lancer » avant d'envoyer directement sur Meta.
  function openLaunchConfirm(payload: LaunchPayload | null, fallbackMedia?: LaunchMedia) {
    setLaunchPayload(payload);
    setLaunchCta(normalizeMetaCta(payload?.callToAction) ?? "");
    setLaunchImageUrls(fallbackMedia?.urls ?? []);
    setLaunchMediaKind(fallbackMedia?.kind ?? "image");
    // URL du produit résolue par le serveur depuis le catalogue connecté ;
    // le champ reste modifiable dans la confirmation.
    setLaunchLink(payload?.linkUrl ?? "");
    // Budget + devise : montant tel que donné par l'utilisateur, devise reconnue depuis le
    // JSON de l'IA, à défaut depuis les messages de l'utilisateur, à défaut XOF. Les deux
    // restent modifiables dans la popup, et le serveur convertit en dollars.
    setLaunchBudget(payload?.dailyBudget != null ? String(payload.dailyBudget) : "");
    setLaunchCurrency(normalizeCurrency(payload?.currency) ?? guessCurrencyFromMessages(messages) ?? "XOF");
    setLaunchError(null);
    // Compte par défaut : celui marqué is_selected, sinon l'unique compte actif.
    const accounts = payload?.platform === "pinterest" ? pinterestAccounts : metaAccounts;
    setLaunchAccountId(accounts.find((a) => a.is_selected)?.id ?? (accounts.length === 1 ? accounts[0].id : null));
    setLaunchOpen(true);
  }

  async function confirmLaunch() {
    // A ref also blocks a second click before React has rendered the disabled button.
    if (launchInFlightRef.current) return;
    if (!launchPayload?.name || !launchPayload.message) {
      setLaunchError(t("sweep3.text107"));
      return;
    }
    const linkUrl = normalizeLinkUrl(launchLink);
    if (!linkUrl) {
      setLaunchError(t("sweep1.text108"));
      return;
    }
    const dailyBudget = Number(launchBudget.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) {
      setLaunchError(t("optionsExtra.text6"));
      return;
    }
    const payload = launchPayload;
    // Carrousel : réservé à Meta et aux images. La première image est l'image principale, les autres sont les cartes suivantes.
    // Une vidéo est toujours envoyée seule.
    const isPinterest = payload.platform === "pinterest";
    if (!isPinterest && !launchCta) {
      setLaunchError(t("sweep2.text109"));
      return;
    }
    const isVideo = launchMediaKind === "video";
    const carouselUrls = isPinterest || isVideo ? [] : launchImageUrls.slice(1);
    launchInFlightRef.current = true;
    setLaunchComplete(false);
    setLaunching(true);
    setLaunchError(null);
    try {
      const response = await fetch("/api/ai/launch-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          objective: payload.objective,
          // Montant + devise d'origine : le serveur convertit en dollars. Sans `currency`,
          // « 2 $ » était lu comme 2 F CFA et refusé comme inférieur au minimum.
          dailyBudget,
          currency: launchCurrency,
          countries: payload.countries,
          ageMin: payload.ageMin,
          ageMax: payload.ageMax,
          message: payload.message,
          headline: payload.headline,
          linkUrl,
          storeId: payload.storeId ?? undefined,
          productId: payload.productId ?? undefined,
          locale,
          // `imageUrl` porte le média principal, image ou vidéo : `mediaType` dit lequel des deux.
          imageUrl: launchImageUrls[0] ?? undefined,
          mediaType: launchMediaKind,
          carouselUrls: carouselUrls.length ? carouselUrls : undefined,
          platform: payload.platform ?? "meta",
          callToAction: launchCta || undefined,
          durationDays: payload.durationDays ?? 1,
          ...(payload.platform === "pinterest" ? { pinterestAdAccountId: launchAccountId ?? undefined } : { metaAdAccountId: launchAccountId ?? undefined }),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLaunchError(data.error ?? "Impossible de lancer la campagne.");
        return;
      }
      setLaunchComplete(true);
      // Briefly show confirmed 100%, never before the server accepts the request.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      const usdNote = typeof data.dailyBudgetUsd === "number" && launchCurrency !== "USD" ? ` (≈ ${data.dailyBudgetUsd} $)` : "";
      const carouselNote = carouselUrls.length ? t("dynamicExtra.carouselNote", { count: (carouselUrls.length + 1) }) : isVideo ? t("sweep3.text110") : "";
      setMessages((current) => [
        ...current,
        { role: "assistant", content: t("dynamicExtra.campaignLaunched", { name: (payload.name ?? ""), platform: (isPinterest ? "Pinterest" : "Meta"), carousel: (carouselNote), budget: (dailyBudget), currency: (launchCurrency), usd: (usdNote) }) },
      ]);
      setLaunchOpen(false);
    } catch {
      setLaunchError(t("sweep1.text111"));
    } finally {
      launchInFlightRef.current = false;
      setLaunching(false);
      setLaunchComplete(false);
    }
  }

  function copyMessage(index: number, content: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopiedIndex(index);
        window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
      })
      .catch(() => {});
  }

  function handleQuickPrompt(item: QuickPrompt) {
    if (item.prompt) void send(item.prompt);
  }

  const hasConversation = messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  const showFollowups = hasConversation && !sending && !plansRequired && lastMessage?.role !== "user" && Boolean(lastMessage?.content);
  const launchIsPinterest = launchPayload?.platform === "pinterest";
  const launchAccounts = launchIsPinterest ? pinterestAccounts : metaAccounts;

  return (
    <div className="ai-page">
      <section className="app-card chat-card ai-main">
        <div className="chat-header">
          {onBack ? (
            <button type="button" className="chat-back-button" onClick={onBack} aria-label={t("interfaceExtra.back")}>
              <ArrowRight size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
          ) : null}
          <span className="chat-header-avatar" aria-hidden="true"><Sparkles size={17} /></span>
          <div className="chat-header-title">
            <strong>Vendeo AI</strong>
          </div>
          <button ref={historyToggleRef} type="button" className="chat-history-toggle" onClick={() => setHistoryOpen(true)} aria-label={t("chat.history")} title={t("chat.history")} aria-haspopup="dialog" aria-expanded={historyOpen} aria-controls="chat-history-drawer">
            <History size={18} aria-hidden="true" />
            <span>{t("chat.history")}</span>
          </button>
        </div>

        {plansRequired && (
          <div className="trial-banner">
            <strong>{t("chat.trialEnded")}</strong>{" "}
            <button
              className="btn btn-dark"
              onClick={onGoToSubscription}
              style={{ fontSize: 10, padding: "7px 10px", marginLeft: 8 }}
              type="button"
            >
              {t("chat.activate")}
            </button>
          </div>
        )}

        <div className="chat-messages">
          {!hasConversation && (
            <div className="chat-empty-hero">
              <span className="ai-eyebrow">{t("chat.eyebrow")}</span>
              <strong>{t("chat.title")}</strong>
              <p>{t("chat.desc")}</p>
              <div className="ai-action-grid">
                {[
                  { tone: "red", icon: <ShieldAlert size={18} />, title: t("chat.protectTitle"), text: t("chat.protectText"), prompt: t("chat.protectPrompt") },
                  { tone: "green", icon: <TrendingUp size={18} />, title: t("chat.opportunityTitle"), text: t("chat.opportunityText"), prompt: t("chat.opportunityPrompt") },
                  { tone: "blue", icon: <Package size={18} />, title: t("chat.productsTitle"), text: t("chat.productsText"), prompt: t("chat.productsPrompt") },
                ].map((item) => (
                  <button type="button" className={`ai-action-card tone-${item.tone}`} key={item.title} onClick={() => void send(item.prompt)} disabled={sending || plansRequired}>
                    <span className="ai-action-icon">{item.icon}</span>
                    <span className="ai-action-text"><strong>{item.title}</strong><small>{item.text}</small></span>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => {
            const isAssistant = message.role !== "user";
            const navigationTarget = isAssistant ? resolveChatNavigationForAssistantReply(messages, index) : null;
            const { content, launchPayload, campaignAction } = isAssistant
              ? parseAssistantMessage(message.content)
              : { content: message.content, launchPayload: null as LaunchPayload | null, campaignAction: null as CampaignActionData | null };
            const hasLaunchAction = isAssistant && message.content.includes(LAUNCH_TAG);
            const isLong = content.length > 520;
            const expanded = expandedMessages[index] === true;
            // Médias envoyés par l'utilisateur avant ce message (depuis le dernier bouton de lancement) :
            // ils servent de créative par défaut — une seule image = pub classique, plusieurs = carrousel,
            // une vidéo = pub vidéo.
            const launchMedia: LaunchMedia = hasLaunchAction ? collectLaunchMedia(messages.slice(0, index)) : { urls: [], kind: "image" };
            return (
              <div key={index} className={isAssistant ? "chat-bubble assistant" : "chat-bubble user"}>
                {isAssistant && (
                  <span className="chat-bubble-label">
                    <span className="chat-mini-avatar"><Sparkles size={11} /></span> Vendeo AI
                  </span>
                )}
                {message.attachments && message.attachments.length ? (
                  <div className="chat-attachments">
                    {message.attachments.map((attachment, attachmentIndex) => (
                      <AttachmentPreview key={attachmentIndex} attachment={attachment} />
                    ))}
                  </div>
                ) : null}
                {message.imageUrl ? (
                  <div className="chat-image-message">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={message.imageUrl} alt={t("chat.posterTitle")} />
                    <a className="btn btn-ghost" href={message.imageUrl} target="_blank" rel="noreferrer" download>
                      {t("chat.download")}
                    </a>
                  </div>
                ) : null}
                {content ? (
                  <div className={!expanded && isLong ? "chat-message-preview" : undefined}>
                    {isAssistant ? (
                      <AssistantMessageText text={expanded || !isLong ? content : `${content.slice(0, 520).trimEnd()}…`} />
                    ) : (
                      <LinkifiedText text={expanded || !isLong ? content : `${content.slice(0, 520).trimEnd()}…`} />
                    )}
                  </div>
                ) : null}
                {campaignAction ? <CampaignAction data={campaignAction} /> : null}
                {hasLaunchAction ? (
                  <button type="button" className="btn btn-dark chat-launch-action" onClick={() => openLaunchConfirm(launchPayload, launchMedia)}>
                    <Rocket size={15} /> {t("chat.launchNow")}
                  </button>
                ) : null}
                {navigationTarget && onNavigateSection ? <NavigationCard target={navigationTarget} locale={locale} onNavigate={onNavigateSection} /> : null}
                {(isLong || (isAssistant && content)) && (
                  <div className="chat-bubble-actions">
                    {isLong && (
                      <button
                        type="button"
                        className="chat-see-more"
                        onClick={() => setExpandedMessages((current) => ({ ...current, [index]: !expanded }))}
                      >
                        {expanded ? t("chat.seeLess") : t("chat.seeMore")}
                      </button>
                    )}
                    {isAssistant && content && (
                      <button type="button" className="chat-copy" onClick={() => copyMessage(index, content)}>
                        <Copy size={11} /> {copiedIndex === index ? t("chat.copied") : t("chat.copy")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {sending && (
            <div className="chat-bubble assistant chat-typing-bubble">
              <span className="chat-bubble-label">
                <span className="chat-mini-avatar"><Sparkles size={11} /></span> Vendeo AI
              </span>
              <span className="chat-typing">
                <i /><i /><i />
              </span>
            </div>
          )}

          {showFollowups && (
            <div className="chat-followups">
              <button type="button" className="chat-chip" disabled={sending} onClick={() => void send(t("chat.next"))}>{t("chat.next")}</button>
              <button type="button" className="chat-chip" disabled={sending} onClick={() => void send(t("chat.detailPrompt"))}>{t("chat.detail")}</button>
            </div>
          )}

          <div ref={setBottomNode} />
        </div>

        <div className="chat-composer">
          {uploadError ? <p className="chat-upload-error">{localizeSystemMessage(uploadError, locale)}</p> : null}
          {attachments.length ? (
            <div className="chat-attachments">
              {attachments.map((attachment) => (
                <span key={attachment.id ?? attachment.url} className={attachment.uploading ? "chat-attachment-chip chat-attachment-chip-uploading" : "chat-attachment-chip"}>
                  <AttachmentPreview attachment={attachment} />
                  <button type="button" onClick={() => setAttachments((current) => current.filter((a) => a !== attachment))} aria-label={t("interfaceExtra.remove")}>×</button>
                </span>
              ))}
            </div>
          ) : null}
          {(quickPromptsOpen || !hasConversation) && !plansRequired && (
            <div className="chat-quickstart">
              {AI_QUICK_PROMPTS.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className="chat-chip"
                  onClick={() => handleQuickPrompt(item)}
                  disabled={sending}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="chat-input-form"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(event) => void handleAttach(event.target.files)}
            />
            <input
              ref={docInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              hidden
              onChange={(event) => void handleAttach(event.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              hidden
              onChange={(event) => void handleAttach(event.target.files)}
            />
            <details className="chat-attach-menu">
              <summary className="chat-suggest-toggle" aria-label={t("interfaceExtra.attach")} title={t("interfaceExtra.attach")} aria-disabled={uploading || plansRequired}>
                <Plus size={18} />
              </summary>
              <div className="chat-attach-options">
                <button type="button" disabled={uploading || plansRequired} onClick={() => { document.querySelector<HTMLDetailsElement>(".chat-attach-menu")?.removeAttribute("open"); cameraInputRef.current?.click(); }}><Camera size={15} /> {" "}{t("sweep2.text112")}</button>
                <button type="button" disabled={uploading || plansRequired} onClick={() => { document.querySelector<HTMLDetailsElement>(".chat-attach-menu")?.removeAttribute("open"); fileInputRef.current?.click(); }}><Paperclip size={15} /> {" "}{t("sweep3.text113")}</button>
                <button type="button" disabled={uploading || plansRequired} onClick={() => { document.querySelector<HTMLDetailsElement>(".chat-attach-menu")?.removeAttribute("open"); docInputRef.current?.click(); }}><FileText size={15} /> {" "}{t("finalExtra.text5")}</button>
              </div>
            </details>
            <textarea
              disabled={plansRequired}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={plansRequired ? t("chat.placeholderBlocked") : t("chat.placeholder")}
              rows={1}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="submit"
              className="chat-send-button"
              disabled={sending || plansRequired || uploading || (!input.trim() && !attachments.length)}
              aria-label={sending ? t("chat.sending") : t("chat.send")}
            >
              {sending ? <span className="chat-send-dots" aria-hidden="true">…</span> : <ArrowRight size={18} style={{ transform: "rotate(-90deg)" }} />}
            </button>
          </form>
        </div>
      </section>

      {launchOpen ? (
        <div className="chat-launch-modal-backdrop" onClick={() => !launching && setLaunchOpen(false)}>
          <div className="chat-launch-modal" role="dialog" aria-modal="true" aria-labelledby="chat-launch-title" aria-busy={launching} onClick={(event) => event.stopPropagation()}>
            <div className="chat-launch-head">
              <strong id="chat-launch-title"><Rocket size={16} /> {t("chat.launchCampaign")}</strong>
              <button type="button" disabled={launching} onClick={() => setLaunchOpen(false)} aria-label={t("wizardExtra.close")}>×</button>
            </div>
            <p className="chat-launch-question">{t("chat.launchConfirmQuestion")}</p>
            <div className="chat-launch-summary">
              <div className="chat-launch-row"><span>{t("chat.launchName")}</span><strong>{launchPayload?.name ?? "—"}</strong></div>
              <div className="chat-launch-row"><span>{t("chat.launchObjective")}</span><strong>{launchPayload?.objective ? OBJECTIVE_LABELS[launchPayload.objective] ?? launchPayload.objective : "—"}</strong></div>
              <div className="chat-launch-row"><span>{t("chat.launchCountries")}</span><strong>{launchPayload?.countries?.length ? launchPayload.countries.join(", ") : "—"}</strong></div>
              <div className="chat-launch-row"><span>{t("chat.launchAge")}</span><strong>{launchPayload?.ageMin != null || launchPayload?.ageMax != null ? `${launchPayload?.ageMin ?? 18}–${launchPayload?.ageMax ?? 65} ans` : "—"}</strong></div>
              <div className="chat-launch-row chat-launch-message"><span>{t("chat.launchMessage")}</span><strong>{launchPayload?.message ?? "—"}</strong></div>
            </div>
            {launchImageUrls.length === 1 ? (
              <div className="chat-launch-image">
                {launchMediaKind === "video" ? (
                  <video src={launchImageUrls[0]} controls muted playsInline preload="metadata" style={{ maxWidth: "100%", borderRadius: 10 }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={launchImageUrls[0]} alt={t("chat.launchCreative")} />
                )}
              </div>
            ) : null}
            {launchImageUrls.length > 1 ? (
              <div className="chat-launch-image">
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>
                  {launchIsPinterest
                    ? t("dynamicExtra.firstPinterestImage", { count: (launchImageUrls.length) })
                    : t("dynamicExtra.carouselImages", { count: (launchImageUrls.length) })}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {launchImageUrls.map((url, imageIndex) => (
                    <span key={url} style={{ position: "relative", display: "inline-block" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${t("chat.launchCreative")} ${imageIndex + 1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, display: "block" }} />
                      <button
                        type="button"
                        aria-label={t("sweep1.text114")}
                        disabled={launching}
                        onClick={() => setLaunchImageUrls((current) => current.filter((item) => item !== url))}
                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#111", color: "#fff", fontSize: 12, lineHeight: "20px", padding: 0, cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="chat-launch-account">
              <span>{t("chat.launchBudget")} {" "}{t("finalExtra.text6")}</span>
              <span style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={t("optionsExtra.text7")}
                  value={launchBudget}
                  onChange={(event) => setLaunchBudget(event.target.value)}
                  disabled={launching}
                  required
                  style={{ flex: 1, minWidth: 0 }}
                />
                <select value={launchCurrency} onChange={(event) => setLaunchCurrency(event.target.value as SupportedCurrency)} disabled={launching}>
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
              </span>
            </label>
            <label className="chat-launch-account">
              <span>{t("finalExtra.text7")}</span>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder={t("optionsExtra.text8")}
                value={launchLink}
                onChange={(event) => setLaunchLink(event.target.value)}
                disabled={launching}
                required
              />
            </label>
            {!launchIsPinterest ? (
              <label className="chat-launch-account">
                <span>{t("sweep2.text115")}</span>
                <select value={launchCta} onChange={(event) => setLaunchCta(normalizeMetaCta(event.target.value) ?? "")} disabled={launching} required>
                  <option value="">{t("finalExtra.text8")}</option>
                  {META_CTA_TYPES.map((type) => (
                    <option key={type} value={type}>{META_CTA_LABELS[type].fr}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {launchAccounts.length > 0 ? (
              <label className="chat-launch-account">
                <span>{t("chat.launchAccount")}</span>
                {launchAccounts.length > 1 ? (
                  <select value={launchAccountId ?? ""} disabled={launching} onChange={(event) => setLaunchAccountId(event.target.value || null)}>
                    <option value="">{t("chat.launchAccountChoose")}</option>
                    {launchAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name ?? account.id}</option>
                    ))}
                  </select>
                ) : (
                  <span className="chat-launch-account-name">{launchAccounts[0].name ?? launchAccounts[0].id}</span>
                )}
              </label>
            ) : null}
            {launching ? <LaunchProgress complete={launchComplete} /> : null}
            {launchError ? <p className="store-error" role="alert">{localizeSystemMessage(launchError, locale)}</p> : null}
            <div className="chat-launch-actions">
              <button type="button" className="btn btn-ghost" disabled={launching} onClick={() => setLaunchOpen(false)}>{t("chat.cancel")}</button>
              <button type="button" className="btn btn-dark" disabled={launching || !normalizeLinkUrl(launchLink) || (launchPayload?.platform === "meta" && !launchCta)} onClick={() => void confirmLaunch()}>{launching ? t(launchComplete ? "chat.launchSent" : "chat.launchSubmitting") : t("chat.confirmLaunch")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="chat-history-backdrop" onClick={() => setHistoryOpen(false)}>
          <aside ref={historyDrawerRef} id="chat-history-drawer" role="dialog" aria-modal="true" className="chat-history-drawer" onClick={(event) => event.stopPropagation()} aria-label={t("chat.history")}>
            <div className="chat-history-head">
              <strong>{t("chat.history")}</strong>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label={t("wizardExtra.close")}>×</button>
            </div>
            <button type="button" className="chat-history-new" onClick={startNewConversation}>
              <Plus size={15} /> {t("chat.newConversation")}
            </button>
            {conversations.length === 0 ? (
              <p className="chat-history-empty">{t("chat.noConversations")}</p>
            ) : (
              <ul className="chat-history-list">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button type="button" className={conversation.id === conversationId ? "active" : ""} aria-current={conversation.id === conversationId ? "true" : undefined} onClick={() => void openConversation(conversation.id)}>
                      <strong>{conversation.title || t("chat.untitled")}</strong>
                      <small>{formatConversationDate(conversation.updated_at, locale)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
