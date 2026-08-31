"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { useState } from "react";

const faqs = [
  ["Est-ce que je dois installer quelque chose ?", "Non. Tout se passe dans ton navigateur, sur ordinateur ou mobile. Connecte ta boutique et commence à poser tes questions."],
  ["Quelles plateformes sont compatibles ?", "Chariow est disponible au lancement. Selar, Gumroad et d'autres plateformes arriveront progressivement."],
  ["Que se passe-t-il si j'atteins ma limite ?", "Les messages sont bloqués jusqu'au renouvellement de ton abonnement. Tu peux aussi passer au plan Pro à tout moment."],
  ["Est-ce que mes données sont en sécurité ?", "Tes tokens sont chiffrés et tes données servent uniquement à produire les analyses demandées dans ton espace."],
  ["Puis-je annuler mon abonnement ?", "Oui, tu peux annuler ou changer de plan depuis ton espace, sans frais cachés."],
];

function Preview() {
  const previews = [
    ["/vendeo-platform-preview.png", "Vue d’ensemble des ventes et des décisions Vendeo"],
    ["/vendeo-preview-profit.png", "Assistant de rentabilité Vendeo"],
    ["/vendeo-preview-dashboard.png", "Analyse des performances publicitaires Vendeo"],
  ];
  return <div className="dashboard-preview animated-preview" aria-label="Aperçu animé de Vendeo">
    {previews.map(([src, alt], index) => <Image key={src} className="platform-preview-image preview-slide" src={src} alt={alt} width={900} height={620} priority={index === 0} style={{ animationDelay: `${index * 4.2}s` }} />)}
  </div>;
}

