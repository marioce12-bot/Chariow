import type { DocSection } from "./types";

export const adPerformanceSections: DocSection[] = [
  {
    id: "ad-performance",
    group: "sell",
    title: { fr: "Recommandation", en: "Recommendations" },
    summary: {
      fr: "Consulte une recommandation fondée sur les résultats disponibles, puis vérifie le brouillon avant de le lancer.",
      en: "Review a recommendation based on available results, then check the draft before launch.",
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
