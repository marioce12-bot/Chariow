import type { Locale } from "./locales";

// Dictionnaire FR/EN. Structure imbriquée, lue par clé en notation pointée via
// useI18n().t("landing.hero.title"). La traduction couvre pour l'instant la
// landing page, la navigation et les paramètres ; le reste de l'application est
// migré progressivement.
interface Dict { [key: string]: string | Dict; }

export const translations: Record<Locale, Dict> = {
  fr: {
    landing: {
      nav: { how: "Comment ça marche", features: "Fonctionnalités", pricing: "Tarifs", faq: "FAQ", login: "Se connecter", start: "Commencer" },
      hero: {
        title1: "Vends, analyse et",
        title2: "lance tes publicités.",
        title3: "Sans changer d'outil.",
        tagline: "Ta boutique, tes campagnes, ton studio créatif.",
        paragraph: "Vendeo réunit ta boutique, tes comptes publicitaires et un studio de création IA au même endroit — pour comprendre ce qui marche, créer tes visuels et lancer tes campagnes sans jongler entre cinq outils.",
        cta: "Commencer gratuitement",
        stat: "créateurs actifs",
        soon: "bientôt",
      },
      problem: {
        title1: "Aujourd'hui, tout est éclaté",
        title2: "entre plusieurs outils.",
        paragraph: "Ta boutique dans un onglet, Meta Business Suite dans un autre, un logiciel de montage pour chaque visuel — et aucun endroit pour voir si tout ça rapporte vraiment.",
        p1Title: "Tu ne sais pas ce qui rapporte.",
        p1: "Tes ventes sont sur ta boutique, tes dépenses sur Meta Ads. Impossible de savoir en un coup d'œil si une campagne te fait gagner ou perdre de l'argent.",
        p2Title: "Créer un visuel prend des heures.",
        p2: "Chaque nouveau produit demande une affiche ou une vidéo publicitaire — et tout le monde n'a pas un logiciel de montage ou un designer sous la main.",
        p3Title: "Tu payes avant de savoir.",
        p3: "Une campagne peut être refusée après paiement. Tu te retrouves à repayer, ou à laisser tomber.",
      },
      how: {
        eyebrow: "Une seule plateforme",
        title1: "De la boutique à la",
        title2: "campagne publiée.",
        paragraph: "Quatre étapes, dans Vendeo, sans repasser par cinq outils différents.",
        s1num: "01 / CONNECTER", s1title: "Ta boutique et tes pubs", s1: "Relie ta boutique Chariow et ton compte Meta Ads. Tes ventes et tes dépenses arrivent automatiquement.",
        s2num: "02 / COMPRENDRE", s2title: "Ton ROAS réel", s2: "Vendeo calcule ta rentabilité réelle et repère les campagnes qui perdent de l'argent avant qu'elles ne coûtent plus cher.",
        s3num: "03 / CRÉER", s3title: "Ton visuel ou ta vidéo", s3: "Décris ce que tu veux : le Studio IA génère l'affiche ou la vidéo publicitaire à partir de ta fiche produit.",
        s4num: "04 / LANCER", s4title: "Ta campagne", s4: "Tu payes, la campagne part directement chez Meta ou TikTok. Refusée ? Tu la relances sans repayer.",
      },
      features: {
        eyebrow: "Trois choses à la fois",
        title1: "Un copilote, pas juste",
        title2: "un tableau de chiffres.",
        paragraph: "Vendeo analyse, crée et lance — les trois étapes qui, ailleurs, demandent trois outils séparés.",
        f1title: "Sais où va ton argent.", f1: "Chiffre d'affaires, dépenses publicitaires, ROAS et CPA au même endroit. Vendeo te dit quelles campagnes couper avant qu'elles ne te coûtent plus cher.",
        f2title: "Crée sans designer.", f2: "Choisis un produit, décris ce que tu veux — le Studio IA génère ton affiche ou ta vidéo publicitaire directement à partir de ta fiche produit.",
        f3title: "Lance en confiance.", f3: "Tu payes une fois ta campagne prête. Elle part chez Meta ou TikTok ; si elle est refusée, tu la relances sans repayer.",
      },
      proof: { eyebrow: "Ils utilisent déjà Vendeo", title1: "Des créateurs qui voient", title2: "leurs vrais résultats.", paragraph: "Captures réelles des tableaux de bord Chariow de créateurs connectés à Vendeo : leurs ventes, leurs publicités, leurs chiffres." },
      pricing: {
        eyebrow: "Un prix simple", title1: "Un seul plan.", title2: "Tout inclus.", paragraph: "15 jours d'essai gratuit, puis un abonnement unique pour continuer à utiliser Vendeo.",
        pill: "Essai gratuit — 15 jours", price: "2 000 XOF", perMonth: "/ mois",
        b1: "Analyse IA illimitée de tes ventes et de tes pubs", b2: "Jusqu'à 3 boutiques Chariow connectées", b3: "Facebook, Instagram, TikTok, WhatsApp et plus", b4: "Studio IA (visuels et vidéos publicitaires)", b5: "75 crédits Studio offerts à l'inscription",
        cta: "Démarrer mon essai gratuit",
      },
      faq: {
        eyebrow: "Questions fréquentes", title1: "Tout est", title2: "plus clair.", paragraph: "Une question que tu ne vois pas ici ? Écris-nous, on te répond.",
        q1: "Est-ce que je dois installer quelque chose ?", a1: "Non. Tout se passe dans ton navigateur, sur ordinateur ou mobile. Connecte ta boutique et commence à poser tes questions.",
        q2: "Quelles plateformes sont compatibles ?", a2: "Chariow est disponible au lancement. Selar, Gumroad et d'autres plateformes arriveront progressivement.",
        q3: "Le Studio IA, ça fonctionne comment ?", a3: "Tu choisis un produit, tu décris ce que tu veux (une affiche, une vidéo) et l'IA s'occupe de la réalisation à partir de ta fiche produit.",
        q4: "Si ma campagne est refusée par Meta, je perds mon argent ?", a4: "Non. Le paiement couvre ton budget publicitaire ; si Meta ou TikTok refuse la campagne, tu peux la relancer sans payer une seconde fois.",
        q5: "Est-ce que mes données sont en sécurité ?", a5: "Tes tokens sont chiffrés et tes données servent uniquement à produire les analyses demandées dans ton espace.",
        q6: "Puis-je annuler mon abonnement ?", a6: "Oui, tu peux annuler depuis ton espace, sans frais cachés.",
      },
      cta: { eyebrow: "Ton prochain bon choix", title1: "Une seule plateforme pour", title2: "vendre, créer et lancer.", paragraph: "Connecte ta boutique et tes comptes publicitaires pour centraliser tes données, créer tes visuels et lancer tes campagnes en confiance.", button: "Créer mon espace" },
      footer: { about: "À propos", privacy: "Confidentialité", terms: "Conditions", contact: "Contact" },
    },
    settings: {
      title: "Paramètres",
      subtitle: "Gère tes boutiques et ton abonnement depuis cet espace.",
      language: { title: "Langue", subtitle: "Choisis la langue de ton espace Vendeo.", french: "Français", english: "Anglais" },
    },
    nav: {
      overview: "Accueil", pubs: "Pub", studio: "Studio", assistant: "Assistant", radar: "Radar", reports: "Rapports", stores: "Mes boutiques", subscription: "Abonnement", settings: "Paramètres", adAccounts: "Comptes publicitaires",
    },
  },
  en: {
    landing: {
      nav: { how: "How it works", features: "Features", pricing: "Pricing", faq: "FAQ", login: "Log in", start: "Get started" },
      hero: {
        title1: "Sell, analyze and",
        title2: "launch your ads.",
        title3: "Without switching tools.",
        tagline: "Your store, your campaigns, your creative studio.",
        paragraph: "Vendeo brings your store, your ad accounts and an AI creative studio together in one place — so you can understand what works, create your visuals and launch campaigns without juggling five tools.",
        cta: "Start for free",
        stat: "active creators",
        soon: "soon",
      },
      problem: {
        title1: "Today, everything is scattered",
        title2: "across several tools.",
        paragraph: "Your store in one tab, Meta Business Suite in another, an editing app for every visual — and nowhere to see whether any of it actually pays off.",
        p1Title: "You don't know what pays.",
        p1: "Your sales live in your store, your spend in Meta Ads. You can't tell at a glance whether a campaign is making or losing you money.",
        p2Title: "Creating a visual takes hours.",
        p2: "Every new product needs an ad poster or video — and not everyone has editing software or a designer on hand.",
        p3Title: "You pay before you know.",
        p3: "A campaign can be rejected after payment. You end up paying again, or giving up.",
      },
      how: {
        eyebrow: "One single platform",
        title1: "From your store to",
        title2: "a published campaign.",
        paragraph: "Four steps, inside Vendeo, without bouncing between five different tools.",
        s1num: "01 / CONNECT", s1title: "Your store and ads", s1: "Link your Chariow store and your Meta Ads account. Your sales and spend arrive automatically.",
        s2num: "02 / UNDERSTAND", s2title: "Your real ROAS", s2: "Vendeo computes your real profitability and spots campaigns losing money before they cost you more.",
        s3num: "03 / CREATE", s3title: "Your visual or video", s3: "Describe what you want: the AI Studio generates the ad poster or video from your product page.",
        s4num: "04 / LAUNCH", s4title: "Your campaign", s4: "You pay, the campaign goes straight to Meta or TikTok. Rejected? Relaunch it without paying again.",
      },
      features: {
        eyebrow: "Three things at once",
        title1: "A copilot, not just",
        title2: "a dashboard of numbers.",
        paragraph: "Vendeo analyzes, creates and launches — the three steps that elsewhere require three separate tools.",
        f1title: "Know where your money goes.", f1: "Revenue, ad spend, ROAS and CPA in one place. Vendeo tells you which campaigns to cut before they cost you more.",
        f2title: "Create without a designer.", f2: "Pick a product, describe what you want — the AI Studio generates your ad poster or video directly from your product page.",
        f3title: "Launch with confidence.", f3: "You pay once your campaign is ready. It goes to Meta or TikTok; if rejected, relaunch it without paying again.",
      },
      proof: { eyebrow: "They already use Vendeo", title1: "Creators who see", title2: "their real results.", paragraph: "Real Chariow dashboard captures from creators connected to Vendeo: their sales, their ads, their numbers." },
      pricing: {
        eyebrow: "Simple pricing", title1: "One plan.", title2: "Everything included.", paragraph: "15-day free trial, then a single subscription to keep using Vendeo.",
        pill: "Free trial — 15 days", price: "2 000 XOF", perMonth: "/ month",
        b1: "Unlimited AI analysis of your sales and ads", b2: "Up to 3 connected Chariow stores", b3: "Facebook, Instagram, TikTok, WhatsApp and more", b4: "AI Studio (ad visuals and videos)", b5: "75 Studio credits offered at signup",
        cta: "Start my free trial",
      },
      faq: {
        eyebrow: "Frequently asked questions", title1: "Everything is", title2: "clearer.", paragraph: "A question you don't see here? Write to us, we'll answer.",
        q1: "Do I need to install anything?", a1: "No. Everything happens in your browser, on desktop or mobile. Connect your store and start asking questions.",
        q2: "Which platforms are compatible?", a2: "Chariow is available at launch. Selar, Gumroad and other platforms will arrive gradually.",
        q3: "How does the AI Studio work?", a3: "You pick a product, describe what you want (a poster, a video) and the AI handles the production from your product page.",
        q4: "If Meta rejects my campaign, do I lose my money?", a4: "No. The payment covers your ad budget; if Meta or TikTok rejects the campaign, you can relaunch it without paying again.",
        q5: "Is my data safe?", a5: "Your tokens are encrypted and your data is only used to produce the analyses requested in your space.",
        q6: "Can I cancel my subscription?", a6: "Yes, you can cancel from your space, with no hidden fees.",
      },
      cta: { eyebrow: "Your next good choice", title1: "One platform to", title2: "sell, create and launch.", paragraph: "Connect your store and your ad accounts to centralize your data, create your visuals and launch campaigns with confidence.", button: "Create my space" },
      footer: { about: "About", privacy: "Privacy", terms: "Terms", contact: "Contact" },
    },
    settings: {
      title: "Settings",
      subtitle: "Manage your stores and subscription from here.",
      language: { title: "Language", subtitle: "Choose the language of your Vendeo space.", french: "French", english: "English" },
    },
    nav: {
      overview: "Home", pubs: "Ads", studio: "Studio", assistant: "Assistant", radar: "Radar", reports: "Reports", stores: "My stores", subscription: "Subscription", settings: "Settings", adAccounts: "Ad accounts",
    },
  },
};
