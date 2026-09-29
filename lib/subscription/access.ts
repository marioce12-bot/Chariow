import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PLANS_REQUIRED_MESSAGE = "Ton essai gratuit est terminé. Active ton abonnement pour continuer.";

/**
 * Règle d'accès unique, vérifiée en temps réel (sans dépendre du cron) :
 *  - essai : trial_active=true ET trial_ends_at dans le futur ;
 *  - abonné payant : status="active", trial_active=false ET current_period_end
 *    non dépassé. current_period_end est une date (YYYY-MM-DD) : l'accès court
 *    jusqu'à la fin du jour d'échéance, comme reset_subscription_period_if_needed()
 *    (qui expire quand current_period_end < current_date).
 *
 * Appelé automatiquement par requireUser() (lib/auth.ts) pour toutes les routes
 * /api protégées. Échec fermé : sans ligne d'abonnement, ou en cas d'erreur de
 * lecture, l'accès est refusé.
 *
 * Retourne une NextResponse 402 (code "PLANS_REQUIRED") à renvoyer tel quel
 * si l'accès doit être bloqué, ou null si la route peut continuer.
 */
export async function requireActiveSubscription(userId: string): Promise<NextResponse | null> {
  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_active, trial_ends_at, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  const trialOk =
    Boolean(subscription?.trial_active) &&
    Boolean(subscription?.trial_ends_at) &&
    new Date(subscription!.trial_ends_at as string).getTime() > Date.now();

  const today = new Date().toISOString().slice(0, 10);
  const periodEnd = subscription?.current_period_end ? String(subscription.current_period_end).slice(0, 10) : null;
  const subscriptionOk =
    subscription?.status === "active" &&
    subscription?.trial_active === false &&
    periodEnd !== null &&
    periodEnd >= today;

  if (trialOk || subscriptionOk) return null;
  return NextResponse.json({ error: PLANS_REQUIRED_MESSAGE, code: "PLANS_REQUIRED" }, { status: 402 });
}
