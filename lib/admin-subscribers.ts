export type SubscriptionRow = {
  id: string; user_id: string; plan: string; status: string;
  current_period_start: string | null; current_period_end: string | null;
  trial_active: boolean | null; trial_ends_at: string | null; created_at: string;
};
// paying  : abonnement payant dont la période n'est pas échue (accès en cours)
// trial   : essai gratuit en cours
// expired : essai ou période payante dépassés (le statut en base peut ne pas encore
//           avoir basculé : il n'est mis à jour qu'à la prochaine lecture ou par le cron)
// other   : annulé, en pause, incomplet…
export type SubscriberState = "paying" | "trial" | "expired" | "other";

export function classifySubscription(row: SubscriptionRow, now: Date): SubscriberState {
  const today = now.toISOString().slice(0, 10);
  if (row.trial_active) {
    if (["trialing", "active"].includes(row.status) && row.trial_ends_at && Date.parse(row.trial_ends_at) > now.getTime()) return "trial";
    return "expired";
  }
  if (row.status === "active") return row.current_period_end && row.current_period_end < today ? "expired" : "paying";
  if (row.status === "past_due" || row.status === "trialing") return "expired";
  return "other";
}
