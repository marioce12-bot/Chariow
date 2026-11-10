"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
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
}: {
  locale: Locale;
  path: (typeof NAVIGATION)[number]["href"];
  title: string;
  intro: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} — Vendeo`;
  }, [title]);

  const en = locale === "en";
  return (
    <main className="legal-document-page">
      <div className="legal-document-layout">
        <aside className="legal-document-sidebar">
          <Link href="/" className="legal-document-brand" aria-label="Vendeo — accueil">
            <span className="legal-document-brand-mark" aria-hidden="true">V</span>
            <span>Vendeo</span>
          </Link>
          <p className="legal-document-nav-title">{en ? "SERVICE DOCUMENTS" : "DOCUMENTS DU SERVICE"}</p>
          <nav className="legal-document-nav" aria-label={en ? "Legal documents" : "Documents juridiques"}>
            {NAVIGATION.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.href === path ? "page" : undefined}>
                {en ? item.en : item.fr}
              </Link>
            ))}
          </nav>
          <Link href="/" className="legal-document-home">{en ? "← Back to Vendeo" : "← Retour à Vendeo"}</Link>
        </aside>
        <article className="legal-document-card">
          <div className="legal-document-topline">
            <span className="legal-document-eyebrow">{en ? "VENDEO · SERVICE INFORMATION" : "VENDEO · INFORMATIONS DU SERVICE"}</span>
            <span className="legal-draft-notice">{en ? "DRAFT · REVIEW BEFORE PUBLICATION" : "BROUILLON · À VALIDER AVANT PUBLICATION"}</span>
          </div>
          <header className="legal-document-header">
            <h1>{title}</h1>
            <p className="legal-document-intro">{intro}</p>
            <p className="legal-document-version">{en ? "Draft version: 10 November 2026 · Not yet in force" : "Version de travail : 10 novembre 2026 · Pas encore en vigueur"}</p>
          </header>
          <div className="legal-document-content">{children}</div>
          <footer className="legal-document-footer">
            <span>{en ? "Questions about this document?" : "Une question sur ce document ?"}</span>
            <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>
            <a className="legal-document-footer-whatsapp" href="https://wa.me/2290191829482" target="_blank" rel="noopener noreferrer">{en ? "WhatsApp support · +229 01 91 82 94 82" : "Support WhatsApp · +229 01 91 82 94 82"}</a>
            <Link href="/register" className="legal-document-footer-signup">{en ? "Create a Vendeo account" : "Créer un compte Vendeo"}</Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
