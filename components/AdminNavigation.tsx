"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Activity, BarChart3, Bell, Building2, CreditCard, FileText, Menu, Receipt, Send, X, Users } from "lucide-react";

export type AdminNavigationProps = {
  active: string;
  onChange: (section: string) => void;
};

const groups = [
  { label: "Pilotage", items: [["overview", "Vue générale", Activity], ["users", "Inscriptions", Users], ["usage", "Usage de l’app", BarChart3]] },
  { label: "Finance", items: [["subscriptions", "Abonnements", CreditCard], ["purchases", "Achats & recharges", Receipt], ["payouts", "Décaissements", Send]] },
  { label: "Plateforme", items: [["notifications", "Notifications", Bell], ["integrations", "Intégrations", Building2], ["audit", "Journal d’audit", FileText]] },
] as const;

export function AdminNavigation({ active, onChange }: AdminNavigationProps) {
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
    <button ref={triggerRef} type="button" className="admin-nav-trigger" aria-label="Ouvrir le menu d’administration" aria-controls={titleId} aria-expanded={open} onClick={() => setOpen(true)}>
      <Menu size={19} aria-hidden="true" /><span>Menu</span>
    </button>
    {open && <button type="button" className="admin-nav-overlay" aria-label="Fermer le menu" onClick={() => setOpen(false)} />}
    <nav ref={drawerRef} id={titleId} className={`admin-sidebar admin-navigation${open ? " is-open" : ""}`} role={open ? "dialog" : undefined} aria-label="Navigation administrateur" aria-modal={open ? "true" : undefined}>
      <div className="admin-nav-mobile-head"><strong>Navigation</strong><button type="button" className="admin-nav-close" aria-label="Fermer le menu" onClick={() => setOpen(false)}><X size={20} /></button></div>
      {groups.map((group) => <div className="admin-nav-group" key={group.label}>
        <span className="admin-nav-group-label">{group.label}</span>
        {group.items.map(([key, label, Icon]) => <button type="button" key={key} className={active === key ? "active" : ""} aria-current={active === key ? "page" : undefined} onClick={() => choose(key)}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}
      </div>)}
    </nav>
  </>;
}
