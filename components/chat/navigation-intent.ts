export const CHAT_NAVIGATION_TARGETS = [
  { section: "Vue d'ensemble", labelFr: "Accueil", labelEn: "Home", routeLabelFr: "Vue d’ensemble", routeLabelEn: "Overview" },
  { section: "Pub", labelFr: "Pub", labelEn: "Ads", routeLabelFr: "Pub", routeLabelEn: "Ads" },
  { section: "Studio", labelFr: "Studio", labelEn: "Studio", routeLabelFr: "Studio", routeLabelEn: "Studio" },
  { section: "Performance publicitaire", labelFr: "Recommandation", labelEn: "Recommendations", routeLabelFr: "Recommandation", routeLabelEn: "Recommendations" },
  { section: "Vendeo AI", labelFr: "Assistant", labelEn: "Assistant", routeLabelFr: "Assistant", routeLabelEn: "Assistant" },
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

const WHERE_NAVIGATION_DETAIL = /\b(?:est|sont|se trouve|situe|trouver|retrouver|voir|consulter|ouvrir|acceder|aller|creer|lancer|gerer|manage|find|view|open|access|go|navigate|create|launch)\b/;
const HOW_TO_NAVIGATION_REQUEST = /\b(?:comment|how)\b.*\b(?:trouver|retrouver|voir|consulter|ouvrir|acceder|aller|gerer|manage|find|view|open|access|go|get to|navigate|create|creer|launch|lancer)\b/;
const DIRECT_NAVIGATION_COMMAND = /^(?:montre(?:-moi|\s+moi)?|show\s+me|ouvre|open|va\s+(?:a|au|aux|vers)|go\s+to|guide(?:-moi|\s+moi)?|emmene(?:-moi|\s+moi)?|amene(?:-moi|\s+moi)?|take\s+me|navigate\s+to)\b/;
const CREATE_OR_LAUNCH_REQUEST = /\b(?:creer|creation|preparer|lancer|lance|lancement|publier|create|prepare|launch|start)\b/;

function target(section: ChatNavigationSection) {
  return CHAT_NAVIGATION_TARGETS.find((entry) => entry.section === section) ?? null;
}

function explicitlyAsksForNavigation(message: string, query: string) {
  const hasWhereWord = /(?:^|[^\p{L}])(?:où|where)(?=$|[^\p{L}])/iu.test(message);
  const asksWhere = hasWhereWord && WHERE_NAVIGATION_DETAIL.test(query);
  // Accepte « Ou voir… » sans accent seulement en début de message, pour ne pas
  // confondre « ou » (la conjonction) avec « où » dans une phrase ordinaire.
  const asksWhereWithoutAccent = /^\s*ou\b/i.test(message) && WHERE_NAVIGATION_DETAIL.test(query);
  return asksWhere || asksWhereWithoutAccent || HOW_TO_NAVIGATION_REQUEST.test(query) || DIRECT_NAVIGATION_COMMAND.test(query);
}

/**
 * Detecte seulement les demandes explicites d’orientation vers une rubrique connue.
 * Le résultat est une section interne allowlistée, jamais une URL fournie par l’IA.
 */
export function resolveChatNavigationRequest(message: string): ChatNavigationTarget | null {
  if (!message.trim()) return null;
  const query = normalizeQuery(message);
  if (!explicitlyAsksForNavigation(message, query)) return null;

  if (/\b(?:rapports?|reports?)\b/.test(query)) return target("Rapports");
  if (/\b(?:radar|market radar)\b/.test(query) && /\b(?:marche|market)\b/.test(query)) return target("Radar marché");
  if (/\b(?:parametres?|settings?|preferences?)\b/.test(query)) return target("Paramètres");
  if (/\b(?:comptes? publicitaires?|ad accounts?|ads accounts?)\b/.test(query)) return target("Comptes publicitaires");
  if (/\b(?:abonnement|subscription|billing|plan)\b/.test(query)) return target("Abonnement");
  if (/\b(?:boutiques?|stores?|shops?)\b/.test(query)) return target("Mes boutiques");
  if (/\b(?:suggestions?|feedback|notes?)\b/.test(query)) return target("Suggestions et notes");
  if (/\b(?:vendeo ai|assistant|chat)\b/.test(query)) return target("Vendeo AI");
  if (/\b(?:recommandations?|recommendations?)\b/.test(query)) return target("Performance publicitaire");
  if (/\b(?:performance publicitaire|ad performance|performances publicitaires)\b/.test(query)) return target("Performance publicitaire");
  if (/\b(?:campagnes?|campaigns?)\b/.test(query)) {
    return target(CREATE_OR_LAUNCH_REQUEST.test(query) ? "Pub" : "Performance publicitaire");
  }
  if (/\b(?:visuels?|visuals?|creations?|creatives?|studio|create|design)\b/.test(query)) return target("Studio");
  if (/\b(?:publicite|advertising|ads?)\b/.test(query)) return target("Pub");
  if (/\b(?:accueil|home|overview|tableau de bord|dashboard)\b/.test(query)) return target("Vue d'ensemble");
  return null;
}

/** Resolve a destination only for an assistant message immediately following an explicit navigation request. */
export function resolveChatNavigationForAssistantReply(
  messages: readonly { role: string; content: string }[],
  assistantMessageIndex: number,
): ChatNavigationTarget | null {
  const reply = messages[assistantMessageIndex];
  const question = messages[assistantMessageIndex - 1];
  if (!reply || reply.role === "user" || question?.role !== "user") return null;
  return resolveChatNavigationRequest(question.content);
}
