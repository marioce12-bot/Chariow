"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, Layers, Rocket, Wand2, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/marketing-fixes.css";
import "@/app/landing-premium.css";

const demos = [
  { label: "Vue d’ensemble", src: "/landing/dashboard-demo.webp", alt: "Aperçu du tableau de bord Vendeo" },
  { label: "Analyse des ventes", src: "/landing/profit-demo.webp", alt: "Aperçu de l’analyse des ventes" },
  { label: "Récupération", src: "/landing/recovery-demo.webp", alt: "Aperçu des outils de récupération" },
];

export function Marketing() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  const [activeDemo, setActiveDemo] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  function demoKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? demos.length - 1
      : (activeDemo + (event.key === "ArrowRight" ? 1 : -1) + demos.length) % demos.length;
    setActiveDemo(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }
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
    <header className="marketing-header"><div className="container"><nav className="marketing-nav" aria-label="Navigation principale">
      <Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40}/></Link>
      <div id="landing-navigation" className={`nav-links${mobileOpen ? " mobile-open" : ""}`}><a href="#comment" onClick={() => setMobileOpen(false)}>{t("landing.nav.how")}</a><a href="#fonctionnalites" onClick={() => setMobileOpen(false)}>{t("landing.nav.features")}</a><a href="#tarifs" onClick={() => setMobileOpen(false)}>{t("landing.nav.pricing")}</a><a href="#faq" onClick={() => setMobileOpen(false)}>{t("landing.nav.faq")}</a></div>
      <div className="marketing-actions"><Link className="btn btn-ghost" href="/login">{t("landing.nav.login")}</Link><Link className="btn btn-white" href="/register">{t("landing.nav.start")} <ArrowRight size={15}/></Link></div>
      <button className="landing-menu" type="button" aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={mobileOpen} aria-controls="landing-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X/> : <Menu/>}</button>
    </nav></div></header>

    <section className="hero landing-hero">
      <div className="landing-orb landing-orb-one" aria-hidden="true"/><div className="landing-orb landing-orb-two" aria-hidden="true"/>
      <div className="container landing-hero-inner">
        <div className="landing-hero-copy"><span className="landing-kicker"><i/> {t("landing.hero.stat")}</span>
          <h1 className="hero-title-gradient">{t("landing.hero.title1")} {t("landing.hero.title2")}<br/>{t("landing.hero.title3")}</h1>
          <p className="hero-tagline">Lancez vos campagnes sur Meta, Pinterest et TikTok.</p><p className="landing-intro">{t("landing.hero.paragraph")}</p>
          <div className="landing-hero-actions"><Link href="/register" className="btn btn-lime">{t("landing.hero.cta")} <ArrowRight size={17}/></Link><a className="landing-text-link" href="#apercu">Voir l’interface <span>↓</span></a></div>
        </div>
          <div className="landing-showcase" id="apercu">
          <div className="showcase-topline"><span className="showcase-dots"><i/><i/><i/></span><span>Vendeo <b>•</b> Espace de travail</span><span className="showcase-live"><i/> Interface</span></div>
          <div className="showcase-tabs" role="tablist" onKeyDown={demoKey} aria-label="Aperçus du produit">{demos.map((demo, i) => <button role="tab" tabIndex={activeDemo === i ? 0 : -1} type="button" id={`demo-tab-${i}`} aria-selected={activeDemo === i} aria-controls="demo-panel" key={demo.src} onClick={() => setActiveDemo(i)}>{demo.label}</button>)}</div>
          <div className="showcase-screen" id="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${activeDemo}`}><Image key={demos[activeDemo].src} src={demos[activeDemo].src} alt={demos[activeDemo].alt} width={1265} height={649} sizes="(max-width: 850px) 95vw, 650px" priority className="showcase-image"/><div className="showcase-caption">Aperçu du produit · données de démonstration</div></div>
          <div className="showcase-foot"><span>Une vue claire de votre activité</span><span>Chariow <b>↗</b></span></div>
        </div>
        <div className="landing-platforms"><span>Connectez votre espace</span><div className="logos"><span className="platform-logo"><Image src="/logos/chariow.svg" alt="Chariow" width={112} height={28}/></span><span className="platform-logo"><Image src="/logos/selar.png" alt="Selar" width={88} height={28}/><small>({t("landing.hero.soon")})</small></span><span className="platform-logo"><Image src="/logos/gumroad.svg" alt="Gumroad" width={105} height={28}/><small>({t("landing.hero.soon")})</small></span></div></div>
      </div>
    </section>

    <section className="section problem-section"><div className="container landing-reveal"><div className="section-head problem-section-head"><div><h2>{t("landing.problem.title1")}<br/>{t("landing.problem.title2")}</h2></div><p>{t("landing.problem.paragraph")}</p></div><div className="campaign-channels" aria-label="Canaux publicitaires pris en charge"><p className="campaign-channels-label">Préparez et lancez vos campagnes sur</p><div className="campaign-channel-list"><article className="campaign-channel"><strong>Meta</strong><span>Facebook &amp; Instagram</span><small>Connexion requise</small></article><article className="campaign-channel"><strong>Pinterest</strong><span>Publicités Pinterest</span><small>Connexion requise</small></article><article className="campaign-channel"><strong>TikTok</strong><span>TikTok Ads</span><small>Connexion requise</small></article></div><p className="campaign-channels-note">La connexion à chaque plateforme et sa validation sont nécessaires avant toute diffusion.</p></div><div className="problem-grid"><article className="problem-item"><strong>{t("landing.problem.p1Title")}</strong><p>{t("landing.problem.p1")}</p></article><article className="problem-item"><strong>{t("landing.problem.p2Title")}</strong><p>{t("landing.problem.p2")}</p></article><article className="problem-item"><strong>{t("landing.problem.p3Title")}</strong><p>{t("landing.problem.p3")}</p></article></div></div></section>

    <section className="section" id="comment"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.how.eyebrow")}</span><h2>{t("landing.how.title1")}<br/>{t("landing.how.title2")}</h2></div><p>{t("landing.how.paragraph")}</p></div><div className="how-grid"><div className="how-line"><div className="how-line-fill filled"/></div><article className="step-card"><span className="step-num mono">{t("landing.how.s1num")}</span><h3>{t("landing.how.s1title")}</h3><p>{t("landing.how.s1")}</p></article><article className="step-card"><span className="step-num mono">{t("landing.how.s2num")}</span><h3>{t("landing.how.s2title")}</h3><p>{t("landing.how.s2")}</p></article><article className="step-card"><span className="step-num mono">{t("landing.how.s3num")}</span><h3>{t("landing.how.s3title")}</h3><p>{t("landing.how.s3")}</p></article><article className="step-card"><span className="step-num mono">{t("landing.how.s4num")}</span><h3>{t("landing.how.s4title")}</h3><p>{t("landing.how.s4")}</p></article></div></div></section>

    <section className="section features-section" id="fonctionnalites"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.features.eyebrow")}</span><h2>{t("landing.features.title1")}<br/>{t("landing.features.title2")}</h2></div><p>{t("landing.features.paragraph")}</p></div><div className="feature-grid triple"><article className="feature-card dark"><Layers size={22}/><h3>{t("landing.features.f1title")}</h3><p>{t("landing.features.f1")}</p></article><article className="feature-card accent"><Wand2 size={22}/><h3>{t("landing.features.f2title")}</h3><p>{t("landing.features.f2")}</p></article><article className="feature-card light"><Rocket size={22}/><h3>{t("landing.features.f3title")}</h3><p>{t("landing.features.f3")}</p></article></div></div></section>

    <section className="section landing-product-section"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">Une interface conçue pour décider</span><h2>Vos données,<br/>en un regard.</h2></div><p>Explorez les principaux espaces Vendeo dans un aperçu interactif. Les écrans illustrent le produit avec des données de démonstration.</p></div><div className="product-detail"><div className="product-detail-copy"><span className="landing-kicker"><i/> Aperçu du produit · données de démonstration</span><h3>{demos[activeDemo].label}</h3><p>Retrouvez les informations utiles dans une interface claire, pensée pour accompagner votre activité sur Chariow.</p><div className="showcase-tabs product-tabs" role="tablist" onKeyDown={demoKey} aria-label="Choisir un écran à explorer">{demos.map((demo, i) => <button role="tab" tabIndex={activeDemo === i ? 0 : -1} type="button" id={`detail-tab-${i}`} aria-controls="detail-demo-panel" aria-selected={activeDemo === i} key={demo.src} onClick={() => setActiveDemo(i)}>{demo.label}</button>)}</div></div><div className="product-detail-screen" id="detail-demo-panel" role="tabpanel" aria-labelledby={`detail-tab-${activeDemo}`}><Image key={demos[activeDemo].src} src={demos[activeDemo].src} alt={demos[activeDemo].alt} width={1265} height={649} sizes="(max-width: 850px) 90vw, 650px" className="showcase-image"/><span>Aperçu du produit · données de démonstration</span></div></div></div></section>

    <section className="section" id="tarifs"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.pricing.eyebrow")}</span><h2>{t("landing.pricing.title1")}<br/>{t("landing.pricing.title2")}</h2></div><p>{t("landing.pricing.paragraph")}</p></div><div className="pricing-wrap pricing-wrap-single"><article className="price-card pro"><span className="pill">{t("landing.pricing.pill")}</span><h3>Vendeo</h3><div className="price">{t("landing.pricing.price")} <small>{t("landing.pricing.perMonth")}</small></div><ul><li><Check className="check" size={15}/>{t("landing.pricing.b1")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b2")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b3")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b4")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b5")}</li></ul><Link href="/register" className="btn btn-lime" style={{width:"100%"}}>{t("landing.pricing.cta")} <ArrowRight size={15}/></Link></article></div></div></section>

    <section className="section" id="faq"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.faq.eyebrow")}</span><h2>{t("landing.faq.title1")}<br/>{t("landing.faq.title2")}</h2></div><p>{t("landing.faq.paragraph")}</p></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item" key={q}><button className="faq-question" onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i}>{q}<span>{open===i?"−":"+"}</span></button>{open===i&&<div className="faq-answer">{a}</div>}</div>)}</div></div></section>
    <section className="section landing-cta-section"><div className="container landing-reveal"><div className="cta"><span className="eyebrow">{t("landing.cta.eyebrow")}</span><h2>{t("landing.cta.title1")}<br/>{t("landing.cta.title2")}</h2><p>{t("landing.cta.paragraph")}</p><Link href="/register" className="btn btn-dark">{t("landing.cta.button")} <ArrowRight size={16}/></Link></div></div></section>
    <footer className="site-footer"><div className="container footer-row"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40}/></Link><div className="footer-links"><Link href="/about">{t("landing.footer.about")}</Link><Link href="/privacy">{t("landing.footer.privacy")}</Link><Link href="/terms">{t("landing.footer.terms")}</Link></div><span style={{color:"#91a3c8",fontSize:11}}>© 2026 Vendeo</span></div></footer>
  </main>;
}
