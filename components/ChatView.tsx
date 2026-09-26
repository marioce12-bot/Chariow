"use client";

import { Activity, ArrowRight, Brain, Clock3, Copy, Lightbulb, Megaphone, Package, ShieldAlert, Sparkles, Target, TrendingUp, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cleanAiText } from "@/lib/ai/format";
import { useI18n } from "@/lib/i18n/i18n";
import "../app/vendeo-ai.css";

// Assistant Vendeo AI : composant autonome (sorti de Dashboard.tsx).
// Les styles de cette mise en page sont dans app/vendeo-ai.css (sélecteurs préfixés .ai-page).
// Contrat de design : voir docs/VENDEO_AI_LAYOUT.md.

const SESSION_STORAGE_PROMPT_KEY = "vendeo_ai_prompt";

type UsagePlan = "starter";
type UsagePatch = { plan?: UsagePlan; status?: string; trial_active?: boolean };

// Sous-ensembles des types de Dashboard.tsx : uniquement les champs lus ici.
type ChatProduct = { id: string; name: string; description: string | null; price: number | string | null; currency: string | null; image: string | null };
type ChatAnalytics = { kpis: { sales: number } } | null;
type MetaPerformance = { currency: string; overview: { spend: number; realRoas: number | null } };

type ChatMessageItem = { role: string; content: string; imageUrl?: string };
type ChatUsage = { trialActive: boolean; status: string; plan: string; trialEndsAt?: string | null };

// Suggestions de démarrage : chacune correspond à une capacité réellement disponible
// dans Vendeo AI (verdicts pub, produits, résumé d'activité, génération d'affiche)
// plutôt qu'à des questions génériques qui ne mèneraient nulle part.
type QuickPrompt = { icon: React.ReactNode; label: string; prompt?: string; action?: "poster" };

