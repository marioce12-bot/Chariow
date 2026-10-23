"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SiMeta, SiPinterest, SiShopify, SiTiktok } from "react-icons/si";

type StoryScene = {
  image: string;
  alt: string;
  screenshot: string;
  screenshotAlt: string;
  title: string;
  description: string;
};

const SCENE_DURATION_MS = 4000;

/** Parcours illustratif : chaque scène montre une capture réelle de Vendeo. */
export function DigitalWorkspaceVisual({ isEnglish = false }: { isEnglish?: boolean }) {
  const en = isEnglish;
  const [activeIndex, setActiveIndex] = useState(0);
  const scenes: StoryScene[] = en ? [
    {
      image: "/landing/flow-story-01.webp",
      alt: "The same creator in a lilac blazer presenting her digital product beside her laptop",
      screenshot: "/landing/actual-home-en.webp",
      screenshotAlt: "Vendeo home screen showing the connected store and activity overview",
      title: "Connect your digital product",
      description: "Bring your ebooks, courses and other digital products together from Chariow or Shopify.",
    },
    {
      image: "/landing/flow-story-02.webp",
      alt: "The same creator filming an ad with her smartphone in a home studio",
      screenshot: "/landing/actual-studio-en.webp",
      screenshotAlt: "Real Vendeo Studio screen for creating images and videos",
      title: "Create your ad",
      description: "Make image and video creatives for your product with Vendeo Studio.",
    },
    {
      image: "/landing/flow-story-03.webp",
      alt: "The same creator preparing an advertising campaign at her laptop",
      screenshot: "/landing/actual-ads-en.webp",
      screenshotAlt: "Real Vendeo screen for preparing and launching an advertising campaign",
      title: "Launch a campaign",
      description: "Prepare and launch campaigns on Meta, Pinterest or TikTok.",
    },
    {
      image: "/landing/flow-story-04.webp",
      alt: "The same creator checking orders and campaign results on her smartphone",
      screenshot: "/landing/dashboard-demo.webp",
      screenshotAlt: "Vendeo dashboard showing sales, revenue and campaign activity",
      title: "Track orders and results",
      description: "Follow new orders and review your campaign data in one place.",
    },
    {
      image: "/landing/flow-story-05.webp",
      alt: "The same creator asking an AI assistant about her product market at her laptop",
      screenshot: "/vendeo-platform-preview.png",
      screenshotAlt: "Vendeo product screen showing Vendeo AI and its business recommendations",
      title: "Ask the AI assistant",
      description: "Get help preparing a campaign, exploring your product’s market and more.",
    },
  ] : [
    {
      image: "/landing/flow-story-01.webp",
      alt: "La même créatrice en blazer lilas présente son produit digital près de son ordinateur",
      screenshot: "/landing/actual-home-fr.webp",
      screenshotAlt: "Écran d’accueil Vendeo montrant la boutique connectée et l’aperçu de l’activité",
      title: "Connecte ton produit digital",
      description: "Retrouve tes ebooks, formations et autres produits numériques vendus sur Chariow ou Shopify.",
    },
    {
      image: "/landing/flow-story-02.webp",
      alt: "La même créatrice filme une publicité avec son téléphone dans son studio",
      screenshot: "/landing/actual-studio-fr.webp",
      screenshotAlt: "Capture réelle du Studio Vendeo pour créer des images et des vidéos",
      title: "Crée ta publicité",
      description: "Réalise des visuels et vidéos publicitaires pour ton produit avec le Studio Vendeo.",
    },
    {
      image: "/landing/flow-story-03.webp",
      alt: "La même créatrice prépare une campagne publicitaire sur son ordinateur",
      screenshot: "/landing/actual-ads-fr.webp",
      screenshotAlt: "Capture réelle de l’écran Vendeo pour préparer et lancer une publicité",
      title: "Lance une campagne",
      description: "Prépare et lance tes campagnes sur Meta, Pinterest ou TikTok.",
    },
    {
      image: "/landing/flow-story-04.webp",
      alt: "La même créatrice consulte ses commandes et les résultats de ses campagnes sur son téléphone",
      screenshot: "/landing/dashboard-demo.webp",
      screenshotAlt: "Tableau de bord Vendeo montrant ventes, revenus et campagnes",
      title: "Suis commandes et résultats",
      description: "Retrouve tes nouvelles commandes et analyse les données de tes campagnes au même endroit.",
    },
    {
      image: "/landing/flow-story-05.webp",
      alt: "La même créatrice interroge l’assistant IA sur son produit depuis son ordinateur",
      screenshot: "/vendeo-platform-preview.png",
      screenshotAlt: "Capture de Vendeo montrant l’accès à Vendeo AI et ses recommandations",
      title: "Échange avec l’assistant IA",
      description: "Fais-toi aider pour préparer une campagne, analyser le secteur de ton produit et aller plus loin.",
    },
  ];
  const sceneCount = scenes.length;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % sceneCount);
    }, SCENE_DURATION_MS);
    return () => window.clearInterval(intervalId);
  }, [sceneCount]);

  const currentScene = scenes[activeIndex];

  return <figure className="digital-workspace" id="apercu" aria-labelledby="workspace-visual-title" aria-describedby="workspace-example-note">
    <figcaption className="workspace-visual-heading" id="workspace-visual-title">
      {en ? "All-in-one workflow" : "Parcours tout-en-un"}
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

    <div className="story-carousel" role="region" aria-roledescription={en ? "carousel" : "carrousel"} aria-label={en ? "Five-step workflow, advancing every four seconds" : "Parcours en cinq étapes, défilement automatique toutes les 4 secondes"}>
      <article className="story-card" aria-live="off">
        <div className="story-photo">
          <Image key={currentScene.image} src={currentScene.image} alt={currentScene.alt} fill priority={activeIndex === 0} sizes="(max-width: 900px) 96vw, (max-width: 1250px) 58vw, 700px"/>
          <span className="story-photo-shade" aria-hidden="true"/>
          <div className="story-screenshot" role="img" aria-label={currentScene.screenshotAlt}>
            <Image key={currentScene.screenshot} src={currentScene.screenshot} alt="" fill sizes="(max-width: 620px) 70vw, (max-width: 900px) 62vw, 520px"/>
          </div>
          <div className="story-overlay">
            <div className="story-meta"><span>{en ? "THE VENDEO WORKFLOW" : "LE PARCOURS VENDEO"}</span><span>{en ? `STEP ${activeIndex + 1} OF 5` : `ÉTAPE ${activeIndex + 1} SUR 5`}</span></div>
            <h3>{currentScene.title}</h3>
            <p>{currentScene.description}</p>
          </div>
        </div>
      </article>
      <div className="story-progress" aria-hidden="true"><span key={activeIndex}/></div>
    </div>
    <p className="workspace-example-note" id="workspace-example-note">{en ? "A real Vendeo screen accompanies every step · illustrative photos, with no customer results or performance claims." : "Une vraie capture d’écran Vendeo accompagne chaque étape · photos illustratives, sans résultats clients ni promesse de performance."}</p>
  </figure>;
}
