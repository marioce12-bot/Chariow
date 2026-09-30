// Même règle d'accès que requireActiveSubscription() (lib/subscription/access.ts), en lecture seule
// et sans NextResponse : sert à mettre la vitrine hors ligne quand l'abonnement du propriétaire n'est plus valide.
// (access.ts n'est volontairement pas modifié.)

export type SubscriptionRow = {
  status: string | null;
  trial_active: boolean | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
} | null;

export function isSubscriptionActive(subscription: SubscriptionRow | undefined, now: Date = new Date()): boolean {
  if (!subscription) return false;
  const trialOk = Boolean(subscription.trial_active) && Boolean(subscription.trial_ends_at) && new Date(subscription.trial_ends_at as string).getTime() > now.getTime();
  const today = now.toISOString().slice(0, 10);
  const periodEnd = subscription.current_period_end ? String(subscription.current_period_end).slice(0, 10) : null;
  const subscriptionOk = subscription.status === "active" && subscription.trial_active === false && periodEnd !== null && periodEnd >= today;
  return trialOk || subscriptionOk;
}
