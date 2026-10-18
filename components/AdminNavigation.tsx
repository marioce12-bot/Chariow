"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import {
  LayoutDashboard,
  BarChart3,
  Bell,
  Plug,
  CreditCard,
  FileText,
  Menu,
  Receipt,
  ArrowUpRight,
  X,
  Users,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";

export type AdminNavigationProps = {
  active: string;
  onChange: (section: string) => void;
};
export const adminNavigationGroups = [
  {
    key: "observe",
    items: [
      ["overview", LayoutDashboard],
      ["users", Users],
      ["usage", BarChart3],
    ],
  },
  {
    key: "control",
    items: [
      ["integrations", Plug],
      ["notifications", Bell],
      ["feedback", MessageSquareText],
    ],
  },
  {
    key: "manage",
    items: [
      ["subscriptions", CreditCard],
      ["purchases", Receipt],
      ["payouts", ArrowUpRight],
      ["audit", FileText],
    ],
  },
] as const;
const copy = {
  observe: ["Observation", "Observation"],
  control: ["Contrôle", "Control"],
  manage: ["Gestion", "Management"],
  overview: ["Vue d’ensemble", "Overview"],
  users: ["Comptes utilisateurs", "User accounts"],
  usage: ["Usage de Vendeo", "Vendeo usage"],
  integrations: ["Connexions & synchros", "Connections & sync"],
  notifications: ["Notifications", "Notifications"],
  feedback: ["Suggestions & avis", "Suggestions & feedback"],
  subscriptions: ["Abonnements", "Subscriptions"],
  purchases: ["Achats & crédits", "Purchases & credits"],
  payouts: ["Décaissements", "Payouts"],
  audit: ["Journal d’audit", "Audit log"],
};
export function adminLabel(key: string, locale: string) {
  return copy[key as keyof typeof copy]?.[locale === "en" ? 1 : 0] ?? key;
}
export const adminSectionKeys = adminNavigationGroups.flatMap((group) =>
  group.items.map(([key]) => key),
);

export function AdminNavigation({ active, onChange }: AdminNavigationProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const id = useId();
  const nav = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nav.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab" || !nav.current) return;
      const targets = [
        ...nav.current.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])",
        ),
      ].filter((target) => target.getClientRects().length > 0);
      const first = targets[0],
        last = targets[targets.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const media = window.matchMedia("(min-width: 901px)");
    const onResize = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onResize);
      trigger.current?.focus();
    };
  }, [open]);
  const choose = (section: string) => {
    onChange(section);
    setOpen(false);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="admin-nav-trigger"
        aria-label={en ? "Open navigation" : "Ouvrir la navigation"}
        aria-controls={id}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={20} />
      </button>
      {open && (
        <button
          type="button"
          className="admin-nav-overlay"
          aria-label={en ? "Close navigation" : "Fermer la navigation"}
          onClick={() => setOpen(false)}
        />
      )}
      <nav
        ref={nav}
        id={id}
        className={`admin-navigation${open ? " is-open" : ""}`}
        aria-label={en ? "Owner navigation" : "Navigation propriétaire"}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
      >
        <div className="owner-brand">
          <img className="owner-brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" />
          <button
            type="button"
            className="admin-nav-close"
            aria-label={en ? "Close navigation" : "Fermer la navigation"}
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="owner-workspace">
          <span className="owner-avatar">M</span>
          <div>
            <strong>{en ? "Owner workspace" : "Espace propriétaire"}</strong>
            <small>
              {en ? "Full platform access" : "Contrôle de la plateforme"}
            </small>
          </div>
          <ShieldCheck size={15} />
        </div>
        {adminNavigationGroups.map((group) => (
          <div className="admin-nav-group" key={group.key}>
            <span className="admin-nav-group-label">
              {adminLabel(group.key, locale)}
            </span>
            {group.items.map(([key, Icon]) => (
              <button
                type="button"
                key={key}
                aria-current={active === key ? "page" : undefined}
                className={active === key ? "active" : ""}
                onClick={() => choose(key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{adminLabel(key, locale)}</span>
                {active === key && <span className="owner-active-dot" />}
              </button>
            ))}
          </div>
        ))}
        <div className="owner-nav-footer">
          <ShieldCheck size={17} />
          <div>
            <strong>
              {en ? "Private administration" : "Administration privée"}
            </strong>
            <small>
              {en ? "Owner · Super-admin" : "Propriétaire · Super-admin"}
            </small>
          </div>
        </div>
      </nav>
    </>
  );
}

/** Kept as a compatibility export: all destinations now live in one sidebar. */
export function AdminHeaderNavigation(_: AdminNavigationProps) {
  return null;
}
