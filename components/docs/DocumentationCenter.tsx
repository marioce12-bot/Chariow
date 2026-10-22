"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Copy, Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { assistantSections } from "@/lib/docs/assistant";
import { coreIntegrationSections } from "@/lib/docs/integrations-core";
import { socialIntegrationSections } from "@/lib/docs/integrations-social";
import { commerceSections } from "@/lib/docs/commerce";
import { studioManageSections } from "@/lib/docs/studio-manage";
import type { DocSection, LocalizedText } from "@/lib/docs/types";
import "./documentation.css";

const allSections: DocSection[] = [...commerceSections, ...coreIntegrationSections, ...socialIntegrationSections, ...assistantSections, ...studioManageSections];
export const documentationSections = (["start", "sell", "create", "manage"] as const).flatMap(group => allSections.filter(s => s.group === group));
const groups = ["start", "sell", "create", "manage"] as const;
const groupNames: Record<typeof groups[number], LocalizedText> = {
  start: { fr: "Prendre ses repères", en: "Getting started" },
  sell: { fr: "Vendre & mesurer", en: "Selling & measuring" },
  create: { fr: "Créer avec Vendeo", en: "Creating with Vendeo" },
  manage: { fr: "Gérer son espace", en: "Managing your workspace" },
};
const copy = {
  fr: { documentation: "Documentation", intro: "Le guide de votre espace Vendeo.", description: "De la première boutique au suivi de vos campagnes : des étapes concrètes, les bons repères et les limites à connaître.", search: "Rechercher dans la documentation…", searchLabel: "Rechercher dans tous les guides", clear: "Effacer la recherche", contents: "Tous les guides", onPage: "Dans ce guide", back: "Accueil du site", app: "Ouvrir Vendeo", login: "Se connecter", start: "Commencer ici", guides: "guides", articles: "articles", results: "résultats", noResults: "Aucun article trouvé.", noResultsHelp: "Essayez un terme comme « boutique », « campagne », « crédits » ou « attribution ».", note: "À savoir", permalink: "Copier le lien de cet article", copied: "Lien copié", previous: "Guide précédent", next: "Guide suivant", read: "Lire le guide", visual: "L’interface, en pratique", visualHelp: "Captures de l’interface Vendeo avec des données de démonstration. Ouvrez une capture pour l’examiner ; les chiffres affichés ne représentent pas une boutique réelle.", enlarge: "Ouvrir la capture en grand", home: "Accueil : choisir sa boutique, sa période et lire ses indicateurs.", ads: "Lancement : préparer une publicité avant toute validation ou paiement.", studio: "Studio : retrouver les outils de création. Les états et les coûts actuels sont détaillés dans les guides ci-dessous.", safety: "Avant toute dépense", safetyText: "Un abonnement, des crédits Studio et un budget publicitaire sont trois choses distinctes. Vérifiez toujours le récapitulatif avant de confirmer une création ou un lancement.", browse: "Choisissez un guide pour commencer", footer: "Une documentation produit, pas une promesse de résultat.", privacy: "Confidentialité", terms: "Conditions", searchFor: "Recherche", close: "Fermer", overview: "Vue d’ensemble", steps: "Pas à pas", available: "Fonctions actives et limites expliquées", reset: "Voir tous les guides" },
  en: { documentation: "Documentation", intro: "Your guide to the Vendeo workspace.", description: "From your first store to campaign monitoring: practical steps, clear explanations and the limitations you need to know.", search: "Search the documentation…", searchLabel: "Search all guides", clear: "Clear search", contents: "All guides", onPage: "In this guide", back: "Website home", app: "Open Vendeo", login: "Sign in", start: "Start here", guides: "guides", articles: "articles", results: "results", noResults: "No matching articles.", noResultsHelp: "Try a term such as “store”, “campaign”, “credits” or “attribution”.", note: "Good to know", permalink: "Copy a link to this article", copied: "Link copied", previous: "Previous guide", next: "Next guide", read: "Read guide", visual: "A look inside the interface", visualHelp: "Screenshots of the Vendeo interface using demo data. Open a screenshot to inspect it; the figures do not represent a real store.", enlarge: "Open full-size screenshot", home: "Home: select your store and date range, then read your metrics.", ads: "Launch: prepare an advertisement before any confirmation or payment.", studio: "Studio: find your creative tools. Current availability and costs are explained in the guides below.", safety: "Before spending anything", safetyText: "A subscription, Studio credits and an advertising budget are three separate things. Always check the summary before confirming a creation or campaign launch.", browse: "Choose a guide to get started", footer: "Product documentation, not a promise of results.", privacy: "Privacy", terms: "Terms", searchFor: "Search", close: "Close", overview: "Overview", steps: "Step by step", available: "Active features and limitations explained", reset: "Browse all guides" },
};
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function DocumentationCenter() {
  const { locale, setLocale } = useI18n();
  const c = copy[locale];
  const text = (value: LocalizedText) => value[locale];
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const sync = () => {
      let hash = "";
      try { hash = decodeURIComponent(window.location.hash.slice(1)); } catch { /* Invalid hash opens overview. */ }
      const [sectionId, articleId] = hash.split("/");
      setSelected(documentationSections.some(s => s.id === sectionId) ? sectionId : "");
      setQuery("");
      requestAnimationFrame(() => {
        const target = document.getElementById(articleId ? `${sectionId}/${articleId}` : "docs-content");
        target?.scrollIntoView({ block: "start" });
      });
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    if (!lightbox) return;
    const before = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setLightbox(null); if (event.key === "Tab") { event.preventDefault(); closeButton.current?.focus(); } };
    document.addEventListener("keydown", close);
    return () => { document.body.style.overflow = before; document.removeEventListener("keydown", close); previousFocus?.focus(); };
  }, [lightbox]);
  const section = documentationSections.find(s => s.id === selected);
  const index = documentationSections.findIndex(s => s.id === selected);
  useEffect(() => { document.title = `${section ? section.title[locale] : c.documentation} | Vendeo`; }, [section, locale, c.documentation]);
  const results = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return documentationSections.flatMap(s => s.articles.filter(a => {
      const haystack = normalize([s.title[locale], a.title[locale], ...(a.paragraphs || []).map(p => p[locale]), ...(a.bullets || []).map(p => p[locale]), ...(a.steps || []).map(p => p[locale]), a.notice?.[locale] || ""].join(" "));
      return words.every(word => haystack.includes(word));
    }).map(a => ({ section: s, article: a })));
  }, [query, locale]);
  const articleCount = documentationSections.reduce((count, s) => count + s.articles.length, 0);
  async function copyLink(id: string) {
    try { await navigator.clipboard.writeText(`${window.location.origin}/docs#${id}`); setCopied(id); window.setTimeout(() => setCopied(""), 2000); }
    catch { window.location.hash = id; }
  }
  const visualPath = (image: string) => image.startsWith("studio-") ? `/docs/${image}-${locale}.webp` : `/landing/actual-${image}-${locale}.webp`;
  const visualCaption = (image: string) => image === "studio-slideshow" ? (locale === "fr" ? "Diaporama : cinq visuels, une durée et une musique à choisir avant de cliquer sur Créer. Vidéo reste verrouillé." : "Slideshow: five visuals, a duration and optional music before clicking Create. Video remains locked.") : image === "studio-photo" ? (locale === "fr" ? "Photo : décrire la création, joindre des références et choisir la qualité et la résolution." : "Photo: describe the creation, attach references, and select quality and resolution.") : c[image as "home" | "ads" | "studio"];
  const sectionVisual = section?.id === "getting-started" ? "home" : section?.id === "launch-campaigns" ? "ads" : section?.id === "studio-assistant" ? "studio-photo" : section?.id === "studio-slideshow" ? "studio-slideshow" : null;
  const figure = (image: string) => <figure className="docs-screenshot"><button onClick={() => setLightbox(image)} aria-label={`${c.enlarge} — ${visualCaption(image)}`}><Image src={visualPath(image)} width={1265} height={image.startsWith("studio-") ? 900 : 800} alt={visualCaption(image)} sizes="(max-width: 760px) 94vw, 780px"/></button><figcaption>{visualCaption(image)} <span>{locale === "fr" ? "Données de démonstration." : "Demo data."}</span></figcaption></figure>;
  const nav = (className: string) => <nav className={className} aria-label={c.contents}>
    <a className={`docs-nav-link ${!selected ? "is-active" : ""}`} href="#" aria-current={!selected ? "page" : undefined}><BookOpen size={16}/>{c.overview}</a>
    {groups.map(group => <div className="docs-nav-group" key={group}><p>{text(groupNames[group])}</p>{documentationSections.filter(s => s.group === group).map(s => <a key={s.id} href={`#${s.id}`} className={`docs-nav-link ${selected === s.id ? "is-active" : ""}`} aria-current={selected === s.id ? "page" : undefined}>{text(s.title)}<ChevronRight size={13}/></a>)}</div>)}
  </nav>;
  return <div className="docs-site" onClick={event => {
    const link = (event.target as HTMLElement).closest("a");
    if (link?.getAttribute("href")?.startsWith("#")) { setQuery(""); link.closest("details")?.removeAttribute("open"); }
  }}>
    <a href="#docs-content" className="docs-skip">{c.onPage}</a>
    <header className="docs-header"><div className="docs-header-inner">
      <Link href="/" className="docs-brand"><Image src="/vendeo-logo.webp" width={135} height={36} alt="Vendeo" priority/><span>{c.documentation}</span></Link>
      <div className="docs-header-actions"><div className="docs-language" role="group" aria-label={locale === "fr" ? "Langue" : "Language"}>{(["fr", "en"] as const).map(lang => <button key={lang} type="button" onClick={() => setLocale(lang)} aria-pressed={locale === lang} lang={lang}>{lang.toUpperCase()}</button>)}</div><Link href="/dashboard" className="docs-app-link">{c.app}<ArrowRight size={15}/></Link></div>
    </div></header>
    <div className="docs-layout"><aside className="docs-sidebar">{nav("docs-desktop-nav")}<Link className="docs-site-back" href="/"><ArrowLeft size={14}/>{c.back}</Link></aside>
      <main id="docs-content" className="docs-main" tabIndex={-1}>
        <div className="docs-mobile-nav"><details><summary>{section ? text(section.title) : c.contents}</summary>{nav("docs-mobile-links")}</details></div>
        <div className="docs-search"><Search size={19} aria-hidden="true"/><input type="search" aria-label={c.searchLabel} placeholder={c.search} value={query} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" onClick={() => setQuery("")} aria-label={c.clear}><X size={17}/></button>}</div>
        {query.trim() ? <section className="docs-results" aria-live="polite"><span className="docs-eyebrow">{c.searchFor}</span><h1>{results.length} {c.results}</h1>{results.length === 0 ? <div className="docs-empty"><h2>{c.noResults}</h2><p>{c.noResultsHelp}</p><button onClick={() => setQuery("")}>{c.reset}</button></div> : results.map(({section: s, article: a}) => <a className="docs-result" href={`#${s.id}/${a.id}`} key={`${s.id}/${a.id}`}><span>{text(s.title)}</span><h2>{text(a.title)}<ArrowRight size={16}/></h2><p>{text(a.paragraphs?.[0] || a.steps?.[0] || s.summary)}</p></a>)}</section>
        : !section ? <>
          <section className="docs-hero"><span className="docs-eyebrow"><span className="docs-status-dot"/>{c.documentation} Vendeo</span><h1>{c.intro}</h1><p>{c.description}</p><div className="docs-hero-meta"><span>{documentationSections.length} {c.guides}</span><span>{articleCount} {c.articles}</span><span>FR / EN</span></div><a className="docs-primary" href={`#${documentationSections[0]?.id}`}>{c.start}<ArrowRight size={17}/></a></section>
          <aside className="docs-callout"><BookOpen size={20}/><div><strong>{c.safety}</strong><p>{c.safetyText}</p></div></aside>
          <section className="docs-guide-index"><h2>{c.browse}</h2>{groups.map(group => <div key={group}><h3 className="docs-group-heading">{text(groupNames[group])}</h3><div className="docs-guide-grid">{documentationSections.filter(s => s.group === group).map((s, i) => <a className="docs-guide-card" key={s.id} href={`#${s.id}`}><span className="docs-guide-number">{String(i + 1).padStart(2, "0")}</span><h3>{text(s.title)}<ArrowRight size={17}/></h3><p>{text(s.summary)}</p><span className="docs-card-bottom">{s.articles.length} {c.articles}<ChevronRight size={14}/></span></a>)}</div></div>)}</section>
          <section className="docs-visuals"><h2>{c.visual}</h2><p>{c.visualHelp}</p>{["home", "ads", "studio-photo", "studio-slideshow"].map(image => <div key={image}>{figure(image)}</div>)}</section>
        </> : <>
          <div className="docs-breadcrumb"><a href="#">{c.documentation}</a><ChevronRight size={13}/><span>{text(groupNames[section.group])}</span></div>
          <header className="docs-article-header"><span className="docs-eyebrow">{text(groupNames[section.group])}</span><h1>{text(section.title)}</h1><p>{text(section.summary)}</p></header>
          <nav className="docs-in-page" aria-label={c.onPage}><strong>{c.onPage}</strong>{section.articles.map(a => <a href={`#${section.id}/${a.id}`} key={a.id}>{text(a.title)}<ChevronRight size={13}/></a>)}</nav>
          {sectionVisual && figure(sectionVisual)}
          <div className="docs-articles">{section.articles.map(a => { const id = `${section.id}/${a.id}`; return <article className="docs-article" key={a.id} id={id}><div className="docs-article-title"><h2>{text(a.title)}</h2><button onClick={() => void copyLink(id)} aria-label={copied === id ? c.copied : c.permalink} title={copied === id ? c.copied : c.permalink}>{copied === id ? <Check size={16}/> : <Copy size={16}/>}</button></div>{a.paragraphs?.map((p, i) => <p key={i}>{text(p)}</p>)}{a.bullets && <ul className="docs-bullets">{a.bullets.map((p, i) => <li key={i}>{text(p)}</li>)}</ul>}{a.steps && <ol className="docs-steps" aria-label={c.steps}>{a.steps.map((p, i) => <li key={i}><span>{i + 1}</span><p>{text(p)}</p></li>)}</ol>}{a.notice && <aside className="docs-article-note"><strong>{c.note}</strong><p>{text(a.notice)}</p></aside>}{a.links && <div className="docs-related">{a.links.map(link => <Link key={link.href} href={link.href}>{text(link.label)}<ArrowRight size={14}/></Link>)}</div>}</article>; })}</div>
          <nav className="docs-pagination" aria-label={c.contents}>{index > 0 ? <a href={`#${documentationSections[index - 1].id}`}><span>{c.previous}</span><strong><ArrowLeft size={15}/>{text(documentationSections[index - 1].title)}</strong></a> : <div/>}{index < documentationSections.length - 1 && <a href={`#${documentationSections[index + 1].id}`}><span>{c.next}</span><strong>{text(documentationSections[index + 1].title)}<ArrowRight size={15}/></strong></a>}</nav>
        </>}
        <footer className="docs-footer"><p>{c.footer}</p><div><Link href="/login">{c.login}</Link><Link href="/privacy">{c.privacy}</Link><Link href="/terms">{c.terms}</Link></div></footer>
      </main>
    </div>
    {lightbox && <div className="docs-lightbox" role="dialog" aria-modal="true" aria-label={c.enlarge} onClick={() => setLightbox(null)}><button ref={closeButton} onClick={() => setLightbox(null)} aria-label={c.close}><X size={24}/></button><Image src={visualPath(lightbox)} alt={visualCaption(lightbox)} width={1265} height={800} sizes="96vw"/></div>}
  </div>;
}
