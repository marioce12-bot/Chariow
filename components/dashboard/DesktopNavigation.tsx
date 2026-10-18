"use client";

import {
  BarChart3,
  Bot,
  CreditCard,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Settings,
  Sparkles,
  Store,
  ChartNoAxesCombined,
  MessageCircle,
  MessageSquareText,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";

type DashboardNavigationProps = {
  active: string;
  onChange: (section: string) => void;
};
type NavigationItem = {
  section: string;
  navKey?: string;
  label: string;
  Icon: typeof LayoutDashboard;
};

export const dashboardPrimaryNavigation: readonly NavigationItem[] = [
  {
    section: "Vue d'ensemble",
    navKey: "nav.overview",
    label: "Vue d'ensemble",
    Icon: LayoutDashboard,
  },
  {
    section: "Bénéfices nets",
    label: "Bénéfices nets",
    Icon: ChartNoAxesCombined,
  },
  {
    section: "Relances WhatsApp",
    label: "Relances WhatsApp",
    Icon: MessageCircle,
  },
  {
    section: "Vendeo AI",
    navKey: "nav.assistant",
    label: "Vendeo AI",
    Icon: MessageSquare,
  },
  { section: "Studio", navKey: "nav.studio", label: "Studio", Icon: Sparkles },
  { section: "Pub", navKey: "nav.pubs", label: "Pub", Icon: Megaphone },
  {
    section: "Radar marché",
    navKey: "nav.radar",
    label: "Radar marché",
    Icon: Lightbulb,
  },
  {
    section: "Rapports",
    navKey: "nav.reports",
    label: "Rapports",
    Icon: FileText,
  },
  {
    section: "Suggestions et notes",
    label: "Suggestions et notes",
    Icon: MessageSquareText,
  },
  {
    section: "Pilotage auto",
    navKey: "nav.autopilot",
    label: "Pilotage auto",
    Icon: Bot,
  },
];
export const dashboardHeaderNavigation: readonly NavigationItem[] = [
  {
    section: "Mes boutiques",
    navKey: "nav.stores",
    label: "Boutiques",
    Icon: Store,
  },
  {
    section: "Comptes publicitaires",
    navKey: "nav.adAccounts",
    label: "Comptes pub",
    Icon: BarChart3,
  },
  {
    section: "Abonnement",
    navKey: "nav.subscription",
    label: "Abonnement",
    Icon: CreditCard,
  },
  {
    section: "Paramètres",
    navKey: "nav.settings",
    label: "Paramètres",
    Icon: Settings,
  },
];
function DashboardNavigationItems({
  items,
  active,
  onChange,
  className,
}: DashboardNavigationProps & {
  items: readonly NavigationItem[];
  className: string;
}) {
  const { t } = useI18n();
  const primary = className === "dashboard-primary-navigation";
  return (
    <nav
      className={className}
      aria-label={
        primary
          ? "Navigation principale du tableau de bord"
          : "Outils du tableau de bord"
      }
    >
      {items.map(({ section, navKey, label, Icon }, index) => (
        <div className="dashboard-nav-item" key={section}>
          {primary && (index === 0 || index === 3 || index === 7) ? (
            <span className="dashboard-nav-group">
              {index === 0
                ? "Mon activité"
                : index === 3
                  ? "Créer & développer"
                  : "Analyser & piloter"}
            </span>
          ) : null}
          <button
            type="button"
            className={primary ? "side-link" : "dashboard-header-link"}
            aria-label={!primary ? label : undefined}
            title={!primary ? label : undefined}
            aria-current={active === section ? "page" : undefined}
            onClick={() => onChange(section)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{primary && navKey ? t(navKey) : label}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}
export function DashboardPrimaryNavigation(props: DashboardNavigationProps) {
  return (
    <DashboardNavigationItems
      {...props}
      items={dashboardPrimaryNavigation}
      className="dashboard-primary-navigation"
    />
  );
}
export function DashboardHeaderNavigation(props: DashboardNavigationProps) {
  return (
    <DashboardNavigationItems
      {...props}
      items={dashboardHeaderNavigation}
      className="dashboard-header-navigation"
    />
  );
}
