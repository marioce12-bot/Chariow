"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { SiMeta, SiPinterest, SiShopify, SiTiktok } from "react-icons/si";

type StoryScene = {
  image: string;
  alt: string;
  title: string;
  description: string;
  assistant?: boolean;
};

/** Parcours illustratif : les scènes et exemples ne représentent pas des résultats clients. */
export function DigitalWorkspaceVisual({ isEnglish = false }: { isEnglish?: boolean }) {
  const en = isEnglish;
  const [activeIndex, setActiveIndex] = useState(0);
  const scenes: StoryScene[] = en ? [
    {
      image: "/landing/flow-story-01.webp",
      alt: "A smiling digital course creator presenting her product at a laptop",
      title: "Connect your digital product",
      description: "Bring your ebooks, courses and other digital products together from Chariow or Shopify.",
    },
    {
      image: "/landing/flow-story-02.webp",
      alt: "A smiling creator filming an ad with a smartphone and ring light",
      title: "Create your ad",
      description: "Make image and video creatives for your product with Vendeo Studio.",
    },
    {
      image: "/landing/flow-story-03.webp",
      alt: "A smiling entrepreneur reviewing an advertising campaign on her laptop",
      title: "Launch a campaign",
      description: "Prepare and launch campaigns on Meta, Pinterest or TikTok.",
    },
    {
      image: "/landing/flow-story-04.webp",
      alt: "A smiling business owner checking orders and campaign charts on his phone",
      title: "Track orders and results",
      description: "Follow new orders and review your campaign data in one place.",
    },
    {
      image: "/landing/flow-story-05.webp",
      alt: "A smiling founder using an AI assistant on her laptop",
      title: "Ask the AI assistant",
      description: "Get help preparing a campaign, exploring your product’s market and more.",
      assistant: true,
    },
  ] : [
    {
      image: "/landing/flow-story-01.webp",
      alt: "Une créatrice de formations souriante présente son produit sur son ordinateur",
      title: "Connecte ton produit digital",
      description: "Retrouve tes ebooks, formations et autres produits numériques vendus sur Chariow ou Shopify.",
    },
    {
      image: "/landing/flow-story-02.webp",
      alt: "Un créateur souriant filme une publicité avec son téléphone et une lumière douce",
      title: "Crée ta publicité",
      description: "Réalise des visuels et vidéos publicitaires pour ton produit avec le Studio Vendeo.",
    },
    {
      image: "/landing/flow-story-03.webp",
      alt: "Une entrepreneure souriante prépare une campagne publicitaire sur son ordinateur",
      title: "Lance une campagne",
      description: "Prépare et lance tes campagnes sur Meta, Pinterest ou TikTok.",
    },
    {
      image: "/landing/flow-story-04.webp",
      alt: "Un entrepreneur souriant consulte ses commandes et ses graphiques sur son téléphone",
      title: "Suis commandes et résultats",
      description: "Retrouve tes nouvelles commandes et analyse les données de tes campagnes au même endroit.",
    },
    {
      image: "/landing/flow-story-05.webp",
      alt: "Une entrepreneure souriante utilise un assistant IA sur son ordinateur",
      title: "Échange avec l’assistant IA",
      description: "Fais-toi aider pour préparer une campagne, analyser le secteur de ton produit et aller plus loin.",
      assistant: true,
    },
  ];

  const currentScene = scenes[activeIndex];
  const moveTo = (index: number) => setActiveIndex((index + scenes.length) % scenes.length);

  return <figure className="digital-workspace" id="apercu" aria-labelledby="workspace-visual-title" aria-describedby="workspace-example-note">
    <figcaption className="workspace-visual-heading" id="workspace-visual-title">
      {en ? "From digital product to order analysis" : "Du produit digital à l’analyse des commandes"}
    </figcaption>

    <div className="workspace-brand-rows">
      <div className="workspace-brand-group" role="group" aria-label={en ? "Connected stores" : "Boutiques connectées"}>
        <span className="workspace-brand-label">{en ? "YOUR STORE" : "TA BOUTIQUE"}</span>
        <span className="integration-logo chariow-logo"><Image src="/logos/chariow.svg" alt="Chariow" width={92} height={24}/></span>
        <span className="integration-logo shopify-logo"><SiShopify aria-hidden="true"/> Shopify</span>
        <span className="integration-vendeo" aria-label="Vendeo"><span aria-hidden="true">→</span><Image src="/vendeo-logo.webp" alt="Vendeo" width={84} height={24}/></span>
      </div>
      <div className="workspace-ad-platforms" role="group" aria-label={en ? "Advertising campaigns on Meta, Pinterest and TikTok" : "Campagnes publicitaires sur Meta, Pinterest et TikTok"}>
        <span className="workspace-brand-label">{en ? "CAMPAIGNS ON" : "CAMPAGNES SUR"}</span>
        <span className="ad-platform-logo ad-platform-meta"><SiMeta aria-hidden="true"/> Meta</span>
        <span className="ad-platform-logo ad-platform-pinterest"><SiPinterest aria-hidden="true"/> Pinterest</span>
        <span className="ad-platform-logo ad-platform-tiktok"><SiTiktok aria-hidden="true"/> TikTok</span>
      </div>
    </div>

    <div className="story-carousel" role="region" aria-roledescription={en ? "carousel" : "carrousel"} aria-label={en ? "Five steps with Vendeo" : "Les cinq étapes avec Vendeo"}>
      <article className="story-card" aria-live="polite">
        <div className="story-photo">
          <Image key={currentScene.image} src={currentScene.image} alt={currentScene.alt} fill priority={activeIndex === 0} sizes="(max-width: 900px) 92vw, (max-width: 1250px) 48vw, 560px"/>
          <span className="story-photo-shade" aria-hidden="true"/>
          <span className="story-step-badge">{String(activeIndex + 1).padStart(2, "0")} <span>/ 05</span></span>
          {currentScene.assistant && <div className="story-ai-panel">
            <span className="story-ai-title"><Sparkles size={13} aria-hidden="true"/>{en ? "AI assistant" : "Assistant IA"}</span>
            <span>{en ? "Prepare a campaign" : "Préparer une campagne"}</span>
            <span>{en ? "Analyze a product market" : "Analyser un secteur"}</span>
          </div>}
        </div>
        <div className="story-content">
          <div className="story-meta"><span>{en ? "THE VENDEO WORKFLOW" : "LE PARCOURS VENDEO"}</span><span>{en ? `STEP ${activeIndex + 1} OF 5` : `ÉTAPE ${activeIndex + 1} SUR 5`}</span></div>
          <h3>{currentScene.title}</h3>
          <p>{currentScene.description}</p>
          <div className="story-controls">
            <button type="button" className="story-arrow" onClick={() => moveTo(activeIndex - 1)} aria-label={en ? "Previous scene" : "Scène précédente"}><ArrowLeft size={17} aria-hidden="true"/></button>
            <div className="story-dots" role="group" aria-label={en ? "Choose a scene" : "Choisir une scène"}>
              {scenes.map((scene, index) => <button
                key={scene.title}
                type="button"
                className={`story-dot${index === activeIndex ? " is-active" : ""}`}
                aria-label={`${en ? "Show scene" : "Afficher la scène"} ${index + 1}: ${scene.title}`}
                aria-current={index === activeIndex ? "step" : undefined}
                onClick={() => moveTo(index)}
              />)}
            </div>
            <button type="button" className="story-arrow" onClick={() => moveTo(activeIndex + 1)} aria-label={en ? "Next scene" : "Scène suivante"}><ArrowRight size={17} aria-hidden="true"/></button>
          </div>
        </div>
      </article>
      <div className="story-progress" aria-hidden="true"><span style={{ width: `${((activeIndex + 1) / scenes.length) * 100}%` }}/></div>
    </div>
    <p className="workspace-example-note" id="workspace-example-note">{en ? "Illustrative workflow · photos are illustrative and do not represent customer results or performance claims." : "Parcours illustratif · photos d’ambiance, sans résultats clients ni promesse de performance."}</p>
  </figure>;
}
