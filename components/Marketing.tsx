"use client";

import Link from "next/link";
import Image from "next/image";
import { DigitalWorkspaceVisual } from "@/components/DigitalWorkspaceVisual";
import { ArrowRight, Check, Layers, Rocket, Wand2, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/marketing-fixes.css";
import "@/app/landing-premium.css";
import "@/app/landing-preview-layout.css";
import "@/app/landing-side-reveal.css";
import "@/app/docs-entry.css";
import "@/app/landing-digital-hero.css";

export function Marketing() {
  const { t, locale } = useI18n();
  const isEnglish = locale === "en";
  const [open, setOpen] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const root = document.querySelector(".landing-premium");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    root.classList.add("reveal-enabled");
    const items = root.querySelectorAll<HTMLElement>(".landing-reveal");
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    items.forEach((item) => observer.observe(item));
    return () => { observer.disconnect(); root.classList.remove("reveal-enabled"); };
  }, []);
  const faqs: Array<[string, string]> = [
    [t("landing.faq.q1"), t("landing.faq.a1")], [t("landing.faq.q2"), t("landing.faq.a2")],
    [t("landing.faq.q3"), t("landing.faq.a3")], [t("landing.faq.q4"), t("landing.faq.a4")],
    [t("landing.faq.q5"), t("landing.faq.a5")], [t("landing.faq.q6"), t("landing.faq.a6")],
  ];
  return <main className="landing-premium">
    <header className="marketing-header"><div className="container"><nav className="marketing-nav" aria-label={t("optionsExtra.text9")}>
      <Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40}/></Link>
      <div id="landing-navigation" className={`nav-links${mobileOpen ? " mobile-open" : ""}`}><a href="#comment" onClick={() => setMobileOpen(false)}>{t("landing.nav.how")}</a><a href="#fonctionnalites" onClick={() => setMobileOpen(false)}>{t("landing.nav.features")}</a><a href="#tarifs" onClick={() => setMobileOpen(false)}>{t("landing.nav.pricing")}</a><a href="#faq" onClick={() => setMobileOpen(false)}>{t("landing.nav.faq")}</a><Link href="/docs" className="landing-docs-link" onClick={() => setMobileOpen(false)}>Documentation <span aria-hidden="true">↗</span></Link></div>
      <div className="marketing-actions"><Link className="btn btn-ghost" href="/login">{t("landing.nav.login")}</Link><Link className="btn btn-white" href="/register">{t("landing.nav.start")} <ArrowRight size={15}/></Link></div>
      <button className="landing-menu" type="button" aria-label={mobileOpen ? t("adminExtra.nav.close") : t("optionsExtra.text10")} aria-expanded={mobileOpen} aria-controls="landing-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X/> : <Menu/>}</button>
    </nav></div></header>

    <section className="hero landing-hero digital-hero">

      <div className="container landing-hero-inner">
        <div className="landing-hero-copy"><span className="landing-kicker"><i/> {isEnglish ? "FOR DIGITAL PRODUCT SELLERS" : "POUR LES VENDEURS DE PRODUITS DIGITAUX"}</span>
          <h1 className="digital-hero-title">{isEnglish ? "Your store. Your campaigns." : "Ta boutique. Tes campagnes."}<span>{isEnglish ? "Review the available data in Vendeo." : "Consulte les données disponibles dans Vendeo."}</span></h1>
          <p className="landing-intro">{isEnglish ? "Create ad images with AI Studio, prepare campaigns on Meta, TikTok or Pinterest, then review available orders and data in Vendeo." : "Crée des images publicitaires avec le Studio IA, prépare tes campagnes sur Meta, TikTok ou Pinterest, puis consulte les commandes et données disponibles dans Vendeo."}</p>
          <div className="landing-hero-actions"><Link href="/register" className="btn btn-lime">{isEnglish ? "Start my free trial" : "Lancer mon essai gratuit"} <ArrowRight size={18}/></Link><a className="landing-text-link" href="#apercu">{isEnglish ? "See how it works" : "Découvrir comment ça marche"}{" "}<span>↓</span></a></div>
          <p className="digital-trial"><Check size={14} aria-hidden="true"/>{isEnglish ? "5-day trial · 100 Studio credits offered at signup" : "5 jours d’essai · 100 crédits Studio offerts à l'inscription"}</p>
          <ul className="digital-benefits" aria-label={isEnglish ? "Your workflow" : "Ton parcours avec Vendeo"}>
            <li><Layers size={18} aria-hidden="true"/><span>{isEnglish ? "Your Chariow store" : "Ta boutique Chariow"}</span></li>
            <li><Wand2 size={18} aria-hidden="true"/><span>{isEnglish ? "Campaigns prepared" : "Campagnes préparées"}</span></li>
            <li><Rocket size={18} aria-hidden="true"/><span>{isEnglish ? "Available data reviewed" : "Données disponibles consultées"}</span></li>
          </ul>
        </div>
        <DigitalWorkspaceVisual isEnglish={isEnglish} />
      </div>
    </section>

    <section className="section problem-section"><div className="container landing-reveal"><div className="section-head problem-section-head"><div><h2>{t("landing.problem.title1")}<br/>{t("landing.problem.title2")}</h2></div><p>{t("landing.problem.paragraph")}</p></div><div className="problem-grid"><article className="problem-item"><strong>{t("landing.problem.p1Title")}</strong><p>{t("landing.problem.p1")}</p></article><article className="problem-item"><strong>{t("landing.problem.p2Title")}</strong><p>{t("landing.problem.p2")}</p></article><article className="problem-item"><strong>{t("landing.problem.p3Title")}</strong><p>{t("landing.problem.p3")}</p></article></div></div></section>

    <section className="section" id="comment"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.how.eyebrow")}</span><h2>{t("landing.how.title1")}<br/>{t("landing.how.title2")}</h2></div><p>{t("landing.how.paragraph")}</p></div><div className="how-grid"><div className="how-line"><div className="how-line-fill filled"/></div>
      <article className="step-card"><span className="step-num mono">{t("landing.how.s1num")}</span><Image className="journey-screenshot" src={isEnglish ? "/landing/actual-home-en.webp" : "/landing/actual-home-fr.webp"} alt={isEnglish ? "Vendeo overview screen with demo data" : "Écran d’accueil Vendeo avec des données de démonstration"} width={1265} height={800}/><h3>{t("landing.how.s1title")}</h3><p>{t("landing.how.s1")}</p></article>
      <article className="step-card"><span className="step-num mono">{t("landing.how.s2num")}</span><h3>{t("landing.how.s2title")}</h3><p>{t("landing.how.s2")}</p></article>
      <article className="step-card"><span className="step-num mono">{t("landing.how.s3num")}</span><Image className="journey-screenshot" src={isEnglish ? "/landing/actual-ads-en.webp" : "/landing/actual-ads-fr.webp"} alt={isEnglish ? "Vendeo campaign setup screen with demo data" : "Écran Vendeo de configuration d’une campagne avec des données de démonstration"} width={1265} height={800}/><h3>{t("landing.how.s3title")}</h3><p>{t("landing.how.s3")}</p></article>
      <article className="step-card"><span className="step-num mono">{t("landing.how.s4num")}</span><h3>{t("landing.how.s4title")}</h3><p>{t("landing.how.s4")}</p></article></div><p className="journey-disclaimer">{t("landing.how.captureNote")}</p></div></section>

    <section className="section features-section" id="fonctionnalites"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.proof.eyebrow")}</span><h2>{t("landing.proof.title1")}<br/>{t("landing.proof.title2")}</h2></div><p>{t("landing.features.paragraph")}</p></div><div className="feature-grid triple"><article className="feature-card dark"><Layers size={22}/><h3>{t("landing.features.f1title")}</h3><p>{t("landing.features.f1")}</p></article><article className="feature-card accent"><Wand2 size={22}/><h3>{t("landing.features.f2title")}</h3><p>{t("landing.features.f2")}</p></article><article className="feature-card light"><Rocket size={22}/><h3>{t("landing.features.f3title")}</h3><p>{t("landing.features.f3")}</p></article></div><p className="product-proof-note">{t("landing.proof.paragraph")}</p></div></section>

    <section className="section" id="tarifs"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.pricing.eyebrow")}</span><h2>{t("landing.pricing.title1")}<br/>{t("landing.pricing.title2")}</h2></div><p>{t("landing.pricing.paragraph")}</p></div><div className="pricing-wrap pricing-wrap-single"><article className="price-card pro"><span className="pill">{t("landing.pricing.pill")}</span><h3>Vendeo</h3><div className="price">{t("landing.pricing.price")} <small>{t("landing.pricing.perMonth")}</small></div><ul><li><Check className="check" size={15}/>{t("landing.pricing.b1")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b2")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b3")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b4")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b5")}</li></ul><Link href="/register" className="btn btn-lime" style={{width:"100%"}}>{t("landing.pricing.cta")} <ArrowRight size={15}/></Link></article></div></div></section>

    <section className="section" id="faq"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.faq.eyebrow")}</span><h2>{t("landing.faq.title1")}<br/>{t("landing.faq.title2")}</h2></div><p>{t("landing.faq.paragraph")}</p></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item" key={q}><button className="faq-question" onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i}>{q}<span>{open===i?"−":"+"}</span></button>{open===i&&<div className="faq-answer">{a}</div>}</div>)}</div></div></section>
    <section className="section landing-cta-section"><div className="container landing-reveal"><div className="cta"><span className="eyebrow">{t("landing.cta.eyebrow")}</span><h2>{t("landing.cta.title1")}<br/>{t("landing.cta.title2")}</h2><p>{t("landing.cta.paragraph")}</p><Link href="/register" className="btn btn-dark">{t("landing.cta.button")} <ArrowRight size={16}/></Link></div></div></section>
    <footer className="site-footer"><div className="container footer-row"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40}/></Link><div className="footer-links"><Link href="/docs">Documentation</Link><Link href="/about">{t("landing.footer.about")}</Link><Link href="/privacy">{t("landing.footer.privacy")}</Link><Link href="/terms">{t("landing.footer.terms")}</Link></div><span style={{color:"#91a3c8",fontSize:11}}>© 2026 Vendeo</span></div></footer>
  </main>;
}