export function Marketing() {
  const [open, setOpen] = useState<number | null>(null);
  return <main>
      <header className="marketing-header"><div className="container"><nav className="marketing-nav"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40}/></Link><div className="nav-links"><a href="#fonctionnalites">Fonctionnalités</a><a href="#comment">Comment ça marche</a><a href="#tarifs">Tarifs</a><a href="#faq">FAQ</a></div><div className="marketing-actions"><Link className="btn btn-ghost" href="/login">Se connecter</Link><Link className="btn btn-white" href="/register">Commencer <ArrowRight size={15}/></Link></div></nav></div></header>
       <section className="hero">
        <div className="container hero-grid hero-vendeo-grid">
          <div className="hero-title hero-copy">
             <h1>Gère, analyse et optimise<br/>ton activité digitale.<br/><em>Depuis un seul espace</em></h1>
          </div>

          <div className="hero-paragraph hero-copy">
             <p>Connecte ta boutique et tes comptes publicitaires. Centralise tes ventes, tes campagnes et tes performances pour comprendre ce qui fonctionne et décider quoi améliorer.</p>
          </div>

          <div className="hero-actions-block">
            <div className="hero-actions">
              <Link href="/register" className="btn btn-lime">Commencer gratuitement <ArrowRight size={16}/></Link>
              <a href="#comment" className="btn" style={{border:'1px solid rgba(255,255,255,.3)',color:'white'}}>Voir comment ça marche</a>
            </div>
             <div className="hero-note">✓ Boutique et publicités réunies &nbsp; · &nbsp; ✓ Analyses approfondies &nbsp; · &nbsp; ✓ Recommandations concrètes</div>
          </div>

          <div className="hero-preview">
            <Preview/>
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
      <section className="section" id="comment"><div className="container"><div className="section-head"><div><span className="eyebrow">Une seule plateforme</span><h2>Moins d’allers-retours.<br/>Plus de visibilité.</h2></div><p>Connecte tes outils et retrouve au même endroit les informations nécessaires pour piloter et optimiser ton activité.</p></div><div className="how-grid"><article className="step-card"><span className="step-num mono">01 / CONNECTER</span><h3>Ta boutique</h3><p>Centralise tes produits, tes ventes et tes données commerciales.</p></article><article className="step-card"><span className="step-num mono">02 / CONNECTER</span><h3>Tes publicités</h3><p>Regroupe tes campagnes, tes dépenses et tes performances publicitaires.</p></article><article className="step-card"><span className="step-num mono">03 / ANALYSER</span><h3>Tes résultats</h3><p>Compare ventes, dépenses, clics, conversions, ROAS et CPA.</p></article><article className="step-card"><span className="step-num mono">04 / OPTIMISER</span><h3>Ta prochaine action</h3><p>Identifie ce qui fonctionne et applique des recommandations concrètes.</p></article></div></div></section>
      <section className="section features-section" id="fonctionnalites"><div className="container"><div className="section-head"><div><span className="eyebrow">Pensé pour progresser</span><h2>Comprends ce qui fonctionne<br/>et quoi améliorer.</h2></div><p>Vendeo relie tes ventes, tes produits et tes publicités pour t’aider à comprendre tes résultats et à optimiser tes décisions.</p></div><div className="feature-grid"><article className="feature-card dark"><h3>Suis la performance réelle de ton activité.</h3><p>Compare ton chiffre d’affaires, tes dépenses publicitaires, tes ventes et tes indicateurs de rentabilité au même endroit.</p><ul className="mini-list"><li>Ventes et dépenses publicitaires réunies</li><li>ROAS, CPA et taux de conversion</li><li>Recommandations concrètes basées sur tes données</li></ul></article><article className="feature-card light"><h3>Passe de l’analyse à l’action.</h3><p>Repère les campagnes qui fonctionnent, les dépenses qui produisent moins de résultats et les points qui peuvent limiter tes ventes.</p><div className="feature-line"/></article></div></div></section>
    <section className="section" id="tarifs"><div className="container"><div className="section-head"><div><span className="eyebrow">Des prix qui ont du sens</span><h2>Commence petit.<br/>Grandis serein.</h2></div><p>Tout ce qu'il faut pour comprendre ton activité, sans abonnement hors-sol.</p></div><div className="pricing-wrap"><article className="price-card"><span className="eyebrow">Pour commencer</span><h3>Starter</h3><div className="price">3 000 F <small>/ mois</small></div><ul><li><Check className="check" size={15}/>400 messages IA / mois</li><li><Check className="check" size={15}/>1 boutique Chariow</li><li><Check className="check" size={15}/>Questions sur ventes et produits</li><li><Check className="check" size={15}/>Support standard</li></ul><Link href="/register" className="btn btn-dark" style={{width:'100%'}}>Choisir Starter <ArrowRight size={15}/></Link></article><article className="price-card pro"><span className="pill" style={{marginBottom:18}}>Le plus choisi</span><h3>Pro</h3><div className="price">5 000 F <small>/ mois</small></div><ul><li><Check className="check" size={15}/>1 200 messages IA / mois</li><li><Check className="check" size={15}/>Jusqu'à 3 boutiques</li><li><Check className="check" size={15}/>Stratégie, pricing et promotions</li><li><Check className="check" size={15}/>Rapports automatiques</li><li><Check className="check" size={15}/>Support prioritaire</li></ul><Link href="/register" className="btn btn-lime" style={{width:'100%'}}>Choisir Pro <ArrowRight size={15}/></Link></article></div></div></section>
    <section className="section" id="faq"><div className="container"><div className="section-head"><div><span className="eyebrow">Questions fréquentes</span><h2>Tout est<br/>plus clair.</h2></div><p>Une question que tu ne vois pas ici ? Écris-nous, on te répond.</p></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item" key={q}><button className="faq-question" onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i}>{q}<span>{open===i?'−':'+'}</span></button>{open===i&&<div className="faq-answer">{a}</div>}</div>)}</div></div></section>
     <section className="section" style={{paddingTop:0}}><div className="container"><div className="cta"><span className="eyebrow">Ton prochain bon choix</span><h2>Une seule plateforme pour<br/>mieux piloter ton activité.</h2><p>Connecte ta boutique et tes comptes publicitaires pour centraliser tes données et identifier tes prochaines actions.</p><Link href="/register" className="btn btn-dark">Créer mon espace <ArrowRight size={16}/></Link></div></div></section>
      <footer className="site-footer"><div className="container footer-row"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40}/></Link><div className="footer-links"><Link href="/privacy">Confidentialité</Link><Link href="/terms">Conditions</Link><a href="mailto:hello@vendeo.studio">Contact</a></div><span style={{color:'#91a3c8',fontSize:11}}>© 2026 Vendeo</span></div></footer>
  </main>;
}
