import type { DocSection } from "./types";

export const creativePerformanceSections: DocSection[] = [
  {
    id: "creative-performance",
    group: "sell",
    title: { fr: "Performance visuel", en: "Creative performance" },
    summary: {
      fr: "Comparez les résultats des images et vidéos de vos campagnes publicitaires.",
      en: "Compare the results of images and videos in your advertising campaigns.",
    },
    articles: [
      {
        id: "compare-creatives",
        title: { fr: "Comparer les visuels de campagne", en: "Compare campaign creatives" },
        paragraphs: [
          {
            fr: "Cette section rassemble les images et vidéos utilisées dans vos campagnes Pinterest, TikTok et Meta. Comparez leurs dépenses et leurs clics, ainsi que les commandes et le chiffre d’affaires lorsqu’ils peuvent être reliés.",
            en: "This section brings together images and videos used in your Pinterest, TikTok and Meta campaigns. Compare spend and clicks, as well as orders and revenue when they can be matched.",
          },
        ],
        steps: [
          {
            fr: "Choisissez la boutique à consulter, puis la période souhaitée.",
            en: "Choose the store you want to view, then select a date range.",
          },
          {
            fr: "Utilisez le filtre Plateforme pour afficher Pinterest, TikTok ou Meta. Vous pouvez aussi actualiser les résultats.",
            en: "Use the Platform filter to show Pinterest, TikTok or Meta. You can also refresh the results.",
          },
          {
            fr: "Lisez les dépenses et les clics, puis les commandes et le chiffre d’affaires lorsqu’ils sont disponibles. Si une création est éligible, ouvrez Studio avec « Proposer des créatifs ».",
            en: "Read spend and clicks, then orders and revenue when available. If a creative is eligible, open Studio with “Suggest creatives.”",
          },
        ],
        notice: {
          fr: "Les commandes ou le chiffre d’affaires peuvent manquer si la plateforme publicitaire n’est pas connectée ou si les ventes ne peuvent pas être reliées à la campagne. Pour un carrousel, les résultats de la campagne ne sont pas répartis entre ses images.",
          en: "Orders or revenue may be missing if the advertising platform is not connected or sales cannot be matched to the campaign. For a carousel, campaign results are not split between its images.",
        },
      },
    ],
  },
];
