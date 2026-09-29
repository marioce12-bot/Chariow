import { Dashboard } from "@/components/Dashboard";
import { SubscriptionPaywallGate } from "@/components/SubscriptionPaywallGate";
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="app-card">Chargement de ton espace…</div>}>
      <Dashboard />
      <SubscriptionPaywallGate />
    </Suspense>
  );
}
