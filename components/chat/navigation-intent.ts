export const CHAT_NAVIGATION_TARGETS = [
  { section: "Vue d'ensemble", labelFr: "Accueil", labelEn: "Home", routeLabelFr: "Vue d’ensemble", routeLabelEn: "Overview" },
  { section: "Pub", labelFr: "Pub", labelEn: "Ads", routeLabelFr: "Pub", routeLabelEn: "Ads" },
  { section: "Studio", labelFr: "Studio", labelEn: "Studio", routeLabelFr: "Studio", routeLabelEn: "Studio" },
  { section: "Performance visuel", labelFr: "Visuels", labelEn: "Visuals", routeLabelFr: "Performance visuel", routeLabelEn: "Creative performance" },
  { section: "Performance publicitaire", labelFr: "Campagnes", labelEn: "Campaigns", routeLabelFr: "Performance publicitaire", routeLabelEn: "Ad performance" },
  { section: "Vendeo AI", labelFr: "Assistant", labelEn: "Assistant", routeLabelFr: "Vendeo AI", routeLabelEn: "Vendeo AI" },
  { section: "Bénéfices nets", labelFr: "Bénéfices nets", labelEn: "Net profit", routeLabelFr: "Bénéfices nets", routeLabelEn: "Net profit" },
  { section: "Relances WhatsApp", labelFr: "Relances WhatsApp", labelEn: "WhatsApp follow-ups", routeLabelFr: "Relances WhatsApp", routeLabelEn: "WhatsApp follow-ups" },
  { section: "Radar marché", labelFr: "Radar marché", labelEn: "Market radar", routeLabelFr: "Radar marché", routeLabelEn: "Market radar" },
  { section: "Rapports", labelFr: "Rapports", labelEn: "Reports", routeLabelFr: "Rapports", routeLabelEn: "Reports" },
  { section: "Paramètres", labelFr: "Paramètres", labelEn: "Settings", routeLabelFr: "Paramètres", routeLabelEn: "Settings" },
  { section: "Comptes publicitaires", labelFr: "Comptes publicitaires", labelEn: "Ad accounts", routeLabelFr: "Comptes publicitaires", routeLabelEn: "Ad accounts" },
  { section: "Mes boutiques", labelFr: "Boutiques", labelEn: "Stores", routeLabelFr: "Mes boutiques", routeLabelEn: "Stores" },
  { section: "Abonnement", labelFr: "Abonnement", labelEn: "Subscription", routeLabelFr: "Abonnement", routeLabelEn: "Subscription" },
  { section: "Suggestions et notes", labelFr: "Suggestions et notes", labelEn: "Suggestions and feedback", routeLabelFr: "Suggestions et notes", routeLabelEn: "Suggestions and feedback" },
] as const;

export type ChatNavigationTarget = (typeof CHAT_NAVIGATION_TARGETS)[number];
export type ChatNavigationSection = ChatNavigationTarget["section"];

function normalizeQuery(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, " ");
}

const DIRECT_NAVIGATION_REQUEST = /\b(?:ou|where|trouver|retrouver|voir|consulter|ouvrir|acceder|aller|emmener|amener|guider|guide|diriger|mener|lancer|lance|demarrer|montre|show|find|view|open|access|go|launch|navigate|get to|take me)\b/;
const HOW_TO_NAVIGATION_REQUEST = /\b(?:comment|how)\b.*\b(?:trouver|retrouver|voir|consulter|ouvrir|acceder|aller|lancer|find|view|open|access|go|get to|navigate)\b/;
const CREATE_OR_LAUNCH_REQUEST = /\b(?:creer|creation|preparer|lancer|lance|lancement|publier|create|prepare|launch|start)\b/;

function target(section: ChatNavigationSection) {
  return CHAT_NAVIGATION_TARGETS.find((entry) => entry.section === section) ?? null;
}

/**
 * Detecte seulement les demandes d’orientation vers une rubrique connue.
 * Le résultat est une section interne allowlistée, jamais une URL fournie par l’IA.
 */
export function resolveChatNavigationRequest(message: string): ChatNavigationTarget | null {
  if (!message.trim()) return null;
  const query = normalizeQuery(message);
  if (!DIRECT_NAVIGATION_REQUEST.test(query) && !HOW_TO_NAVIGATION_REQUEST.test(query)) return null;

  if (/\b(?:rapports?|reports?)\b/.test(query)) return target("Rapports");
  if (/\b(?:relances?|whatsapp|abandon|recovery)\b/.test(query)) return target("Relances WhatsApp");
  if (/\b(?:radar|market radar)\b/.test(query) && /\b(?:marche|market)\b/.test(query)) return target("Radar marché");
  if (/\b(?:benefices?|profits?|rentabilite|marges?)\b/.test(query)) return target("Bénéfices nets");
  if (/\b(?:parametres?|settings?|preferences?)\b/.test(query)) return target("Paramètres");
  if (/\b(?:comptes? publicitaires?|ad accounts?|ads accounts?)\b/.test(query)) return target("Comptes publicitaires");
  if (/\b(?:abonnement|subscription|billing|plan)\b/.test(query)) return target("Abonnement");
  if (/\b(?:boutiques?|stores?|shops?)\b/.test(query)) return target("Mes boutiques");
  if (/\b(?:suggestions?|feedback|notes?)\b/.test(query)) return target("Suggestions et notes");
  if (/\b(?:vendeo ai|assistant|chat)\b/.test(query)) return target("Vendeo AI");
  if (/\b(?:visuels?|visuals?|creative performance|performance visuel|creations?|creatives?)\b/.test(query)) return target("Performance visuel");
  if (/\b(?:performance publicitaire|ad performance|performances publicitaires)\b/.test(query)) return target("Performance publicitaire");
  if (/\b(?:campagnes?|campaigns?)\b/.test(query)) {
    return target(CREATE_OR_LAUNCH_REQUEST.test(query) ? "Pub" : "Performance publicitaire");
  }
  if (/\b(?:publicite|advertising|ads?)\b/.test(query)) return target("Pub");
  if (/\b(?:studio|creation|create|design)\b/.test(query)) return target("Studio");
  if (/\b(?:accueil|home|overview|tableau de bord|dashboard)\b/.test(query)) return target("Vue d'ensemble");
  return null;
}

/** Resolve a destination only for an assistant message immediately following a navigation question. */
export function resolveChatNavigationForAssistantReply(
  messages: readonly { role: string; content: string }[],
  assistantMessageIndex: number,
): ChatNavigationTarget | null {
  const reply = messages[assistantMessageIndex];
  const question = messages[assistantMessageIndex - 1];
  if (!reply || reply.role === "user" || question?.role !== "user") return null;
  return resolveChatNavigationRequest(question.content);
}
