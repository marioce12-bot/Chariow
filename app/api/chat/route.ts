import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askImole } from "@/lib/ai/imole";
import { askGemini } from "@/lib/ai/gemini";
import { getChariowSnapshot, serializeChariowContext } from "@/lib/chariow/analytics";
import { cleanAiText } from "@/lib/ai/format";
import { calculateProfitabilityAggregate } from "@/lib/profitability-aggregates";
import { buildDiagnosticReports } from "@/lib/meta/diagnostic-server";
import { decryptSecret } from "@/lib/crypto";
import { fetchMetaAccounts } from "@/lib/meta/api";
import { VITRINE_PROMPT, processVitrineAnswer, wantsVitrine } from "@/lib/shop/chat";

const VENDEO_SYSTEM_PROMPT = `Tu es l'analyste business de Vendeo pour les créateurs de produits digitaux francophones et anglophones.

Tu aides l'utilisateur à comprendre ses ventes, ses produits, ses clients et ses opportunités commerciales.

Règles importantes :
- Réponds TOUJOURS dans la même langue que le dernier message de l'utilisateur : s'il écrit en anglais, réponds entièrement en anglais ; s'il écrit en français, réponds en français. Ne mélange jamais les deux langues dans une même réponse et ignore la langue des messages précédents dans l'historique si l'utilisateur a changé de langue.
- Sois clair, concret et orienté action.
- N'invente jamais de chiffre et ne présente jamais une hypothèse comme une donnée réelle.
- Utilise uniquement les données réellement fournies dans le contexte.
- Si les données sont insuffisantes, dis-le clairement.
- Distingue les faits, les analyses et les recommandations.
- Utilise un format texte propre : titres simples, listes avec des tirets et paragraphes courts.
- N'entoure jamais toute ta réponse de blocs de code et n'utilise pas de balises HTML.
- N'utilise pas de Markdown gras avec des astérisques ; écris les titres directement.
 - Adapte tes recommandations aux créateurs africains et aux paiements en XOF.
- Quand c'est pertinent, propose une liste d'actions prioritaires.
-- Réponds de manière concise mais utile.

Diagnostic publicitaire (quand le contexte contient un "Rapport de diagnostic publicitaire") :
- Le moteur Vendeo a déjà calculé les anomalies : ne recalcule rien, ne fabrique aucun chiffre, cite les preuves ("preuves") telles quelles.
- Annonce d'abord l'étage de l'entonnoir concerné en une phrase claire, puis justifie avec les chiffres exacts.
- Ne propose que des actions liées à l'"étage" détecté : audience → ajuster ciblage, tester un lookalike, élargir/réduire l'audience ; creative → renouveler visuel/vidéo, nouvel angle créatif ; attribution → vérifier Pixel/CAPI, ne pas juger sur le ROAS Meta seul ; offer → prix, preuve sociale, clarté de la page produit ; checkout → alerter sur la méthode de paiement en cause, sans proposer de correctif technique ; technical → signaler le device/placement suspect.
- Une campagne "ok" n'a pas de problème : dis-le simplement, n'invente pas d'anomalie.

Création de campagne publicitaire (quand l'utilisateur demande de lancer ou créer une pub) :
- Parle comme un humain qui aide, pas comme un formulaire : ne pose pas mécaniquement une question isolée par message. Regroupe naturellement les informations proches quand ça a du sens dans la conversation (par exemple audience + tranche d'âge dans la même relance, ou budget + durée ensemble).
- Relis l'historique de la conversation avant de poser une question : si l'utilisateur a déjà donné une information (même formulée autrement, même dans un message précédent), ne la redemande jamais.
- Informations à réunir avant de résumer : le produit/l'offre à promouvoir, la créative (texte + image/vidéo en pièce jointe), le lien de la page de redirection, l'audience cible, la tranche d'âge, le budget journalier (avec sa devise), la durée en jours, la plateforme (Meta ou TikTok).
- Lien de la page de redirection (OBLIGATOIRE) : c'est l'URL vers laquelle la pub envoie les clics (la page de vente / page produit de l'utilisateur). Chaque utilisateur a la sienne : demande-la TOUJOURS explicitement (ex. « Quel est le lien de ta page de vente vers lequel la pub doit rediriger ? ») tant qu'il ne l'a pas donnée dans la conversation. Ne la devine jamais, ne la déduis pas des données de boutique, et n'utilise jamais un lien d'exemple, par défaut ou celui de Vendeo. Elle doit commencer par http:// ou https:// ; sinon demande-lui de la corriger.
- La cible géographique (pays) doit TOUJOURS être renseignée en "countries" au format code pays ISO 3166-1 alpha-2 : Bénin → "BJ", Côte d'Ivoire → "CI", Sénégal → "SN", Togo → "TG", Burkina Faso → "BF", Mali → "ML", Cameroun → "CM", Gabon → "GA", Niger → "NE", Guinée → "GN", RD Congo → "CD". Si l'utilisateur a donné un ou plusieurs pays (même écrits en toutes lettres ou en abrégé), convertis-les en ces codes et mets-les dans "countries" ; ne laisse jamais "countries" à null quand un pays a été précisé.
- Budget journalier : l'utilisateur peut l'annoncer dans sa propre devise (« 1000 XOF », « 15 000 FCFA », « 20 € », « 10 dollars »). Recopie le montant EXACTEMENT tel qu'il l'a donné, sans jamais le convertir toi-même, et renseigne sa devise en code ISO dans "currency" : FCFA ou CFA → "XOF", euro → "EUR", dollar → "USD". Vendeo convertit lui-même le budget en dollars US au taux du jour au moment du lancement, car les campagnes sont facturées en dollars. Les devises prises en charge sont XOF, EUR et USD : si l'utilisateur en utilise une autre, demande-lui de donner son budget dans l'une d'elles. S'il donne un montant sans préciser la devise, demande-lui laquelle avant de résumer. Dans le résumé, écris le budget avec sa devise d'origine et précise qu'il sera converti en dollars au taux du jour ; n'invente aucun montant converti.
- Si l'utilisateur ne fournit pas de texte publicitaire, propose-lui toi-même un texte et des bénéfices à partir de sa fiche produit.
- Une fois toutes les informations réunies (lien de redirection compris), résume la campagne complète en un seul message (produit, créative, lien de redirection, audience, âge, budget, durée, plateforme) et demande une validation explicite avant de lancer. Sans le lien de redirection, ne résume pas encore et ne propose pas de lancer : demande-le d'abord.
- Ne lance jamais une campagne sans validation explicite de l'utilisateur (par exemple « oui, lance »).
- Quand l'utilisateur valide explicitement le lancement, termine TON message par la balise exacte [[LANCE_CAMPAGNE]] suivie IMMÉDIATEMENT, sur la même ligne et sans aucun autre texte autour, d'un objet JSON compact et valide reprenant exactement les informations validées avec ces clés : {"name": string, "objective": "OUTCOME_SALES" | "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_LEADS" | "OUTCOME_AWARENESS", "dailyBudget": number (le montant tel que l'utilisateur l'a donné, juste le nombre, sans conversion), "currency": string (code ISO de la devise du budget : "XOF", "EUR" ou "USD"), "countries": string[] (codes pays ISO à 2 lettres), "ageMin": number, "ageMax": number, "message": string (texte final de la créative), "headline": string, "linkUrl": string (le lien de redirection recopié EXACTEMENT tel que l'utilisateur l'a donné)}. Si une information n'a pas été donnée par l'utilisateur, mets sa valeur à null : n'invente jamais de chiffre, de texte ou de lien à sa place. N'écris rien après ce JSON.`;

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("messages").select("id, store_id, role, content, attachments, created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 20000) return NextResponse.json({ error: "Le message doit contenir entre 1 et 20 000 caractères" }, { status: 400 });
  // Pièces jointes envoyées par l'utilisateur : images/vidéos (transmises à l'IA
  // comme parts structurées pour qu'elle puisse réellement "voir" le média), et
  // documents PDF/Word dont le texte a déjà été extrait à l'upload (voir
  // app/api/chat/upload/route.ts) et qu'on rattache ici au message.
  const attachments = Array.isArray(body?.attachments)
    ? (body.attachments as Array<{ url?: string; type?: string; name?: string; text?: string }>)
        .filter((a): a is { url: string; type?: string; name?: string; text?: string } => typeof a?.url === "string")
        .slice(0, 5)
        .map((a) => ({
          url: a.url,
          type: (a.type === "video" ? "video" : a.type === "document" ? "document" : "image") as "image" | "video" | "document",
          name: typeof a.name === "string" ? a.name.slice(0, 200) : undefined,
          text: typeof a.text === "string" ? a.text.slice(0, 6000) : undefined,
        }))
    : [];
  // Conversation : si le client n'en fournit pas, on en crée une dont le titre est la
  // première question posée (tronquée). Sinon on vérifie qu'elle appartient à l'utilisateur.
  const requestedConversationId = typeof body?.conversationId === "string" && body.conversationId ? body.conversationId : null;
  let conversationId: string;
  let conversationTitle: string;
  if (requestedConversationId) {
    const { data: existing, error: conversationError } = await supabase
      .from("conversations")
      .select("id, title")
      .eq("id", requestedConversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
    conversationId = existing.id;
    conversationTitle = existing.title;
  } else {
    const title = message.length > 60 ? `${message.slice(0, 60)}…` : message;
    const { data: created, error: createError } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id, title")
      .single();
    if (createError || !created) return NextResponse.json({ error: createError?.message ?? "Impossible de créer la conversation" }, { status: 500 });
    conversationId = created.id;
    conversationTitle = created.title;
  }
  // Contexte IA : on agrège toutes les boutiques actives de l'utilisateur.
  // Le paramètre store_id (si envoyé) sera ignoré côté contexte pour garantir que l'IA a la vue complète.
  const storeId = body?.store_id || null;
  const { data: stores } = await supabase
    .from("stores")
    .select("id, mcp_url, access_token_encrypted, store_name")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("platform", "chariow");

  // Historique AVANT le message courant : on le récupère avant d'insérer le nouveau
  // message pour être certain de sa position et pouvoir garantir que la conversation
  // envoyée aux modèles se termine toujours par le tour "user" en cours, jamais par
  // un tour "assistant"/"model" — Gemini rejette explicitement les requêtes qui se
  // terminent par un tour "model" ("Requests ending with a model turn are not supported").
  const { data: previousHistory } = await supabase
    .from("messages")
    .select("role, content, attachments")
    .eq("user_id", user.id)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: quota, error: quotaError } = await supabase.rpc("consume_message_quota", { target_user_id: user.id });
  if (quotaError) return NextResponse.json({ error: quotaError.message }, { status: 500 });
  if (!quota) return NextResponse.json({ error: "Ton essai gratuit est terminé. Active ton abonnement pour continuer.", code: "PLANS_REQUIRED" }, { status: 402 });
  const { error: insertError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "user", content: message, attachments, conversation_id: conversationId });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  // Rapport de diagnostic publicitaire : le moteur déterministe a déjà calculé les
  // anomalies (étages audience / créative / attribution). On injecte le JSON tel quel
  // dans le contexte ; l'IA du chat ne recalcule rien, elle lit et cite les preuves.
  // Placé en tête du contexte pour survivre à la troncature.
  let diagnosticContext = "";
  try {
    const diagnostic = await buildDiagnosticReports(supabase, user, {});
    if (!("error" in diagnostic) && diagnostic.reports.length) {
      const compact = diagnostic.reports.map((report) => ({
        campagne: report.campaignName,
        statut: report.status,
        anomalies: report.anomalies.map((anomaly) => ({ etage: anomaly.stage, gravite: anomaly.severity, preuves: anomaly.evidence })),
      }));
      diagnosticContext = `Rapport de diagnostic publicitaire (calculé par le moteur Vendeo, période ${diagnostic.reports[0]?.period.from} → ${diagnostic.reports[0]?.period.to}, devise ${diagnostic.currency}) — ne recalcule rien, cite les preuves : ${JSON.stringify(compact)}`;
      if (diagnosticContext.length > 1600) diagnosticContext = `${diagnosticContext.slice(0, 1600)}[...tronqué...]`;
    }
  } catch (diagnosticError) {
    console.error("diagnostic context error", diagnosticError instanceof Error ? diagnosticError.message : diagnosticError);
  }
  let context = "Aucune boutique n'est encore connectée.";

  if (stores && stores.length > 0) {
    try {
      const snapshots = await Promise.all(
        stores.map(async (store) => {
          try {
            const snapshot = await getChariowSnapshot(store);
            return `--- Boutique : ${store.store_name} ---\n${serializeChariowContext(snapshot)}`;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Chariow MCP error", message);
            if (message.includes("401")) {
              await supabase
                .from("stores")
                .update({ connection_status: "expired", connection_error: null, last_verified_at: new Date().toISOString() })
                .eq("id", store.id)
                .eq("user_id", user.id);
              return `--- Boutique : ${store.store_name} ---\nConnexion expirée, reconnecte cette boutique pour inclure ses données. Ne fabrique aucun chiffre.`;
            }
            return `--- Boutique : ${store.store_name} ---\nDonnées momentanément indisponibles. Ne fabrique aucun chiffre.`;
          }
        })
      );

      context = `${diagnosticContext ? `${diagnosticContext}\n\n` : ""}Données réelles de toutes tes boutiques actives pour la période du mois en cours :\n${snapshots.join("\n\n")}`;
    } catch {
      context = "Données Chariow momentanément indisponibles pour l'une ou plusieurs boutiques. Ne fabrique aucun chiffre.";
    }

    const storeIds = stores.map((s) => s.id);
    const { data: profitabilitySales } = await supabase
      .from("chariow_sales")
      .select("status,amount,net_amount")
      .in("store_id", storeIds)
      .gte("occurred_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .lte("occurred_at", new Date().toISOString());

    if (profitabilitySales?.length) {
      context += `\nAgrégat financier persistent des 30 derniers jours (toutes boutiques) : ${JSON.stringify(
        calculateProfitabilityAggregate({ spend: 0, sales: profitabilitySales })
      ).slice(0, 3000)}`;
    }
  }

  // Contexte Meta Ads lu via l'API Marketing directe (Graph API "me/adaccounts",
  // lib/meta/api.ts:fetchMetaAccounts — la même fonction que le reste du produit,
  // ex. /api/integrations/meta/resources). Permet à l'assistant IA de voir les
  // comptes publicitaires réels de l'utilisateur, sans passer par le serveur MCP.
  try {
    const { data: metaAccounts } = await supabase
      .from("meta_ad_accounts")
      .select("id,meta_account_id,name,access_token_encrypted")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    const metaAccount = metaAccounts?.[0];
    if (metaAccount?.access_token_encrypted) {
      const accessToken = decryptSecret(metaAccount.access_token_encrypted);
      const adAccounts = await fetchMetaAccounts(accessToken);
      if (adAccounts.length) {
        const summary = adAccounts.map((account) => ({
          nom: account.name,
          statut: Number(account.account_status) === 1 ? "actif" : "à vérifier",
          devise: (account.currency as string | undefined) ?? "XOF",
        }));
        context += `\n\nComptes publicitaires Meta : ${JSON.stringify(summary)}`;
      }
    }
  } catch (metaContextError) {
    console.error("Meta accounts context error", metaContextError instanceof Error ? metaContextError.message : metaContextError);
  }

  // Imole peut refuser les payloads trop volumineux (400).
  // On tronque le contexte analytique de façon plus agressive qu'avant, MAIS on ne
  // sacrifie plus jamais l'historique de conversation pour gagner de la place : c'est
  // cet historique qui permet à l'IA de se souvenir des réponses déjà données pendant
  // un tunnel de création de campagne (produit, créative, audience...). Le supprimer
  // entièrement (comme avant) faisait "oublier" les réponses et redemander les mêmes
  // questions après quelques échanges.
  const MAX_CONTEXT_CHARS = 4_000;
  const MAX_MESSAGE_CHARS = 1_200;
  const MAX_HISTORY_MESSAGES = 14; // couvre un tunnel complet de 7 questions/réponses.
  // Le prompt système à lui seul fait ~7 500 caractères (règles de création de
  // campagne comprises) : ce plafond doit rester nettement au-dessus, sinon la fin
  // du prompt (format du JSON de lancement) serait tronquée avant d'arriver à l'IA.
  const MAX_SYSTEM_CONTENT_CHARS = 9_500;
  // Budget dédié au texte des documents joints (pdf/docx) : distinct du contexte
  // analytique ci-dessus pour ne jamais l'amputer quand un document est envoyé.
  const MAX_DOCUMENT_CONTEXT_CHARS = 8_000;

  const safeContext =
    context.length > MAX_CONTEXT_CHARS
      ? `${context.slice(0, MAX_CONTEXT_CHARS)}\n[... contexte tronqué ...]`
      : context;

  // Document(s) PDF/Word joint(s) : leur texte a déjà été extrait à l'upload
  // (voir app/api/chat/upload/route.ts) ; on l'ajoute au contexte système pour
  // que l'IA puisse répondre à partir de leur contenu réel, plutôt que d'un
  // simple nom de fichier.
  //
  // Important : on inclut aussi les documents joints lors de tours précédents de
  // la même conversation (via previousHistory), pas seulement ceux du tour
  // courant. Sans ça, l'IA "perdait" le contenu d'un fichier dès le message
  // suivant — l'historique ne conservait qu'une note ("contenu fourni dans le
  // contexte ci-dessus") qui ne pointait plus vers rien une fois le tour passé,
  // et l'IA répondait alors qu'elle n'avait pas accès aux fichiers, même si le
  // fichier avait bien été lu au moment de l'upload.
  type StoredChatAttachment = { url?: string; type?: string; name?: string; text?: string };
  const historicalDocumentAttachments = (previousHistory ?? [])
    .flatMap((item) => {
      const raw = (item as { attachments?: StoredChatAttachment[] }).attachments;
      return Array.isArray(raw) ? raw : [];
    })
    .filter(
      (a): a is { url: string; type: "image" | "video" | "document"; name?: string; text?: string } =>
        typeof a?.url === "string" && a.type === "document" && typeof a.text === "string" && a.text.length > 0
    );
  const currentDocumentAttachments = attachments.filter((a) => a.type === "document" && a.text);
  const documentAttachments = [...historicalDocumentAttachments, ...currentDocumentAttachments].filter(
    (doc, index, all) => all.findIndex((d) => d.url === doc.url) === index
  );
  let documentsContext = "";
  if (documentAttachments.length) {
    documentsContext = `\n\nDocument(s) joint(s) par l'utilisateur dans cette conversation (texte extrait) :\n${documentAttachments
      .map((doc, index) => `--- Document ${index + 1}${doc.name ? ` : ${doc.name}` : ""} ---\n${doc.text}`)
      .join("\n\n")}`;
    if (documentsContext.length > MAX_DOCUMENT_CONTEXT_CHARS) {
      documentsContext = `${documentsContext.slice(0, MAX_DOCUMENT_CONTEXT_CHARS)}\n[...document tronqué...]`;
    }
  }

  let answer: string;
  // previousHistory est trié du plus récent au plus ancien : on prend les N derniers
  // messages AVANT le tour courant, puis on remet dans l'ordre chronologique.
  const recentPreviousHistory = (previousHistory ?? []).slice(0, MAX_HISTORY_MESSAGES).reverse();
  // Consignes « vitrine » : ajoutées seulement quand la conversation en parle, et le plafond est relevé d'autant
  // pour qu'elles ne fassent pas tronquer le contexte boutique (qui vient après le prompt).
  const includeVitrine = wantsVitrine([message, ...(previousHistory ?? []).filter((item) => item.role === "user").slice(0, 6).map((item) => String(item.content ?? ""))]);
  const systemPrompt = includeVitrine ? `${VENDEO_SYSTEM_PROMPT}\n\n${VITRINE_PROMPT}` : VENDEO_SYSTEM_PROMPT;
  const rawSystemContent = `${systemPrompt}\n\nContexte actuel :\n${safeContext}${documentsContext}`;
  const baseSystemCap = includeVitrine ? MAX_SYSTEM_CONTENT_CHARS + VITRINE_PROMPT.length + 2 : MAX_SYSTEM_CONTENT_CHARS;
  const systemCap = documentAttachments.length ? baseSystemCap + MAX_DOCUMENT_CONTEXT_CHARS : baseSystemCap;
  const systemContent = rawSystemContent.length > systemCap ? `${rawSystemContent.slice(0, systemCap)}[...system tronqué...]` : rawSystemContent;

  // L'historique de la conversation en cours est toujours transmis : c'est la mémoire
  // du tunnel de création de campagne. On ne le supprime plus jamais pour économiser
  // de la place ; seul le contexte analytique (ci-dessus) est raccourci si besoin.
  const safeHistory = recentPreviousHistory.map((item) => {
    const raw = typeof item.content === "string" ? item.content : "";
    const content = raw.length > MAX_MESSAGE_CHARS ? `${raw.slice(0, MAX_MESSAGE_CHARS)}[...troncé...]` : raw;
    return { role: item.role as "user" | "assistant", content };
  });

  // Le tour courant est toujours ajouté explicitement en dernier, avec le rôle "user" —
  // ça garantit que la conversation envoyée aux modèles ne se termine jamais par un tour
  // assistant, quel que soit le contenu de l'historique. Les pièces jointes image/vidéo
  // sont rattachées ici (attachments), en plus d'une courte note textuelle de secours au
  // cas où le modèle utilisé ne supporte pas la vision ; les documents sont signalés par
  // leur nom, leur contenu étant déjà dans le contexte système ci-dessus.
  const mediaAttachments = attachments.filter((a) => a.type === "image" || a.type === "video");
  const attachmentNote = mediaAttachments.length
    ? `\n\n(Pièce(s) jointe(s) envoyée(s) par l'utilisateur : ${mediaAttachments.map((a) => (a.type === "video" ? "vidéo" : "image")).join(", ")})`
    : "";
  const documentNote = currentDocumentAttachments.length
    ? `\n\n(Document(s) joint(s) par l'utilisateur : ${currentDocumentAttachments.map((d) => d.name ?? "document").join(", ")} — contenu fourni dans le contexte ci-dessus)`
    : "";
  const currentTurnContent = `${message}${attachmentNote}${documentNote}`;
  const currentTurn = {
    role: "user" as const,
    content: currentTurnContent.length > MAX_MESSAGE_CHARS ? `${currentTurnContent.slice(0, MAX_MESSAGE_CHARS)}[...troncé...]` : currentTurnContent,
    attachments: attachments.length ? attachments : undefined,
  };

  try {
    answer = await askImole([{ role: "system", content: systemContent }, ...safeHistory, currentTurn]);
  } catch (imoleError) {
    console.error("Imole chat error", imoleError instanceof Error ? imoleError.message : imoleError);
    // Imole a un problème (panne, quota, timeout...) : on retente avec Gemini
    // (palier gratuit Google) avant d'abandonner et de renvoyer une erreur.
    try {
      answer = await askGemini([{ role: "system", content: systemContent }, ...safeHistory, currentTurn]);
    } catch (geminiError) {
      console.error("Gemini fallback error", geminiError instanceof Error ? geminiError.message : geminiError);
      return NextResponse.json({ error: "Le service IA est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
    }
  }
  answer = cleanAiText(answer);
  // [[CREE_VITRINE]] : le serveur valide le JSON, crée la vitrine et remplace la balise par le lien.
  // Images jointes (la plus récente d'abord) : le logo est repris depuis là, jamais depuis une URL donnée par l'IA.
  const vitrineImageUrls = [
    ...attachments.filter((a) => a.type === "image").map((a) => a.url),
    ...(previousHistory ?? []).flatMap((item) => {
      const raw = (item as { attachments?: Array<{ url?: string; type?: string }> }).attachments;
      return Array.isArray(raw) ? raw.filter((a) => a?.type === "image" && typeof a.url === "string").map((a) => a.url as string) : [];
    }),
  ];
  answer = await processVitrineAnswer({
    answer,
    supabase,
    userId: user.id,
    imageUrls: vitrineImageUrls,
    hasPriorAssistantTurn: (previousHistory ?? []).some((item) => item.role === "assistant"),
  });
  const { data: assistant, error: assistantError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "assistant", content: answer, conversation_id: conversationId }).select("id, role, content, attachments, created_at").single();
  if (assistantError) return NextResponse.json({ error: assistantError.message }, { status: 500 });
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  return NextResponse.json({ message: assistant, conversationId, conversationTitle, usage: { free_used: quota.free_messages_used, free_limit: quota.free_messages_limit, used: quota.messages_used_this_month, limit: quota.messages_limit, trial_active: quota.trial_active, trial_ends_at: quota.trial_ends_at, status: quota.status, plan: quota.plan } });
}
