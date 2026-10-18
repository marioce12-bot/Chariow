"use client";

import Link from "next/link";
import Image from "next/image";
import { AnimatedHeroTitle } from "@/components/AnimatedHeroTitle";
import { ArrowLeft, ArrowRight, Check, Layers, Rocket, Wand2, Menu, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { MarketingProductPreview } from "@/components/MarketingProductPreview";
import "@/app/marketing-fixes.css";
import "@/app/landing-premium.css";

const demos = [
  { fr: "Accueil", en: "Home", frAlt: "Aperçu de démonstration de l’accueil Vendeo", enAlt: "Vendeo home demonstration preview" },
  { fr: "Lancement de publicités", en: "Launch ads", frAlt: "Aperçu de démonstration du parcours de lancement de publicités", enAlt: "Demonstration preview of the ad launch flow" },
  { fr: "Studio IA", en: "AI Studio", frAlt: "Aperçu de démonstration du Studio IA", enAlt: "AI Studio demonstration preview" },
];

export function Marketing() {
  const { t, locale } = useI18n();
  const isEnglish = locale === "en";
  const demoLabels = demos.map((demo) => isEnglish ? demo.en : demo.fr);
  const [open, setOpen] = useState<number | null>(null);
  const [activeDemo, setActiveDemo] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [carouselHovered, setCarouselHovered] = useState(false);
  const [carouselFocused, setCarouselFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    if (carouselPaused || carouselHovered || carouselFocused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActiveDemo((current) => (current + 1) % demos.length), 5000);
    return () => window.clearInterval(timer);
  }, [carouselPaused, carouselHovered, carouselFocused]);
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
    <header className="marketing-header"><div className="container"><nav className="marketing-nav" aria-label={t("optionsExtra.text9")}>
      <Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40}/></Link>
      <div id="landing-navigation" className={`nav-links${mobileOpen ? " mobile-open" : ""}`}><a href="#comment" onClick={() => setMobileOpen(false)}>{t("landing.nav.how")}</a><a href="#fonctionnalites" onClick={() => setMobileOpen(false)}>{t("landing.nav.features")}</a><a href="#tarifs" onClick={() => setMobileOpen(false)}>{t("landing.nav.pricing")}</a><a href="#faq" onClick={() => setMobileOpen(false)}>{t("landing.nav.faq")}</a></div>
      <div className="marketing-actions"><Link className="btn btn-ghost" href="/login">{t("landing.nav.login")}</Link><Link className="btn btn-white" href="/register">{t("landing.nav.start")} <ArrowRight size={15}/></Link></div>
      <button className="landing-menu" type="button" aria-label={mobileOpen ? t("adminExtra.nav.close") : t("optionsExtra.text10")} aria-expanded={mobileOpen} aria-controls="landing-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X/> : <Menu/>}</button>
    </nav></div></header>

    <section className="hero landing-hero">
      <div className="landing-orb landing-orb-one" aria-hidden="true"/><div className="landing-orb landing-orb-two" aria-hidden="true"/>
      <div className="container landing-hero-inner">
        <div className="landing-hero-copy"><span className="landing-kicker"><i/> {t("landing.hero.stat")}</span>
          <AnimatedHeroTitle first={t("landing.hero.title1")} second={t("landing.hero.title2")} last={t("landing.hero.title3")} />
          <p className="hero-tagline">{t("sweep1.text117")}</p><p className="landing-intro">{t("landing.hero.paragraph")}</p>
          <div className="landing-hero-actions"><Link href="/register" className="btn btn-lime">{t("landing.hero.cta")} <ArrowRight size={17}/></Link><a className="landing-text-link" href="#apercu">{t("sweep2.text118")}{" "}<span>↓</span></a></div>
        </div>
          <div className="landing-showcase" id="apercu" onMouseEnter={() => setCarouselHovered(true)} onMouseLeave={() => setCarouselHovered(false)} onFocusCapture={() => setCarouselFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCarouselFocused(false); }}>
          <div className="showcase-topline"><span className="showcase-dots"><i/><i/><i/></span><span>Vendeo <b>•</b> {" "}{t("workspaceExtra.workspace")}</span><span className="showcase-live"><i/> Interface</span></div>
          <div className="showcase-tabs" role="tablist" onKeyDown={demoKey} aria-label={isEnglish ? "Product preview" : "Aperçu du produit"}>
            {demoLabels.map((label, i) => <button role="tab" tabIndex={activeDemo === i ? 0 : -1} type="button" id={`demo-tab-${i}`} aria-selected={activeDemo === i} aria-controls="demo-panel" key={label} onClick={() => setActiveDemo(i)}>{label}</button>)}
          </div>
          <div className="showcase-screen" id="demo-panel" role="tabpanel" aria-roledescription={isEnglish ? "slide" : "diapositive"} aria-label={`${demoLabels[activeDemo]} (${activeDemo + 1}/${demos.length})`} aria-labelledby={`demo-tab-${activeDemo}`}>
            <div key={activeDemo} className="showcase-transition" aria-label={isEnglish ? demos[activeDemo].enAlt : demos[activeDemo].frAlt}>
              {activeDemo === 0
                ? <Image src="/landing/dashboard-demo.webp" alt={isEnglish ? demos[0].enAlt : demos[0].frAlt} width={1265} height={649} sizes="(max-width: 850px) 95vw, 650px" priority className="showcase-image" />
                : <MarketingProductPreview slide={activeDemo === 1 ? 1 : 2} locale={isEnglish ? "en" : "fr"} />}
            </div>
            <div className="showcase-caption">{t("sweep1.text120")}</div>
          </div>
          <div className="carousel-controls" aria-label={isEnglish ? "Carousel controls" : "Commandes du carrousel"}>
            <button type="button" aria-label={isEnglish ? "Previous slide" : "Diapositive précédente"} onClick={() => setActiveDemo((activeDemo + demos.length - 1) % demos.length)}><ArrowLeft size={16}/></button>
            <span aria-live="polite" aria-atomic="true">{activeDemo + 1} / {demos.length}</span>
            <button type="button" aria-label={isEnglish ? "Next slide" : "Diapositive suivante"} onClick={() => setActiveDemo((activeDemo + 1) % demos.length)}><ArrowRight size={16}/></button>
            <button type="button" aria-pressed={carouselPaused} onClick={() => setCarouselPaused(!carouselPaused)} aria-label={carouselPaused ? (isEnglish ? "Resume automatic carousel" : "Reprendre le carrousel automatique") : (isEnglish ? "Pause automatic carousel" : "Mettre en pause le carrousel automatique")}>{carouselPaused ? <Play size={15}/> : <Pause size={15}/>}<span>{carouselPaused ? (isEnglish ? "Play" : "Lire") : (isEnglish ? "Pause" : "Pause")}</span></button>
          </div>
          <div className="showcase-foot"><span>{t("sweep2.text121")}</span><span>Chariow <b>↗</b></span></div>
        </div>
        <div className="landing-platforms"><span>{t("sweep3.text122")}</span><div className="logos"><span className="platform-logo"><Image src="/logos/chariow.svg" alt="Chariow" width={112} height={28}/></span><span className="platform-logo"><Image src="/logos/selar.png" alt="Selar" width={88} height={28}/><small>({t("landing.hero.soon")})</small></span><span className="platform-logo"><Image src="/logos/gumroad.svg" alt="Gumroad" width={105} height={28}/><small>({t("landing.hero.soon")})</small></span></div></div>
      </div>
    </section>

    <section className="section problem-section"><div className="container landing-reveal"><div className="section-head problem-section-head"><div><h2>{t("landing.problem.title1")}<br/>{t("landing.problem.title2")}</h2></div><p>{t("landing.problem.paragraph")}</p></div><div className="campaign-channels" aria-label={t("optionsExtra.text11")}><p className="campaign-channels-label">{t("sweep1.text123")}</p><div className="campaign-channel-list"><article className="campaign-channel"><strong>Meta</strong><span>Facebook &amp; Instagram</span><small>{t("sweep2.text124")}</small></article><article className="campaign-channel"><strong>Pinterest</strong><span>{t("sweep3.text125")}</span><small>{t("sweep2.text124")}</small></article><article className="campaign-channel"><strong>TikTok</strong><span>TikTok Ads</span><small>{t("sweep2.text124")}</small></article></div><p className="campaign-channels-note">{t("sweep1.text126")}</p></div><div className="problem-grid"><article className="problem-item"><strong>{t("landing.problem.p1Title")}</strong><p>{t("landing.problem.p1")}</p></article><article className="problem-item"><strong>{t("landing.problem.p2Title")}</strong><p>{t("landing.problem.p2")}</p></article><article className="problem-item"><strong>{t("landing.problem.p3Title")}</strong><p>{t("landing.problem.p3")}</p></article></div></div></section>

    <section className="section" id="comment"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.how.eyebrow")}</span><h2>{t("landing.how.title1")}<br/>{t("landing.how.title2")}</h2></div><p>{t("landing.how.paragraph")}</p></div><div className="how-grid"><div className="how-line"><div className="how-line-fill filled"/></div><article className="step-card"><span className="step-num mono">{t("landing.how.s1num")}</span><h3>{t("landing.how.s1title")}</h3><p>{t("landing.how.s1")}</p></article><article className="step-card"><span className="step-num mono">{t("landing.how.s2num")}</span><h3>{t("landing.how.s2title")}</h3><p>{t("landing.how.s2")}</p></article><article className="step-card"><span className="step-num mono">{t("landing.how.s3num")}</span><h3>{t("landing.how.s3title")}</h3><p>{t("landing.how.s3")}</p></article><article className="step-card"><span className="step-num mono">{t("landing.how.s4num")}</span><h3>{t("landing.how.s4title")}</h3><p>{t("landing.how.s4")}</p></article></div></div></section>

    <section className="section features-section" id="fonctionnalites"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.features.eyebrow")}</span><h2>{t("landing.features.title1")}<br/>{t("landing.features.title2")}</h2></div><p>{t("landing.features.paragraph")}</p></div><div className="feature-grid triple"><article className="feature-card dark"><Layers size={22}/><h3>{t("landing.features.f1title")}</h3><p>{t("landing.features.f1")}</p></article><article className="feature-card accent"><Wand2 size={22}/><h3>{t("landing.features.f2title")}</h3><p>{t("landing.features.f2")}</p></article><article className="feature-card light"><Rocket size={22}/><h3>{t("landing.features.f3title")}</h3><p>{t("landing.features.f3")}</p></article></div></div></section>

    <section className="section" id="tarifs"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.pricing.eyebrow")}</span><h2>{t("landing.pricing.title1")}<br/>{t("landing.pricing.title2")}</h2></div><p>{t("landing.pricing.paragraph")}</p></div><div className="pricing-wrap pricing-wrap-single"><article className="price-card pro"><span className="pill">{t("landing.pricing.pill")}</span><h3>Vendeo</h3><div className="price">{t("landing.pricing.price")} <small>{t("landing.pricing.perMonth")}</small></div><ul><li><Check className="check" size={15}/>{t("landing.pricing.b1")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b2")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b3")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b4")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b5")}</li></ul><Link href="/register" className="btn btn-lime" style={{width:"100%"}}>{t("landing.pricing.cta")} <ArrowRight size={15}/></Link></article></div></div></section>

    <section className="section" id="faq"><div className="container landing-reveal"><div className="section-head"><div><span className="eyebrow">{t("landing.faq.eyebrow")}</span><h2>{t("landing.faq.title1")}<br/>{t("landing.faq.title2")}</h2></div><p>{t("landing.faq.paragraph")}</p></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item" key={q}><button className="faq-question" onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i}>{q}<span>{open===i?"−":"+"}</span></button>{open===i&&<div className="faq-answer">{a}</div>}</div>)}</div></div></section>
    <section className="section landing-cta-section"><div className="container landing-reveal"><div className="cta"><span className="eyebrow">{t("landing.cta.eyebrow")}</span><h2>{t("landing.cta.title1")}<br/>{t("landing.cta.title2")}</h2><p>{t("landing.cta.paragraph")}</p><Link href="/register" className="btn btn-dark">{t("landing.cta.button")} <ArrowRight size={16}/></Link></div></div></section>
    <footer className="site-footer"><div className="container footer-row"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40}/></Link><div className="footer-links"><Link href="/about">{t("landing.footer.about")}</Link><Link href="/privacy">{t("landing.footer.privacy")}</Link><Link href="/terms">{t("landing.footer.terms")}</Link></div><span style={{color:"#91a3c8",fontSize:11}}>© 2026 Vendeo</span></div></footer>
  </main>;
}
