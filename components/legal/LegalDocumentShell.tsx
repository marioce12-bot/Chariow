"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/locales";

const NAVIGATION = [
  { href: "/terms", fr: "Conditions", en: "Terms" },
  { href: "/privacy", fr: "Confidentialité", en: "Privacy" },
  { href: "/legal-notice", fr: "Mentions légales", en: "Legal notice" },
  { href: "/cookies", fr: "Cookies et traceurs", en: "Cookies and trackers" },
  { href: "/data-deletion", fr: "Suppression des données", en: "Data deletion" },
] as const;

export function LegalDocumentShell({
  locale,
  path,
  title,
  intro,
  children,
  variant = "legal",
  eyebrow,
  subtitle,
  homeLabel,
}: {
  locale: Locale;
  path: (typeof NAVIGATION)[number]["href"] | "/about";
  title: string;
  intro: string;
  children: ReactNode;
  variant?: "legal" | "about";
  eyebrow?: string;
  subtitle?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    document.title = `${title} — Vendeo`;
  }, [title]);

  const en = locale === "en";
  const isAbout = variant === "about";
  return (
    <main className="legal-document-page">
      <div className="legal-document-layout">
        <aside className="legal-document-sidebar">
          <Link href="/" className="legal-document-brand" aria-label="Vendeo — accueil">
            <Image className="legal-document-logo" src="/vendeo-logo.webp" alt="Vendeo" width={180} height={60} priority />
          </Link>
          <p className="legal-document-nav-title">{en ? "SERVICE DOCUMENTS" : "DOCUMENTS DU SERVICE"}</p>
          <nav className="legal-document-nav" aria-label={en ? "Legal documents" : "Documents juridiques"}>
            {NAVIGATION.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.href === path ? "page" : undefined}>
                {en ? item.en : item.fr}
              </Link>
            ))}
          </nav>
          <Link href="/" className="legal-document-home">{homeLabel ?? (en ? "← Back to Vendeo" : "← Retour à Vendeo")}</Link>
        </aside>
        <article className={`legal-document-card${isAbout ? " legal-document-card-about" : ""}`}>
          <div className="legal-document-topline">
            <span className="legal-document-eyebrow">{eyebrow ?? (en ? "VENDEO · SERVICE INFORMATION" : "VENDEO · INFORMATIONS DU SERVICE")}</span>
            {!isAbout && <span className="legal-document-effective">{en ? "LEGAL DOCUMENT · EFFECTIVE" : "DOCUMENT JURIDIQUE EN VIGUEUR"}</span>}
          </div>
          <header className="legal-document-header">
            <h1>{title}</h1>
            {subtitle && <p className="legal-document-subtitle">{subtitle}</p>}
            <p className="legal-document-intro">{intro}</p>
            {!isAbout && <p className="legal-document-version">{en ? "Effective version from 10 November 2026" : "Version en vigueur depuis le 10 novembre 2026"}</p>}
          </header>
          <div className="legal-document-content">{children}</div>
          {!isAbout && (
            <footer className="legal-document-footer">
              <span>{en ? "Questions about this document?" : "Une question sur ce document ?"}</span>
              <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>
              <a className="legal-document-footer-whatsapp" href="https://wa.me/2290191829482" target="_blank" rel="noopener noreferrer">{en ? "WhatsApp support · +229 01 91 82 94 82" : "Support WhatsApp · +229 01 91 82 94 82"}</a>
              <Link href="/register" className="legal-document-footer-signup">{en ? "Create a Vendeo account" : "Créer un compte Vendeo"}</Link>
            </footer>
          )}
        </article>
      </div>
    </main>
  );
}
