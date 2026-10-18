"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { Activity, BarChart3, Bell, Building2, CreditCard, FileText, Menu, Receipt, Send, X, Users, MessageSquareText } from "lucide-react";

export type AdminNavigationProps = {
  active: string;
  onChange: (section: string) => void;
};

export const adminNavigationGroups = [
  { label: "Pilotage", items: [["overview", "Vue générale", Activity], ["users", "Inscriptions", Users], ["usage", "Usage de l’app", BarChart3]] },
  { label: "Finance", items: [["subscriptions", "Abonnements", CreditCard], ["purchases", "Achats & recharges", Receipt], ["payouts", "Décaissements", Send]] },
  { label: "Plateforme", items: [["notifications", "Notifications", Bell], ["integrations", "Intégrations", Building2], ["audit", "Journal d’audit", FileText], ["feedback", "Retours & notes", MessageSquareText]] },
] as const;

export function AdminNavigation({ active, onChange }: AdminNavigationProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  const choose = (section: string) => {
    onChange(section);
    setOpen(false);
  };

  return <>
    <button ref={triggerRef} type="button" className="admin-nav-trigger" aria-label={t("adminExtra.nav.open")} aria-controls={titleId} aria-expanded={open} onClick={() => setOpen(true)}>
      <Menu size={19} aria-hidden="true" /><span>{t("adminExtra.nav.menu")}</span>
    </button>
    {open && <button type="button" className="admin-nav-overlay" aria-label={t("adminExtra.nav.close")} onClick={() => setOpen(false)} />}
    <nav ref={drawerRef} id={titleId} className={`admin-sidebar admin-navigation${open ? " is-open" : ""}`} role={open ? "dialog" : undefined} aria-label={t("adminExtra.nav.title")} aria-modal={open ? "true" : undefined}>
      <div className="admin-nav-mobile-head"><strong>{t("adminExtra.nav.title")}</strong><button type="button" className="admin-nav-close" aria-label={t("adminExtra.nav.close")} onClick={() => setOpen(false)}><X size={20} /></button></div>
      {adminNavigationGroups.map((group) => <div className={`admin-nav-group${group.label === "Plateforme" ? " admin-nav-platform" : ""}`} key={group.label}>
        <span className="admin-nav-group-label">{t(`adminExtra.nav.group.${group.label === "Pilotage" ? "control" : group.label === "Finance" ? "finance" : "platform"}`)}</span>
        {group.items.map(([key, label, Icon]) => <button type="button" key={key} className={active === key ? "active" : ""} aria-current={active === key ? "page" : undefined} onClick={() => choose(key)}><Icon size={17} aria-hidden="true" /><span>{t(`adminExtra.nav.${key}`)}</span></button>)}
      </div>)}
    </nav>
  </>;
}

/** Platform tools live in the desktop header; mobile keeps the complete drawer. */
export function AdminHeaderNavigation({ active, onChange }: AdminNavigationProps) {
  const { t } = useI18n();
  return <nav className="admin-header-navigation" aria-label={t("interfaceExtra.platformTools")}>
    {adminNavigationGroups[2].items.map(([key, label, Icon]) => <button
      type="button" key={key} className={active === key ? "active" : ""}
      aria-current={active === key ? "page" : undefined} onClick={() => onChange(key)}
    ><Icon size={16} aria-hidden="true" /><span>{t(`adminExtra.nav.${key}`)}</span></button>)}
  </nav>;
}
