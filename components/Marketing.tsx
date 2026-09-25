"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, Layers, Rocket, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "@/app/proof-images.css";

type ProofImage = { src: string; alt: string; height: number };

const faqs = [
  ["Est-ce que je dois installer quelque chose ?", "Non. Tout se passe dans ton navigateur, sur ordinateur ou mobile. Connecte ta boutique et commence à poser tes questions."],
  ["Quelles plateformes sont compatibles ?", "Chariow est disponible au lancement. Selar, Gumroad et d'autres plateformes arriveront progressivement."],
  ["Le Studio IA, ça fonctionne comment ?", "Tu choisis un produit, tu décris ce que tu veux (une affiche, une vidéo) et l'IA s'occupe de la réalisation à partir de ta fiche produit."],
  ["Si ma campagne est refusée par Meta, je perds mon argent ?", "Non. Le paiement couvre ton budget publicitaire ; si Meta ou TikTok refuse la campagne, tu peux la relancer sans payer une seconde fois."],
  ["Est-ce que mes données sont en sécurité ?", "Tes tokens sont chiffrés et tes données servent uniquement à produire les analyses demandées dans ton espace."],
  ["Puis-je annuler mon abonnement ?", "Oui, tu peux annuler depuis ton espace, sans frais cachés."],
];

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

/** Un seul hook de révélation au scroll, réutilisé pour l'unique moment animé
 * ajouté à cette page (le trait qui relie les 4 étapes) — plutôt que de
 * répéter fade-in/hover sur chaque carte, ce qui devient vite un tic visuel
 * générique. Respecte prefers-reduced-motion en affichant l'état final direct. */
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

// Aperçu produit dans le hero — image fournie, à la place des mockups du tableau de bord.
const heroImage = "/vendeo-hero-app.jpeg";

