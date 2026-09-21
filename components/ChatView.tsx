"use client";

import { Activity, ArrowRight, Brain, Clock3, Copy, Lightbulb, Megaphone, Package, ShieldAlert, Sparkles, Target, TrendingUp, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cleanAiText } from "@/lib/ai/format";
import "../app/vendeo-ai.css";

// Assistant Vendeo AI : composant autonome (sorti de Dashboard.tsx).
// Les styles de cette mise en page sont dans app/vendeo-ai.css (sélecteurs préfixés .ai-page).
// Contrat de design : voir VENDEO_AI_LAYOUT.md.

const SESSION_STORAGE_PROMPT_KEY = "vendeo_ai_prompt";

type UsagePlan = "eco" | "starter" | "premium" | "pro";
type UsagePatch = { plan?: UsagePlan; status?: string; trial_active?: boolean };

// Sous-ensembles des types de Dashboard.tsx : uniquement les champs lus ici.
type ChatProduct = { id: string; name: string; description: string | null; price: number | string | null; currency: string | null; image: string | null };
type ChatAnalytics = { kpis: { sales: number } } | null;
type MetaPerformance = { currency: string; overview: { spend: number; realRoas: number | null } };

type ChatMessageItem = { role: string; content: string; imageUrl?: string };
type ChatUsage = { trialActive: boolean; status: string; plan: string; trialEndsAt?: string | null };

const POSTER_FORMATS: { id: "square" | "story" | "banner"; label: string; hint: string }[] = [
  { id: "square", label: "Post carré", hint: "1080×1080 — Instagram/Facebook" },
  { id: "story", label: "Story", hint: "1080×1920 — Story/Reels" },
  { id: "banner", label: "Bannière", hint: "1200×628 — Publicité Facebook" },
];

// Suggestions de démarrage : chacune correspond à une capacité réellement disponible
// dans Vendeo AI (verdicts pub, produits, résumé d'activité, génération d'affiche)
// plutôt qu'à des questions génériques qui ne mowèneraient nulle part.
type QuickPrompt = { icon: React.ReactNode; label: string; prompt?: string; action?: "poster" };
const AI_QUICK_PROMPTS: QuickPrompt[] = [
  { icon: <Megaphone size={14} />, label: "Pubs à arrêter", prompt: "Quelles publicités dois-je arrêter cette semaine et pourquoi ?" },
  { icon: <TrendingUp size={14} />, label: "Pubs à scaler", prompt: "Quelles campagnes performent le mieux et méritent plus de budget ?" },
  { icon: <Package size={14} />, label: "Meilleur produit", prompt: "Quel est mon produit le plus vendu en ce moment et pourquoi ?" },
  { icon: <Activity size={14} />, label: "Résumé de la semaine", prompt: "Fais-moi un résumé de mes ventes et de mes dépenses publicitaires des 7 derniers jours." },
  { icon: <Target size={14} />, label: "Prochaine action", prompt: "Quelle est la seule action que je dois faire aujourd’hui pour améliorer mes résultats ?" },
  { icon: <Wand2 size={14} />, label: "Générer une affiche", action: "poster" },
];

