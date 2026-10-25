"use client";

import { ArrowRight } from "lucide-react";
import type { ChatNavigationSection, ChatNavigationTarget } from "./navigation-intent";

export function NavigationCard({
  target,
  locale,
  onNavigate,
}: {
  target: ChatNavigationTarget;
  locale: "fr" | "en";
  onNavigate: (section: ChatNavigationSection) => void;
}) {
  const english = locale === "en";
  const label = english ? target.labelEn : target.labelFr;
  const routeLabel = english ? target.routeLabelEn : target.routeLabelFr;
  const buttonLabel = english ? `Open ${label}` : `Ouvrir ${label}`;

  return (
    <div className="chat-navigation-card">
      <div className="chat-navigation-card-copy">
        <span>{english ? "Vendeo section" : "Rubrique Vendeo"}</span>
        <strong>{label}</strong>
        {routeLabel !== label ? <small>{english ? `Destination: ${routeLabel}` : `Destination : ${routeLabel}`}</small> : null}
      </div>
      <button
        type="button"
        className="chat-navigation-card-action"
        aria-label={buttonLabel}
        onClick={() => onNavigate(target.section)}
      >
        {buttonLabel}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