export function Marketing({ proofImages = [] }: { proofImages?: ProofImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const howLine = useInView<HTMLDivElement>();

  return <main>
      <header className="marketing-header"><div className="container"><nav className="marketing-nav"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40}/></Link><div className="nav-links"><a href="#comment">Comment ça marche</a><a href="#fonctionnalites">Fonctionnalités</a><a href="#tarifs">Tarifs</a><a href="#faq">FAQ</a></div><div className="marketing-actions"><Link className="btn btn-ghost" href="/login">Se connecter</Link><Link className="btn btn-white" href="/register">Commencer <ArrowRight size={15}/></Link></div></nav></div></header>

      <section className="hero">
        <div className="container hero-grid hero-vendeo-grid">
          <div className="hero-title hero-copy">
            <h1 className="hero-title-gradient">Vends, analyse et<br/>lance tes publicités.<br/>Sans changer d'outil.</h1>
            <p className="hero-tagline">Ta boutique, tes campagnes, ton studio créatif.</p>
          </div>

          <div className="hero-paragraph hero-copy">
             <p>Vendeo réunit ta boutique, tes comptes publicitaires et un studio de création IA au même endroit — pour comprendre ce qui marche, créer tes visuels et lancer tes campagnes sans jongler entre cinq outils.</p>
          </div>

          <div className="hero-actions-block">
            <div className="hero-actions">
              <Link href="/register" className="btn btn-lime">Commencer gratuitement <ArrowRight size={16}/></Link>
            </div>
            <div className="hero-stat-row">
              <div className="hero-stat"><strong><AnimatedCounter end={150} suffix="+"/></strong><span>créateurs actifs</span></div>
              <div className="hero-stat"><strong><AnimatedCounter end={98} suffix="%"/></strong><span>du budget va à ta pub</span></div>
              <div className="hero-stat"><strong>2</strong><span>plateformes pub reliées</span></div>
            </div>
          </div>

          <div className="hero-preview">
            <div className="dashboard-preview"><Image className="platform-preview-image" src={heroImage} alt="Aperçu de l’espace Vendeo" width={900} height={620} priority/></div>
          </div>
          <div className="hero-logos">
            <div className="logos hero-logos-inner">
              <span className="platform-logo"><Image src="/logos/chariow.svg" alt="Chariow" width={132} height={32}/></span>
              <span className="platform-logo"><Image src="/logos/selar.png" alt="Selar" width={102} height={32}/><small>(bientôt)</small></span>
              <span className="platform-logo"><Image src="/logos/gumroad.svg" alt="Gumroad" width={125} height={32}/><small>(bientôt)</small></span>
            </div>
          </div>
        </div>
      </section>

      <section className="section problem-section">
        <div className="container">
          <div className="section-head"><div><h2>Aujourd'hui, tout est éclaté<br/>entre plusieurs outils.</h2></div><p>Ta boutique dans un onglet, Meta Business Suite dans un autre, un logiciel de montage pour chaque visuel — et aucun endroit pour voir si tout ça rapporte vraiment.</p></div>
          <div className="problem-grid">
            <article className="problem-item">
              <strong>Tu ne sais pas ce qui rapporte.</strong>
              <p>Tes ventes sont sur ta boutique, tes dépenses sur Meta Ads. Impossible de savoir en un coup d'œil si une campagne te fait gagner ou perdre de l'argent.</p>
            </article>
            <article className="problem-item">
              <strong>Créer un visuel prend des heures.</strong>
              <p>Chaque nouveau produit demande une affiche ou une vidéo publicitaire — et tout le monde n'a pas un logiciel de montage ou un designer sous la main.</p>
            </article>
            <article className="problem-item">
              <strong>Tu payes avant de savoir.</strong>
              <p>Une campagne peut être refusée après paiement. Tu te retrouves à repayer, ou à laisser tomber.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="comment">
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">Une seule plateforme</span><h2>De la boutique à la<br/>campagne publiée.</h2></div><p>Quatre étapes, dans Vendeo, sans repasser par cinq outils différents.</p></div>
          <div className="how-grid" ref={howLine.ref}>
            <div className="how-line"><div className={`how-line-fill ${howLine.inView ? "filled" : ""}`}/></div>
            <article className="step-card"><span className="step-num mono">01 / CONNECTER</span><h3>Ta boutique et tes pubs</h3><p>Relie ta boutique Chariow et ton compte Meta Ads. Tes ventes et tes dépenses arrivent automatiquement.</p></article>
            <article className="step-card"><span className="step-num mono">02 / COMPRENDRE</span><h3>Ton ROAS réel</h3><p>Vendeo calcule ta rentabilité réelle et repère les campagnes qui perdent de l'argent avant qu'elles ne coûtent plus cher.</p></article>
            <article className="step-card"><span className="step-num mono">03 / CRÉER</span><h3>Ton visuel ou ta vidéo</h3><p>Décris ce que tu veux : le Studio IA génère l'affiche ou la vidéo publicitaire à partir de ta fiche produit.</p></article>
            <article className="step-card"><span className="step-num mono">04 / LANCER</span><h3>Ta campagne</h3><p>Tu payes, la campagne part directement chez Meta ou TikTok. Refusée ? Tu la relances sans repayer.</p></article>
          </div>
        </div>
      </section>

      <section className="section features-section" id="fonctionnalites">
        <div className="container">
          <div className="section-head"><div><span className="eyebrow">Trois choses à la fois</span><h2>Un copilote, pas juste<br/>un tableau de chiffres.</h2></div><p>Vendeo analyse, crée et lance — les trois étapes qui, ailleurs, demandent trois outils séparés.</p></div>
          <div className="feature-grid triple">
            <article className="feature-card dark">
              <Layers size={22}/>
              <h3>Sais où va ton argent.</h3>
              <p>Chiffre d'affaires, dépenses publicitaires, ROAS et CPA au même endroit. Vendeo te dit quelles campagnes couper avant qu'elles ne te coûtent plus cher.</p>
            </article>
            <article className="feature-card accent">
              <Wand2 size={22}/>
              <h3>Crée sans designer.</h3>
              <p>Choisis un produit, décris ce que tu veux — le Studio IA génère ton affiche ou ta vidéo publicitaire directement à partir de ta fiche produit.</p>
            </article>
            <article className="feature-card light">
              <Rocket size={22}/>
              <h3>Lance en confiance.</h3>
              <p>Tu payes une fois ta campagne prête. Elle part chez Meta ou TikTok ; si elle est refusée, tu la relances sans repayer.</p>
            </article>
          </div>
        </div>
      </section>

     {proofImages.length ? <section className="section" style={{paddingTop:0}}><div className="container"><div className="section-head"><div><span className="eyebrow">Ils utilisent déjà Vendeo</span><h2>Des créateurs qui voient<br/>leurs vrais résultats.</h2></div><p>Captures réelles des tableaux de bord Chariow de créateurs connectés à Vendeo : leurs ventes, leurs publicités, leurs chiffres.</p></div></div><div className="proof-carousel"><div className="proof-track">{[0,1].map((copy) => <div className="proof-group" key={copy} aria-hidden={copy===1}>{proofImages.map((proof) => <div className="proof-card" key={`${copy}-${proof.src}`}><Image src={proof.src} alt={proof.alt} width={497} height={proof.height}/></div>)}</div>)}</div></div></section> : null}

      <section className="section" id="tarifs"><div className="container"><div className="section-head"><div><span className="eyebrow">Un prix simple</span><h2>Un seul plan.<br/>Tout inclus.</h2></div><p>15 jours d'essai gratuit, puis un abonnement unique pour continuer à utiliser Vendeo.</p></div><div className="pricing-wrap" style={{maxWidth:400,margin:'0 auto'}}><article className="price-card pro"><span className="pill" style={{marginBottom:18}}>Essai gratuit — 15 jours</span><h3>Vendeo</h3><div className="price">2 000 XOF <small>/ mois</small></div><ul><li><Check className="check" size={15}/>Analyse IA illimitée de tes ventes et de tes pubs</li><li><Check className="check" size={15}/>Jusqu'à 3 boutiques Chariow connectées</li><li><Check className="check" size={15}/>Facebook, Instagram, TikTok, WhatsApp et plus</li><li><Check className="check" size={15}/>Studio IA (visuels et vidéos publicitaires)</li><li><Check className="check" size={15}/>75 crédits Studio offerts à l'inscription</li></ul><Link href="/register" className="btn btn-lime" style={{width:'100%'}}>Démarrer mon essai gratuit <ArrowRight size={15}/></Link></article></div></div></section>

    <section className="section" id="faq"><div className="container"><div className="section-head"><div><span className="eyebrow">Questions fréquentes</span><h2>Tout est<br/>plus clair.</h2></div><p>Une question que tu ne vois pas ici ? Écris-nous, on te répond.</p></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item" key={q}><button className="faq-question" onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i}>{q}<span>{open===i?'−':'+'}</span></button>{open===i&&<div className="faq-answer">{a}</div>}</div>)}</div></div></section>

     <section className="section" style={{paddingTop:0}}><div className="container"><div className="cta"><span className="eyebrow">Ton prochain bon choix</span><h2>Une seule plateforme pour<br/>vendre, créer et lancer.</h2><p>Connecte ta boutique et tes comptes publicitaires pour centraliser tes données, créer tes visuels et lancer tes campagnes en confiance.</p><Link href="/register" className="btn btn-dark">Créer mon espace <ArrowRight size={16}/></Link></div></div></section>

      <footer className="site-footer"><div className="container footer-row"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40}/></Link><div className="footer-links"><Link href="/about">À propos</Link><Link href="/privacy">Confidentialité</Link><Link href="/terms">Conditions</Link><a href="mailto:hello@vendeo.studio">Contact</a></div><span style={{color:'#91a3c8',fontSize:11}}>© 2026 Vendeo</span></div></footer>
  </main>;
}
