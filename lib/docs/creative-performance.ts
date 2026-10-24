import type { DocSection } from "./types";

export const creativePerformanceSections: DocSection[] = [
  {
    id: "creative-performance",
    group: "sell",
    title: { fr: "Performance visuel", en: "Creative performance" },
    summary: {
      fr: "Compare les résultats mesurés de tes images et vidéos publicitaires.",
      en: "Compare the measured results of your advertising images and videos.",
    },
    articles: [
      {
        id: "compare-creatives",
        title: { fr: "Comparer les visuels", en: "Compare visuals" },
        paragraphs: [
          {
            fr: "Chaque image ou vidéo apparaît une seule fois, même si elle a été réutilisée. Les résultats disponibles sont regroupés par visuel pour faciliter la comparaison.",
            en: "Each image or video appears once, even if it was reused. Available results are grouped by visual to make comparison easier.",
          },
        ],
        steps: [
          {
            fr: "Choisis une boutique connectée et la période à consulter.",
            en: "Choose a connected store and the period you want to review.",
          },
          {
            fr: "Filtre les visuels par plateforme ou affiche uniquement ceux qui ont les meilleurs résultats mesurés.",
            en: "Filter visuals by platform or show only those with the best measured results.",
          },
          {
            fr: "Compare les dépenses et les clics; les commandes et le chiffre d’affaires apparaissent quand l’attribution est disponible.",
            en: "Compare spend and clicks; orders and revenue appear when attribution is available.",
          },
        ],
        notice: {
          fr: "Certains chiffres peuvent manquer si une plateforme n’est pas connectée ou si une vente ne peut pas être reliée à un visuel. Les valeurs inconnues restent vides.",
          en: "Some figures may be missing if a platform is not connected or a sale cannot be matched to a visual. Unknown values remain blank.",
        },
      },
    ],
  },
];

export const adPerformanceSections: DocSection[] = [
  {
    id: "ad-performance",
    group: "sell",
    title: { fr: "Performance publicitaire", en: "Ad performance" },
    summary: {
      fr: "Prépare une campagne à partir des résultats disponibles, puis vérifie le brouillon avant de la lancer.",
      en: "Prepare a campaign from available results, then review the draft before launch.",
    },
    articles: [
      {
        id: "prepare-campaign",
        title: { fr: "Préparer une campagne", en: "Prepare a campaign" },
        paragraphs: [
          {
            fr: "Choisis un produit. Une proposition n’apparaît que lorsque les résultats et la configuration disponibles permettent de l’étayer. Si les données sont insuffisantes, aucune recommandation n’est affichée.",
            en: "Choose a product. A proposal appears only when available results and setup support it. If the data is insufficient, no recommendation is shown.",
          },
        ],
        steps: [
          {
            fr: "Appuie sur « Appliquer » : le coût en crédits de l’image est indiqué sur le bouton avant la génération.",
            en: "Select “Apply”: the image credit cost is shown on the button before generation.",
          },
          {
            fr: "L’image générée ouvre la configuration d’un brouillon. Vérifie la plateforme, le ciblage, le texte, le lien et le budget; tu peux les modifier.",
            en: "The generated image opens a campaign draft. Review the platform, audience, copy, link and budget; you can edit them.",
          },
          {
            fr: "Pour publier, relis le récapitulatif puis appuie explicitement sur « Lancer maintenant ». La campagne n’est pas publiée automatiquement.",
            en: "To publish, review the summary and explicitly select “Launch now.” The campaign is not published automatically.",
          },
        ],
        notice: {
          fr: "Les crédits Studio pour générer une image sont distincts du budget publicitaire facturé par la plateforme. Une recommandation ne garantit pas les résultats futurs.",
          en: "Studio credits for image generation are separate from the ad budget charged by the platform. A recommendation does not guarantee future results.",
        },
      },
    ],
  },
];
