import { Dashboard } from "@/components/Dashboard";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/dashboard/Skeleton";

// Le garde d'abonnement (SubscriptionPaywallGate) est monté dans app/dashboard/layout.tsx.
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
