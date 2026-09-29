import ChariowStatusNotice from "@/components/ChariowStatusNotice";
import { SubscriptionPaywallGate } from "@/components/SubscriptionPaywallGate";

// Le garde d'abonnement est monté ici (et non dans page.tsx) pour couvrir
// /dashboard ET toute future sous-page /dashboard/*, y compris en navigation directe.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SubscriptionPaywallGate />
      <ChariowStatusNotice />
    </>
  );
}
