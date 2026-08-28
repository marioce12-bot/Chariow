import { Dashboard } from "@/components/Dashboard";
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="app-card">Chargement de ton espace…</div>}>
      <Dashboard />
    </Suspense>
  );
}