export function ChatView({ onGoToSubscription, onUsageChange, onBack, products = [], analytics = null }: { onGoToSubscription: () => void; onUsageChange: (patch: UsagePatch) => void; onBack?: () => void; products?: ChatProduct[]; analytics?: ChatAnalytics }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [plansRequired, setPlansRequired] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [quickPromptsOpen, setQuickPromptsOpen] = useState(true);

  const AI_QUICK_PROMPTS: QuickPrompt[] = [
    { icon: <Megaphone size={14} />, label: t("chat.qStop"), prompt: t("chat.qStopPrompt") },
    { icon: <TrendingUp size={14} />, label: t("chat.qScale"), prompt: t("chat.qScalePrompt") },
    { icon: <Package size={14} />, label: t("chat.qBest"), prompt: t("chat.qBestPrompt") },
    { icon: <Activity size={14} />, label: t("chat.qSummary"), prompt: t("chat.qSummaryPrompt") },
    { icon: <Target size={14} />, label: t("chat.qNext"), prompt: t("chat.qNextPrompt") },
    { icon: <Wand2 size={14} />, label: t("chat.qPoster"), action: "poster" },
  ];

  const POSTER_FORMATS = [
    { id: "square" as const, label: t("chat.fmtPost"), hint: t("chat.fmtPostHint") },
    { id: "story" as const, label: t("chat.fmtStory"), hint: t("chat.fmtStoryHint") },
    { id: "banner" as const, label: t("chat.fmtBanner"), hint: t("chat.fmtBannerHint") },
  ];

  // Générateur d'affiches (Imole) : choix du produit et du format, puis génération
  // d'un visuel publicitaire directement dans la conversation.
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterProductId, setPosterProductId] = useState<string>("");
  const [posterFormat, setPosterFormat] = useState<"square" | "story" | "banner">("square");
  const [posterExtra, setPosterExtra] = useState("");
  const [posterGenerating, setPosterGenerating] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);

  useEffect(() => {
    if (!posterProductId && products.length) setPosterProductId(products[0].id);
  }, [products, posterProductId]);

  // Bande d'indicateurs (ventes / dépenses pub / ROAS) affichée en permanence
  // sous l'en-tête, pour donner du contexte sans avoir à poser de question.
  const [metaPerformance, setMetaPerformance] = useState<MetaPerformance | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const accountsResponse = await fetch("/api/integrations/meta/accounts");
      const accountsData = accountsResponse.ok ? await accountsResponse.json() : { accounts: [] };
      const accounts = accountsData.accounts ?? [];
      if (!accounts[0]) { if (!cancelled) setMetaPerformance(null); return; }
      const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(accounts[0].id)}`);
      if (metrics.ok && !cancelled) setMetaPerformance(await metrics.json());
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const insightCurrency = products[0]?.currency ?? metaPerformance?.currency ?? "XOF";
  const insightFormat = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} ${insightCurrency}`;
  const insightSales = analytics?.kpis.sales ?? 0;
  const insightSpend = metaPerformance?.overview.spend ?? null;
  const insightRoas = metaPerformance?.overview.realRoas ?? null;

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
    fetch("/api/chat")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data) => setMessages(data.messages ?? []));
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
        // La limite de l'essai gratuit est désormais la date trial_ends_at (15 jours),
        // pas un nombre de messages : le serveur (consume_message_quota) est la seule
        // source de vérité. Côté client on se contente de refléter le statut renvoyé.
        if (nextUsage) setPlansRequired(nextUsage.status === "past_due");
      });
  }, []);

  useEffect(() => {
    // Auto-scroll to the latest message.
    if (!bottomNode) return;
    bottomNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, sending, bottomNode]);

  async function send(message = input) {
    if (!message.trim() || sending || plansRequired) return;
    setSending(true);
    setInput("");
    setQuickPromptsOpen(false);
    const userMessage: ChatMessageItem = { role: "user", content: message };
    setMessages((current) => [...current, userMessage]);
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const data = await response.json();
    if (response.ok && data.message) {
      setMessages((current) => [...current, data.message]);
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
    } else {
      if (data.code === "PLANS_REQUIRED") {
        setPlansRequired(true);
        setMessages((current) => [
          ...current,
          { role: "assistant", content: t("chat.trialEndedMessage") },
        ]);
      } else {
        setMessages((current) => [...current, { role: "assistant", content: data.error ?? t("chat.error") }]);
      }
    }
    setSending(false);
  }

  async function generatePoster() {
    const product = products.find((item) => item.id === posterProductId);
    if (!product) {
      setPosterError(t("chat.posterSelect"));
      return;
    }
    setPosterGenerating(true);
    setPosterError(null);
    try {
      const response = await fetch("/api/ai/poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency,
          format: posterFormat,
          extra: posterExtra,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.imageUrl) {
        setPosterError(data.error ?? t("chat.posterError"));
        return;
      }
      setMessages((current) => [...current, { role: "assistant", content: t("chat.posterDone", { name: product.name }), imageUrl: data.imageUrl }]);
      setPosterOpen(false);
      setPosterExtra("");
    } catch {
      setPosterError(t("chat.posterContact"));
    } finally {
      setPosterGenerating(false);
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
    if (item.action === "poster") {
      setPosterOpen(true);
      return;
    }
    if (item.prompt) void send(item.prompt);
  }

  const trialEnds = usage?.trialEndsAt ? new Date(usage.trialEndsAt) : null;
  const trialDaysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000)) : null;
  const statusPillLabel = !usage
    ? null
    : plansRequired
    ? t("chat.statusEnded")
    : usage.trialActive && trialDaysLeft !== null
    ? t("chat.statusTrial", { days: trialDaysLeft })
    : t("chat.statusActive");
  const hasConversation = messages.length > 0;
  const dataLive = Boolean(analytics);
  const lastMessage = messages[messages.length - 1];
  const showFollowups = hasConversation && !sending && !plansRequired && lastMessage?.role !== "user" && Boolean(lastMessage?.content);

  return (
    <div className="ai-page">
      <section className="app-card chat-card ai-main">
        <div className="chat-header">
          {onBack ? (
            <button type="button" className="chat-back-button" onClick={onBack} aria-label="Retour">
              <ArrowRight size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
          ) : null}
          <span className="chat-header-avatar" aria-hidden="true"><Sparkles size={17} /></span>
          <div className="chat-header-title">
            <strong>Vendeo AI</strong>
            <span className="chat-header-status"><i className={dataLive ? "is-live" : ""} />{dataLive ? t("chat.connected") : t("chat.notSynced")}</span>
          </div>
          {statusPillLabel ? (
            <span className={`chat-status-pill ${plansRequired ? "warning" : "positive"}`}>
              <Clock3 size={12} /> {statusPillLabel}
            </span>
          ) : null}
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

        <div className="chat-insights">
          <div className="chat-insight"><small>{t("chat.sales")}</small><strong>{insightSales}</strong></div>
          <div className="chat-insight"><small>{t("chat.spend")}</small><strong>{insightSpend !== null ? insightFormat(insightSpend) : "—"}</strong></div>
          <div className="chat-insight"><small>{t("chat.roas")}</small><strong>{insightRoas !== null ? `${insightRoas.toFixed(2)}x` : "—"}</strong></div>
        </div>

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
            const content = cleanAiText(message.content);
            const isLong = content.length > 520;
            const expanded = expandedMessages[index] === true;
            const isAssistant = message.role !== "user";
            return (
              <div key={index} className={isAssistant ? "chat-bubble assistant" : "chat-bubble user"}>
                {isAssistant && (
                  <span className="chat-bubble-label">
                    <span className="chat-mini-avatar"><Sparkles size={11} /></span> Vendeo AI
                  </span>
                )}
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
                    {expanded || !isLong ? content : `${content.slice(0, 520).trimEnd()}…`}
                  </div>
                ) : null}
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

        {posterOpen ? (
          <div className="poster-generator">
            <div className="poster-generator-head">
              <strong><Wand2 size={15} /> {t("chat.posterTitle")}</strong>
              <button type="button" className="poster-close" aria-label="Fermer" onClick={() => setPosterOpen(false)}>
                <X size={16} />
              </button>
            </div>
            {!products.length ? (
              <p className="hint-line">{t("chat.posterNoProduct")}</p>
            ) : (
              <>
                <div className="poster-body">
                  <div className="poster-fields">
                    <label className="campaign-field">
                      {t("chat.posterProduct")}
                      <select value={posterProductId} onChange={(event) => setPosterProductId(event.target.value)}>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="poster-format-grid">
                      {POSTER_FORMATS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`poster-format-btn ${posterFormat === item.id ? "selected" : ""}`}
                          onClick={() => setPosterFormat(item.id)}
                        >
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </button>
                      ))}
                    </div>
                    <label className="campaign-field">
                      {t("chat.posterMessage")}
                      <textarea rows={2} placeholder={t("chat.posterMessagePh")} value={posterExtra} onChange={(event) => setPosterExtra(event.target.value)} />
                    </label>
                  </div>
                  <div className="poster-preview">
                    {products.find((product) => product.id === posterProductId)?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={products.find((product) => product.id === posterProductId)?.image ?? undefined} alt="" />
                    ) : (
                      <span>{t("chat.posterPreview")}</span>
                    )}
                  </div>
                </div>
                {posterError ? <p className="store-error" role="alert">{posterError}</p> : null}
                <button type="button" className="btn btn-dark" style={{ width: "100%" }} disabled={posterGenerating} onClick={() => void generatePoster()}>
                  {posterGenerating ? t("chat.posterGenerating") : t("chat.posterGenerate")}
                </button>
              </>
            )}
          </div>
        ) : null}

        <div className="chat-composer">
          {(quickPromptsOpen || !hasConversation) && !plansRequired && !posterOpen && (
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
            <button
              type="button"
              className={`chat-poster-toggle${posterOpen ? " active" : ""}`}
              aria-label="Générer une affiche"
              title="Générer une affiche"
              onClick={() => setPosterOpen((open) => !open)}
            >
              <Wand2 size={16} />
            </button>
            {hasConversation && !plansRequired && (
              <button
                type="button"
                className="chat-suggest-toggle"
                aria-label="Suggestions de questions"
                title="Suggestions de questions"
                onClick={() => setQuickPromptsOpen((open) => !open)}
              >
                <Lightbulb size={16} />
              </button>
            )}
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
              disabled={sending || plansRequired || !input.trim()}
              aria-label={sending ? t("chat.sending") : t("chat.send")}
            >
              {sending ? <span className="chat-send-dots" aria-hidden="true">…</span> : <ArrowRight size={18} style={{ transform: "rotate(-90deg)" }} />}
            </button>
          </form>
        </div>
      </section>

      <aside className="ai-side">
        <div className="app-card ai-side-card">
          <div className="card-head">
            <h2>{t("chat.capTitle")}</h2>
            <Brain size={17} />
          </div>
          <ul className="ai-capability-list">
            <li><Megaphone size={14} /> {t("chat.cap1")}</li>
            <li><Package size={14} /> {t("chat.cap2")}</li>
            <li><Wand2 size={14} /> {t("chat.cap3")}</li>
            <li><Activity size={14} /> {t("chat.cap4")}</li>
          </ul>
        </div>
        <div className="app-card ai-side-card">
          <div className="card-head">
            <h2>{t("chat.tipTitle")}</h2>
            <Lightbulb size={17} color="#d28b3d" />
          </div>
          <p className="ai-tip">{t("chat.tipText")}</p>
        </div>
      </aside>
    </div>
  );
}
