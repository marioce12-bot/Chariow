"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, Layers, Rocket, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/proof-images.css";
import "@/app/marketing-fixes.css";

type ProofImage = { src: string; alt: string; height: number };

function AnimatedCounter({ end, duration = 1600, className, prefix = "", suffix = "" }: { end: number; duration?: number; className?: string; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            const startTime = performance.now();
            const step = (now: number) => {
              const progress = Math.min((now - startTime) / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              setCount(Math.floor(eased * end));
              if (progress < 1) requestAnimationFrame(step);
              else setCount(end);
            };
            requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref} className={className}>{prefix}{count}{suffix}</span>;
}

// Bandeau d'avatars sous "150+ créateurs actifs" — pas de vraies photos de
// profil disponibles ici, donc des initiales sur fond dégradé (façon avatar
// par défaut), dupliquées deux fois pour boucler sans coupure visible.
const CREATOR_AVATARS: Array<[string, string, string]> = [
  ["AK", "#8f2afb", "#103ef8"],
  ["MD", "#103ef8", "#029bfc"],
  ["FT", "#029bfc", "#22d3ee"],
  ["KY", "#f97316", "#f43f5e"],
  ["AM", "#22c55e", "#0ea5e9"],
  ["IB", "#8f2afb", "#ec4899"],
  ["ND", "#103ef8", "#6366f1"],
  ["SK", "#f59e0b", "#f97316"],
  ["KH", "#ec4899", "#8f2afb"],
  ["MS", "#0ea5e9", "#103ef8"],
  ["AD", "#22c55e", "#84cc16"],
  ["YA", "#f43f5e", "#f97316"],
];

function CreatorsMarquee() {
  return (
    <div className="creators-marquee" aria-hidden="true">
      <div className="creators-track">
        {[0, 1].map((copy) => (
          <div className="creators-group" key={copy}>
            {CREATOR_AVATARS.map(([initials, from, to], index) => (
              <span
                className="creators-avatar"
                key={`${copy}-${index}`}
                style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
              >
                {initials}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setInView(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } }, { threshold: 0.35 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, inView };
}

// Variable CSS --i qui fixe le rang d'un élément dans une cascade de
// révélation ; voir la classe "reveal-item" dans marketing-fixes.css.
function revealStyle(i: number) {
  return { "--i": i } as React.CSSProperties;
}

const heroImage = "/vendeo-hero-app.jpeg";

export function Marketing({ proofImages = [] }: { proofImages?: ProofImage[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  const heroReveal = useInView<HTMLDivElement>();
  const problemReveal = useInView<HTMLDivElement>();
  const howReveal = useInView<HTMLDivElement>();
  const howLine = useInView<HTMLDivElement>();
  const featuresReveal = useInView<HTMLDivElement>();
  const proofReveal = useInView<HTMLDivElement>();
  const pricingReveal = useInView<HTMLDivElement>();
  const faqReveal = useInView<HTMLDivElement>();
  const ctaReveal = useInView<HTMLDivElement>();

  const faqs: Array<[string, string]> = [
    [t("landing.faq.q1"), t("landing.faq.a1")],
    [t("landing.faq.q2"), t("landing.faq.a2")],
    [t("landing.faq.q3"), t("landing.faq.a3")],
    [t("landing.faq.q4"), t("landing.faq.a4")],
    [t("landing.faq.q5"), t("landing.faq.a5")],
    [t("landing.faq.q6"), t("landing.faq.a6")],
  ];

  return <main>
      <header className="marketing-header"><div className="container"><nav className="marketing-nav"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40}/></Link><div className="nav-links"><a href="#comment">{t("landing.nav.how")}</a><a href="#fonctionnalites">{t("landing.nav.features")}</a><a href="#tarifs">{t("landing.nav.pricing")}</a><a href="#faq">{t("landing.nav.faq")}</a></div><div className="marketing-actions"><Link className="btn btn-ghost" href="/login">{t("landing.nav.login")}</Link><Link className="btn btn-white" href="/register">{t("landing.nav.start")} <ArrowRight size={15}/></Link></div></nav></div></header>

      <section className="hero">
        <div className={`container hero-grid hero-vendeo-grid reveal-group${heroReveal.inView ? " is-visible" : ""}`} ref={heroReveal.ref}>
          <div className="hero-title hero-copy reveal-item" style={revealStyle(0)}>
            <h1 className="hero-title-gradient">{t("landing.hero.title1")}<br/>{t("landing.hero.title2")}<br/>{t("landing.hero.title3")}</h1>
            <p className="hero-tagline">{t("landing.hero.tagline")}</p>
          </div>

          <div className="hero-paragraph hero-copy reveal-item" style={revealStyle(1)}>
             <p>{t("landing.hero.paragraph")}</p>
          </div>

          <div className="hero-actions-block reveal-item" style={revealStyle(2)}>
            <div className="hero-actions">
              <Link href="/register" className="btn btn-lime">{t("landing.hero.cta")} <ArrowRight size={16}/></Link>
            </div>
            <div className="hero-stat-row">
              <div className="hero-stat"><strong><AnimatedCounter end={150} suffix="+"/></strong><span>{t("landing.hero.stat")}</span></div>
            </div>
            <CreatorsMarquee />
          </div>

          <div className="hero-preview reveal-item" style={revealStyle(3)}>
            <div className="dashboard-preview"><Image className="platform-preview-image" src={heroImage} alt="Aperçu de l’espace Vendeo" width={900} height={620} priority/></div>
          </div>
          <div className="hero-logos reveal-item" style={revealStyle(4)}>
            <div className="logos hero-logos-inner">
              <span className="platform-logo"><Image src="/logos/chariow.svg" alt="Chariow" width={132} height={32}/></span>
              <span className="platform-logo"><Image src="/logos/selar.png" alt="Selar" width={102} height={32}/><small>({t("landing.hero.soon")})</small></span>
              <span className="platform-logo"><Image src="/logos/gumroad.svg" alt="Gumroad" width={125} height={32}/><small>({t("landing.hero.soon")})</small></span>
            </div>
          </div>
        </div>
      </section>

      <section className="section problem-section">
        <div className={`container reveal-group${problemReveal.inView ? " is-visible" : ""}`} ref={problemReveal.ref}>
          <div className="section-head reveal-item" style={revealStyle(0)}><div><h2>{t("landing.problem.title1")}<br/>{t("landing.problem.title2")}</h2></div><p>{t("landing.problem.paragraph")}</p></div>
          <div className="problem-grid">
            <article className="problem-item reveal-item" style={revealStyle(1)}>
              <strong>{t("landing.problem.p1Title")}</strong>
              <p>{t("landing.problem.p1")}</p>
            </article>
            <article className="problem-item reveal-item" style={revealStyle(2)}>
              <strong>{t("landing.problem.p2Title")}</strong>
              <p>{t("landing.problem.p2")}</p>
            </article>
            <article className="problem-item reveal-item" style={revealStyle(3)}>
              <strong>{t("landing.problem.p3Title")}</strong>
              <p>{t("landing.problem.p3")}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="comment">
        <div className={`container reveal-group${howReveal.inView ? " is-visible" : ""}`} ref={howReveal.ref}>
          <div className="section-head reveal-item" style={revealStyle(0)}><div><span className="eyebrow">{t("landing.how.eyebrow")}</span><h2>{t("landing.how.title1")}<br/>{t("landing.how.title2")}</h2></div><p>{t("landing.how.paragraph")}</p></div>
          <div className="how-grid" ref={howLine.ref}>
            <div className="how-line"><div className={`how-line-fill ${howLine.inView ? "filled" : ""}`}/></div>
            <article className="step-card reveal-item" style={revealStyle(1)}><span className="step-num mono">{t("landing.how.s1num")}</span><h3>{t("landing.how.s1title")}</h3><p>{t("landing.how.s1")}</p></article>
            <article className="step-card reveal-item" style={revealStyle(2)}><span className="step-num mono">{t("landing.how.s2num")}</span><h3>{t("landing.how.s2title")}</h3><p>{t("landing.how.s2")}</p></article>
            <article className="step-card reveal-item" style={revealStyle(3)}><span className="step-num mono">{t("landing.how.s3num")}</span><h3>{t("landing.how.s3title")}</h3><p>{t("landing.how.s3")}</p></article>
            <article className="step-card reveal-item" style={revealStyle(4)}><span className="step-num mono">{t("landing.how.s4num")}</span><h3>{t("landing.how.s4title")}</h3><p>{t("landing.how.s4")}</p></article>
          </div>
        </div>
      </section>

      <section className="section features-section" id="fonctionnalites">
        <div className={`container reveal-group${featuresReveal.inView ? " is-visible" : ""}`} ref={featuresReveal.ref}>
          <div className="section-head reveal-item" style={revealStyle(0)}><div><span className="eyebrow">{t("landing.features.eyebrow")}</span><h2>{t("landing.features.title1")}<br/>{t("landing.features.title2")}</h2></div><p>{t("landing.features.paragraph")}</p></div>
          <div className="feature-grid triple">
            <article className="feature-card dark reveal-item" style={revealStyle(1)}>
              <Layers size={22}/>
              <h3>{t("landing.features.f1title")}</h3>
              <p>{t("landing.features.f1")}</p>
            </article>
            <article className="feature-card accent reveal-item" style={revealStyle(2)}>
              <Wand2 size={22}/>
              <h3>{t("landing.features.f2title")}</h3>
              <p>{t("landing.features.f2")}</p>
            </article>
            <article className="feature-card light reveal-item" style={revealStyle(3)}>
              <Rocket size={22}/>
              <h3>{t("landing.features.f3title")}</h3>
              <p>{t("landing.features.f3")}</p>
            </article>
          </div>
        </div>
      </section>

     {proofImages.length ? <section className="section" style={{paddingTop:0}}><div className={`container reveal-group${proofReveal.inView ? " is-visible" : ""}`} ref={proofReveal.ref}><div className="section-head reveal-item" style={revealStyle(0)}><div><span className="eyebrow">{t("landing.proof.eyebrow")}</span><h2>{t("landing.proof.title1")}<br/>{t("landing.proof.title2")}</h2></div><p>{t("landing.proof.paragraph")}</p></div></div><div className="proof-carousel"><div className="proof-track">{[0,1].map((copy) => <div className="proof-group" key={copy} aria-hidden={copy===1}>{proofImages.map((proof) => <div className="proof-card" key={`${copy}-${proof.src}`}><Image src={proof.src} alt={proof.alt} width={497} height={proof.height}/></div>)}</div>)}</div></div></section> : null}

      <section className="section" id="tarifs"><div className={`container reveal-group${pricingReveal.inView ? " is-visible" : ""}`} ref={pricingReveal.ref}><div className="section-head reveal-item" style={revealStyle(0)}><div><span className="eyebrow">{t("landing.pricing.eyebrow")}</span><h2>{t("landing.pricing.title1")}<br/>{t("landing.pricing.title2")}</h2></div><p>{t("landing.pricing.paragraph")}</p></div><div className="pricing-wrap" style={{maxWidth:400,margin:'0 auto'}}><article className="price-card pro reveal-item" style={revealStyle(1)}><span className="pill" style={{marginBottom:18}}>{t("landing.pricing.pill")}</span><h3>Vendeo</h3><div className="price">{t("landing.pricing.price")} <small>{t("landing.pricing.perMonth")}</small></div><ul><li><Check className="check" size={15}/>{t("landing.pricing.b1")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b2")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b3")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b4")}</li><li><Check className="check" size={15}/>{t("landing.pricing.b5")}</li></ul><Link href="/register" className="btn btn-lime" style={{width:'100%'}}>{t("landing.pricing.cta")} <ArrowRight size={15}/></Link></article></div></div></section>

    <section className="section" id="faq"><div className={`container reveal-group${faqReveal.inView ? " is-visible" : ""}`} ref={faqReveal.ref}><div className="section-head reveal-item" style={revealStyle(0)}><div><span className="eyebrow">{t("landing.faq.eyebrow")}</span><h2>{t("landing.faq.title1")}<br/>{t("landing.faq.title2")}</h2></div><p>{t("landing.faq.paragraph")}</p></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item reveal-item" style={revealStyle(i+1)} key={q}><button className="faq-question" onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i}>{q}<span>{open===i?'−':'+'}</span></button>{open===i&&<div className="faq-answer">{a}</div>}</div>)}</div></div></section>

     <section className="section" style={{paddingTop:0}}><div className={`container reveal-group${ctaReveal.inView ? " is-visible" : ""}`} ref={ctaReveal.ref}><div className="cta reveal-item" style={revealStyle(0)}><span className="eyebrow">{t("landing.cta.eyebrow")}</span><h2>{t("landing.cta.title1")}<br/>{t("landing.cta.title2")}</h2><p>{t("landing.cta.paragraph")}</p><Link href="/register" className="btn btn-dark">{t("landing.cta.button")} <ArrowRight size={16}/></Link></div></div></section>

      <footer className="site-footer"><div className="container footer-row"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40}/></Link><div className="footer-links"><Link href="/about">{t("landing.footer.about")}</Link><Link href="/privacy">{t("landing.footer.privacy")}</Link><Link href="/terms">{t("landing.footer.terms")}</Link><a href="mailto:hello@vendeo.studio">{t("landing.footer.contact")}</a></div><span style={{color:'#91a3c8',fontSize:11}}>© 2026 Vendeo</span></div></footer>
  </main>;
}
