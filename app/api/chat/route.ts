import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askImole } from "@/lib/ai/imole";
import { askGemini } from "@/lib/ai/gemini";
import { getChariowSnapshot, serializeChariowContext } from "@/lib/chariow/analytics";
import { cleanAiText } from "@/lib/ai/format";
import { calculateProfitabilityAggregate } from "@/lib/profitability-aggregates";
import { buildDiagnosticReports } from "@/lib/meta/diagnostic-server";

const VENDEO_SYSTEM_PROMPT = `Tu es l'analyste business de Vendeo pour les créateurs de produits digitaux francophones.

Tu aides l'utilisateur à comprendre ses ventes, ses produits, ses clients et ses opportunités commerciales.

Règles importantes :
- Réponds toujours en français.
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
- Une campagne "ok" n'a pas de problème : dis-le simplement, n'invente pas d'anomalie.`;

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("messages").select("id, store_id, role, content, created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 20000) return NextResponse.json({ error: "Le message doit contenir entre 1 et 20 000 caractères" }, { status: 400 });
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
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: quota, error: quotaError } = await supabase.rpc("consume_message_quota", { target_user_id: user.id });
  if (quotaError) return NextResponse.json({ error: quotaError.message }, { status: 500 });
  if (!quota) return NextResponse.json({ error: "Ton essai gratuit est terminé. Active ton abonnement pour continuer.", code: "PLANS_REQUIRED" }, { status: 429 });
  const { error: insertError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "user", content: message });
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

  // Imole peut refuser les payloads trop volumineux (400).
  // On tronque de façon plus agressive le contexte + l'historique.
  const MAX_CONTEXT_CHARS = 6_000;
  const MAX_MESSAGE_CHARS = 1_500;
  const MAX_HISTORY_MESSAGES = 4;
  const MAX_SYSTEM_CONTENT_CHARS = 9_000;

  const safeContext =
    context.length > MAX_CONTEXT_CHARS
      ? `${context.slice(0, MAX_CONTEXT_CHARS)}\n[... contexte tronqué ...]`
      : context;
  let answer: string;
  // previousHistory est trié du plus récent au plus ancien : on prend les N derniers
  // messages AVANT le tour courant, puis on remet dans l'ordre chronologique.
  const recentPreviousHistory = (previousHistory ?? []).slice(0, MAX_HISTORY_MESSAGES).reverse();
  const rawSystemContent = `${VENDEO_SYSTEM_PROMPT}\n\nContexte actuel :\n${safeContext}`;
  const systemContent = rawSystemContent.length > MAX_SYSTEM_CONTENT_CHARS ? `${rawSystemContent.slice(0, MAX_SYSTEM_CONTENT_CHARS)}[...system tronqué...]` : rawSystemContent;

  // Garde-fou : si le system est déjà gros, on enlève l'historique.
  const shouldIncludeHistory = systemContent.length < 7_500;

  const safeHistory = shouldIncludeHistory
    ? recentPreviousHistory.map((item) => {
        const raw = typeof item.content === "string" ? item.content : "";
        const content = raw.length > MAX_MESSAGE_CHARS ? `${raw.slice(0, MAX_MESSAGE_CHARS)}[...troncé...]` : raw;
        return { role: item.role as "user" | "assistant", content };
      })
    : [];

  // Le tour courant est toujours ajouté explicitement en dernier, avec le rôle "user" —
  // ça garantit que la conversation envoyée aux modèles ne se termine jamais par un tour
  // assistant, quel que soit le contenu de l'historique.
  const currentTurn = { role: "user" as const, content: message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}[...troncé...]` : message };

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
  const { data: assistant, error: assistantError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "assistant", content: answer }).select("id, role, content, created_at").single();
  if (assistantError) return NextResponse.json({ error: assistantError.message }, { status: 500 });
  return NextResponse.json({ message: assistant, usage: { free_used: quota.free_messages_used, free_limit: quota.free_messages_limit, used: quota.messages_used_this_month, limit: quota.messages_limit, trial_active: quota.trial_active, trial_ends_at: quota.trial_ends_at, status: quota.status, plan: quota.plan } });
}