export function ChatView({ onGoToSubscription, onUsageChange, onBack, products = [], analytics = null }: { onGoToSubscription: () => void; onUsageChange: (patch: UsagePatch) => void; onBack?: () => void; products?: ChatProduct[]; analytics?: ChatAnalytics }) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [plansRequired, setPlansRequired] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [quickPromptsOpen, setQuickPromptsOpen] = useState(true);

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
        // La limite de l'essai gratuit est désormais la date trial_ends_at (7 jours),
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
          { role: "assistant", content: "Ton essai gratuit de 7 jours est terminé. Active ton abonnement pour continuer." },
        ]);
      } else {
        setMessages((current) => [...current, { role: "assistant", content: data.error ?? "Une erreur est survenue." }]);
      }
    }
    setSending(false);
  }

  async function generatePoster() {
    const product = products.find((item) => item.id === posterProductId);
    if (!product) {
      setPosterError("Sélectionne un produit.");
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
        setPosterError(data.error ?? "Impossible de générer l'affiche pour le moment.");
        return;
      }
      setMessages((current) => [...current, { role: "assistant", content: `Affiche générée pour « ${product.name} ».`, imageUrl: data.imageUrl }]);
      setPosterOpen(false);
      setPosterExtra("");
    } catch {
      setPosterError("Impossible de contacter le générateur d'affiches.");
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
    ? "Essai terminé"
    : usage.trialActive && trialDaysLeft !== null
    ? `Essai · ${trialDaysLeft} j`
    : "Abonnement actif";
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
            <span className="chat-header-status"><i className={dataLive ? "is-live" : ""} />{dataLive ? "Données Chariow connectées" : "Chariow non synchronisé"}</span>
          </div>
          {statusPillLabel ? (
            <span className={`chat-status-pill ${plansRequired ? "warning" : "positive"}`}>
              <Clock3 size={12} /> {statusPillLabel}
            </span>
          ) : null}
        </div>

        {plansRequired && (
          <div className="trial-banner">
            <strong>Ton essai gratuit est terminé.</strong>{" "}
            <button
              className="btn btn-dark"
              onClick={onGoToSubscription}
              style={{ fontSize: 10, padding: "7px 10px", marginLeft: 8 }}
              type="button"
            >
              Activer l’abonnement
            </button>
          </div>
        )}

        <div className="chat-insights">
          <div className="chat-insight"><small>Ventes</small><strong>{insightSales}</strong></div>
          <div className="chat-insight"><small>Dépenses pub</small><strong>{insightSpend !== null ? insightFormat(insightSpend) : "—"}</strong></div>
          <div className="chat-insight"><small>ROAS réel</small><strong>{insightRoas !== null ? `${insightRoas.toFixed(2)}x` : "—"}</strong></div>
        </div>

        <div className="chat-messages">
          {!hasConversation && (
            <div className="chat-empty-hero">
              <span className="ai-eyebrow">Centre de décision</span>
              <strong>Que veux-tu comprendre aujourd’hui ?</strong>
              <p>Vendeo croise tes ventes, tes pubs et ta rentabilité pour te dire quoi faire ensuite.</p>
              <div className="ai-action-grid">
                {[
                  { tone: "red", icon: <ShieldAlert size={18} />, title: "Protéger ma marge", text: "Repérer les pubs qui brûlent du budget", prompt: "Où est-ce que je perds de l'argent cette semaine ?" },
                  { tone: "green", icon: <TrendingUp size={18} />, title: "Trouver une opportunité", text: "Voir ce qui mérite plus d’attention", prompt: "Quelle est ma meilleure opportunité cette semaine ?" },
                  { tone: "blue", icon: <Package size={18} />, title: "Comprendre mes produits", text: "Voir ce qui se vend vraiment", prompt: "Quels produits se vendent le mieux et pourquoi ?" },
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
                    <img src={message.imageUrl} alt="Affiche générée" />
                    <a className="btn btn-ghost" href={message.imageUrl} target="_blank" rel="noreferrer" download>
                      Télécharger
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
                        {expanded ? "Voir moins" : "Voir plus"}
                      </button>
                    )}
                    {isAssistant && content && (
                      <button type="button" className="chat-copy" onClick={() => copyMessage(index, content)}>
                        <Copy size={11} /> {copiedIndex === index ? "Copié" : "Copier"}
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
              <button type="button" className="chat-chip" disabled={sending} onClick={() => void send("Que dois-je faire ensuite ?")}>Que faire ensuite ?</button>
              <button type="button" className="chat-chip" disabled={sending} onClick={() => void send("Peux-tu détailler ta réponse précédente avec plus de contexte ?")}>Détailler</button>
            </div>
          )}

          <div ref={setBottomNode} />
        </div>

        {posterOpen ? (
          <div className="poster-generator">
            <div className="poster-generator-head">
              <strong><Wand2 size={15} /> Générer une affiche</strong>
              <button type="button" className="poster-close" aria-label="Fermer" onClick={() => setPosterOpen(false)}>
                <X size={16} />
              </button>
            </div>
            {!products.length ? (
              <p className="hint-line">Connecte une boutique avec au moins un produit pour générer une affiche.</p>
            ) : (
              <>
                <div className="poster-body">
                  <div className="poster-fields">
                    <label className="campaign-field">
                      Produit
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
                      Message ou hook (optionnel)
                      <textarea rows={2} placeholder="Ex : Livraison offerte ce week-end" value={posterExtra} onChange={(event) => setPosterExtra(event.target.value)} />
                    </label>
                  </div>
                  <div className="poster-preview">
                    {products.find((product) => product.id === posterProductId)?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={products.find((product) => product.id === posterProductId)?.image ?? undefined} alt="" />
                    ) : (
                      <span>Aperçu de l’affiche généré ici</span>
                    )}
                  </div>
                </div>
                {posterError ? <p className="store-error" role="alert">{posterError}</p> : null}
                <button type="button" className="btn btn-dark" style={{ width: "100%" }} disabled={posterGenerating} onClick={() => void generatePoster()}>
                  {posterGenerating ? "Génération en cours…" : "Générer l’affiche"}
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
              placeholder={plansRequired ? "Active ton abonnement pour continuer" : "Pose ta question..."}
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
              aria-label={sending ? "Envoi en cours" : "Envoyer"}
            >
              {sending ? <span className="chat-send-dots" aria-hidden="true">…</span> : <ArrowRight size={18} style={{ transform: "rotate(-90deg)" }} />}
            </button>
          </form>
        </div>
      </section>

      <aside className="ai-side">
        <div className="app-card ai-side-card">
          <div className="card-head">
            <h2>Ce que Vendeo AI sait faire</h2>
            <Brain size={17} />
          </div>
          <ul className="ai-capability-list">
            <li><Megaphone size={14} /> Dire explicitement quelle pub arrêter ou scaler, avec le montant à l’appui</li>
            <li><Package size={14} /> Identifier ton produit le plus vendu à partir des ventes Chariow</li>
            <li><Wand2 size={14} /> Générer une affiche produit prête à publier</li>
            <li><Activity size={14} /> Résumer ton activité récente en langage simple</li>
          </ul>
        </div>
        <div className="app-card ai-side-card">
          <div className="card-head">
            <h2>Astuce</h2>
            <Lightbulb size={17} color="#d28b3d" />
          </div>
          <p className="ai-tip">Sois précis dans tes questions. Plutôt que « comment ça va ? », essaie « quelle campagne perd de l’argent cette semaine ? ».</p>
        </div>
      </aside>
    </div>
  );
}
