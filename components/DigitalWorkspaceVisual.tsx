"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SiMeta, SiPinterest, SiTiktok } from "react-icons/si";

type StoryScene = {
  image: string;
  alt: string;
  screenshot: string;
  screenshotAlt: string;
  title: string;
  description: string;
};

const SCENE_DURATION_MS = 4000;

/** Parcours illustratif : captures réelles de l’interface, avec données de démonstration. */
export function DigitalWorkspaceVisual({ isEnglish = false }: { isEnglish?: boolean }) {
  const en = isEnglish;
  const [activeIndex, setActiveIndex] = useState(0);
  const scenes: StoryScene[] = en ? [
    {
      image: "/landing/flow-story-01.webp",
      alt: "The same creator in a lilac blazer presenting her digital product beside her laptop",
      screenshot: "/landing/actual-home-en.webp",
      screenshotAlt: "Vendeo home screen with demonstration data",
      title: "Connect your Chariow store",
      description: "Find available products and orders from your Chariow store in Vendeo.",
    },
    {
      image: "/landing/flow-story-03.webp",
      alt: "The same creator preparing an advertising campaign at her laptop",
      screenshot: "/landing/actual-ads-en.webp",
      screenshotAlt: "Vendeo campaign setup screen with demonstration data",
      title: "Prepare a campaign",
      description: "Choose an ad network and account, set up the campaign, then review it before requesting submission.",
    },
    {
      image: "/landing/flow-story-04.webp",
      alt: "The same creator checking orders and campaign data on her smartphone",
      screenshot: "/landing/actual-home-en.webp",
      screenshotAlt: "Vendeo overview screen with demonstration data",
      title: "Review available data",
      description: "Check synced orders and received ad data. Sales attribution depends on tracking and platform data.",
    },
  ] : [
    {
      image: "/landing/flow-story-01.webp",
      alt: "La même créatrice en blazer lilas présente son produit digital près de son ordinateur",
      screenshot: "/landing/actual-home-fr.webp",
      screenshotAlt: "Écran d’accueil Vendeo avec des données de démonstration",
      title: "Connecte ta boutique Chariow",
      description: "Retrouve dans Vendeo les produits et commandes disponibles de ta boutique Chariow.",
    },
    {
      image: "/landing/flow-story-03.webp",
      alt: "La même créatrice prépare une campagne publicitaire sur son ordinateur",
      screenshot: "/landing/actual-ads-fr.webp",
      screenshotAlt: "Écran Vendeo de configuration d’une campagne avec des données de démonstration",
      title: "Prépare une campagne",
      description: "Choisis un réseau et un compte publicitaire, configure la campagne puis vérifie-la avant de demander son envoi.",
    },
    {
      image: "/landing/flow-story-04.webp",
      alt: "La même créatrice consulte ses commandes et les données de ses campagnes sur son téléphone",
      screenshot: "/landing/actual-home-fr.webp",
      screenshotAlt: "Vue d’ensemble Vendeo avec des données de démonstration",
      title: "Consulte les données disponibles",
      description: "Retrouve les commandes synchronisées et les données publicitaires reçues. L’attribution dépend du suivi et des données de la plateforme.",
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
      {en ? "The Vendeo workflow" : "Le parcours Vendeo"}
    </figcaption>

    <div className="workspace-brand-rows">
      <div className="workspace-brand-group" role="group" aria-label={en ? "Connected store" : "Boutique connectée"}>
        <span className="workspace-brand-label">{en ? "YOUR STORE" : "TA BOUTIQUE"}</span>
        <span className="integration-logo chariow-logo"><Image src="/logos/chariow.svg" alt="Chariow" width={92} height={24}/></span>
        <span className="integration-vendeo" aria-label="Vendeo"><span aria-hidden="true">→</span><Image src="/vendeo-logo.webp" alt="Vendeo" width={84} height={24}/></span>
      </div>
      <div className="workspace-ad-platforms" role="group" aria-label={en ? "Advertising campaigns on Meta, Pinterest and TikTok" : "Campagnes publicitaires sur Meta, Pinterest et TikTok"}>
        <span className="workspace-brand-label">{en ? "CAMPAIGNS ON" : "CAMPAGNES SUR"}</span>
        <span className="ad-platform-logo ad-platform-meta"><SiMeta aria-hidden="true"/> Meta</span>
        <span className="ad-platform-logo ad-platform-pinterest"><SiPinterest aria-hidden="true"/> Pinterest</span>
        <span className="ad-platform-logo ad-platform-tiktok"><SiTiktok aria-hidden="true"/> TikTok</span>
      </div>
    </div>

    <div className="story-carousel" role="region" aria-roledescription={en ? "carousel" : "carrousel"} aria-label={en ? "Three-step workflow, advancing every four seconds" : "Parcours en trois étapes, défilement automatique toutes les 4 secondes"}>
      <article className="story-card" aria-live="off">
        <div className="story-photo">
          <Image key={currentScene.image} src={currentScene.image} alt={currentScene.alt} fill priority={activeIndex === 0} sizes="(max-width: 900px) 96vw, (max-width: 1250px) 58vw, 700px"/>
          <span className="story-photo-shade" aria-hidden="true"/>
          <div className="story-screenshot" role="img" aria-label={currentScene.screenshotAlt}>
            <Image key={currentScene.screenshot} src={currentScene.screenshot} alt="" fill sizes="(max-width: 620px) 70vw, (max-width: 900px) 62vw, 520px"/>
          </div>
          <div className="story-overlay">
            <div className="story-meta"><span>{en ? "THE VENDEO WORKFLOW" : "LE PARCOURS VENDEO"}</span><span>{en ? `STEP ${activeIndex + 1} OF 3` : `ÉTAPE ${activeIndex + 1} SUR 3`}</span></div>
            <h3>{currentScene.title}</h3>
            <p>{currentScene.description}</p>
          </div>
        </div>
      </article>
      <div className="story-progress" aria-hidden="true"><span key={activeIndex}/></div>
    </div>
    <p className="workspace-example-note" id="workspace-example-note">{en ? "Real Vendeo screens with demonstration data · illustrative photos, not customer results." : "Captures réelles de Vendeo avec des données de démonstration · photos illustratives, pas des résultats clients."}</p>
  </figure>;
}
