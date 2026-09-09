import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildDiagnosticReports } from "@/lib/meta/diagnostic-server";
import { askImole } from "@/lib/ai/imole";
import { askGemini } from "@/lib/ai/gemini";
import { cleanAiText } from "@/lib/ai/format";

// Prompt système de la couche IA : elle reçoit uniquement le JSON de la couche
// diagnostic, ne recalcule rien et ne propose que des actions liées au(x) stage détecté(s).
const DIAGNOSTIC_SYSTEM_PROMPT = `Tu es l'analyste publicitaire de Vendeo. Tu reçois un rapport de diagnostic déjà calculé (JSON), tu ne dois recalculer ni halluciner aucune métrique.

Règles :
- Annonce d'abord l'étage de l'entonnoir concerné, en une phrase claire.
- Cite les chiffres exacts fournis dans "evidence" pour justifier le diagnostic.
- Ne propose que des actions correspondant au "stage" détecté (voir mapping ci-dessous).
- Si "status" = "ok", dis-le simplement, ne cherche pas un problème qui n'existe pas.

Mapping stage → type d'action à recommander :
- audience → ajuster ciblage, tester un lookalike, élargir/réduire l'audience
- creative → renouveler visuel/vidéo, nouvel angle créatif
- attribution → vérifier configuration Pixel/CAPI, ne pas juger sur le ROAS Meta seul
- offer → revoir prix, preuve sociale, clarté de la page produit
- checkout → alerter sur la méthode de paiement en cause, ne pas proposer de correctif technique (Vendeo ne contrôle pas le tunnel Chariow)
- technical → signaler le device/placement concerné comme suspicion de bug

Format de réponse :
- Réponds en français, de manière concise et orientée action.
- Traite chaque campagne avec anomalies, puis un mot sur les campagnes "ok" si présent.
- Format texte propre : titres simples, listes avec des tirets, pas de blocs de code, pas de Markdown gras.`;

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const result = await buildDiagnosticReports(supabase, user, {
    accountId: typeof body?.account_id === "string" ? body.account_id : null,
    from: typeof body?.from === "string" ? body.from : null,
    to: typeof body?.to === "string" ? body.to : null,
  });
  if ("error" in result) return NextResponse.json({ error: result.error.message }, { status: result.error.status });
  const { currency, reports } = result;

  if (!reports.length) {
    return NextResponse.json({
      analysis: "Aucune campagne Meta synchronisée sur la période. Lance une synchronisation Meta Ads depuis la page Pubs pour alimenter le diagnostic.",
      reports,
    });
  }

  const { data: quota, error: quotaError } = await supabase.rpc("consume_message_quota", { target_user_id: user.id });
  if (quotaError) return NextResponse.json({ error: quotaError.message }, { status: 500 });
  if (!quota) return NextResponse.json({ error: "Ton essai gratuit est terminé. Active ton abonnement pour continuer.", code: "PLANS_REQUIRED" }, { status: 429 });

  // La couche IA ne reçoit QUE le JSON produit par la couche diagnostic.
  const userMessage = `Rapport de diagnostic publicitaire (période ${reports[0]?.period.from} → ${reports[0]?.period.to}, devise ${currency}) :\n${JSON.stringify(reports)}`;

  let analysis: string;
  try {
    analysis = await askImole([{ role: "system", content: DIAGNOSTIC_SYSTEM_PROMPT }, { role: "user", content: userMessage }]);
  } catch (imoleError) {
    console.error("Imole diagnostic error", imoleError instanceof Error ? imoleError.message : imoleError);
    try {
      analysis = await askGemini([{ role: "system", content: DIAGNOSTIC_SYSTEM_PROMPT }, { role: "user", content: userMessage }]);
    } catch (geminiError) {
      console.error("Gemini diagnostic fallback error", geminiError instanceof Error ? geminiError.message : geminiError);
      return NextResponse.json({ error: "Le service IA est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
    }
  }

  return NextResponse.json({ analysis: cleanAiText(analysis), reports, usage: { trial_active: quota.trial_active, trial_ends_at: quota.trial_ends_at, status: quota.status, plan: quota.plan } });
}
