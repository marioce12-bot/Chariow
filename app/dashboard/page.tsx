import { Dashboard } from "@/components/Dashboard";
import { Suspense } from "react";

// Le garde d'abonnement (SubscriptionPaywallGate) est monté dans app/dashboard/layout.tsx.
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="app-card">Chargement de ton espace…</div>}>
      <Dashboard />
    </Suspense>
  );
}
