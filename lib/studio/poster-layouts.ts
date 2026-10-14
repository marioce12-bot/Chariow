// Mises en page d'affiches publicitaires, inspirées d'affiches pro de produits digitaux.
// Chaque mise en page a sa propre structure, son propre style et sa propre présence (ou non) de personne :
// on en IMPOSE une (tirée au sort) à l'IA pour que deux affiches ne se ressemblent jamais.

type Orientation = "square" | "landscape" | "portrait";

type Layout = { id: string; brief: string };

const LAYOUTS: Layout[] = [
  { id: "manchette géante + bénéfices", brief: "Fond clair lumineux. En haut, un petit mot-étiquette (ex. « EBOOK ») avec un filet, puis un TITRE MONUMENTAL sur 2 lignes (un mot-clé dans une couleur d'accent vive) et une question qui interpelle en dessous. Au centre, le produit en grand, légèrement incliné, posé sur une table en bois près d'une plante. À droite du produit, 3 pastilles-icônes rondes alignées, chacune avec un bénéfice de 3 à 5 mots. En bas, une grande vague de couleur sombre avec un appel à l'action à gauche et une phrase manuscrite soulignée avec une flèche à droite. Aucune personne." },
  { id: "géométrique + bulles flottantes", brief: "Fond crème avec de grandes formes géométriques (un grand cercle de couleur vive coupé par le bord, des coins bleu nuit). TITRE EN MAJUSCULES sur 3 lignes en haut, en deux couleurs contrastées. Le produit flotte en grand au centre, entouré de 4 à 5 bulles d'icônes ou d'interface en 3D douce (engrenage, code, courbe de croissance, carte de paiement). À gauche, 3 pastilles numérotées qui racontent 3 étapes. Une personne détourée en bas à droite, bras croisés ou main ouverte vers le produit. Un large bouton arrondi plein en bas avec une icône et l'appel à l'action." },
  { id: "portrait héros + étiquette", brief: "Une personne en gros plan occupe toute la moitié droite, regard caméra, lumière de studio, décor flou d'étagères et de plantes. En haut à gauche, le titre dans un bloc de couleur franche façon logo, avec une sous-ligne en dessous. Le produit debout au premier plan en bas à gauche. À droite du produit, 3 bénéfices avec icônes rondes séparées par de fines lignes. Un autocollant jaune en coup de pinceau, incliné, avec une phrase d'accroche. En bas, un bandeau sombre avec 3 mini-icônes d'arguments puis un bouton d'appel à l'action jaune avec une flèche." },
  { id: "titre surligneur + bonus", brief: "Un bandeau arrondi sombre en haut avec une petite icône de fusée et une phrase d'urgence, puis un titre COLOSSAL sur 2 lignes dont un mot posé sur un grand coup de surligneur/pinceau vert citron. Colonne de 3 bénéfices à gauche avec des icônes rondes colorées. À droite, une personne souriante, le menton dans la main ; devant elle, le produit et une tablette qui montre son contenu. Un badge BONUS orange en forme de pastille. En bas, une grande vague bleu nuit avec une phrase manuscrite et une flèche." },
  { id: "collage ville + carte d'Afrique", brief: "Décor de ville africaine lumineuse et floue (skyline, bord de lagune, monument) avec une carte de l'Afrique en réseau de points lumineux. Titre ÉNORME en bleu vif dégradé dont un mot géant, une bannière jaune en coup de pinceau pour la phrase d'urgence. Un jeune en sweat à capuche au centre, téléphone en main, regard vers le haut. Devant lui, un ordinateur portable et un téléphone montrent le contenu, et le produit est debout à côté. Un gros autocollant jaune incliné avec la promesse principale (sans prix). Bas de l'image : bande bleu nuit avec 2 mini-arguments." },
  { id: "typographie pure", brief: "Affiche typographique : le titre occupe 60 % de l'image, en lettres géantes ultra épaisses, un mot en contour et un mot en couleur vive ; le produit en 3D propre passe DEVANT une partie des lettres. Fond uni très saturé, illustration vectorielle plate, aucune photo, quelques éclats et étoiles. 2 bénéfices en étiquettes inclinées façon autocollant, appel à l'action dans un bouton en bas." },
  { id: "avant / après", brief: "Image coupée en deux par une diagonale : à gauche une ambiance grise et terne qui représente le problème (étiquette « Sans »), à droite une ambiance colorée et lumineuse qui représente le résultat (étiquette « Avec »). Le produit est posé sur la ligne de coupe, au centre. Un titre large sur un bandeau de couleur franche traverse le haut. Une personne de chaque côté, ou la même, dans deux états différents. Aucune promesse chiffrée. Bouton d'appel à l'action en bas." },
  { id: "couverture de magazine", brief: "Fausse couverture de magazine : un grand bandeau-titre en haut (le thème du produit en lettres élégantes très grandes), portrait plein cadre d'une personne qui regarde l'objectif, 3 accroches de « une » en colonne sur un côté (sans chiffres ni statistiques), le produit tenu en main ou posé en bas, un petit médaillon rond « Nouveau » et un appel à l'action en bandeau en bas." },
  { id: "néon sombre", brief: "Fond noir bleuté, éclairage néon cyan et magenta, particules lumineuses. Le produit en 3D flotte au centre avec un halo, des éléments d'interface holographiques autour. Titre en grandes lettres blanches avec un contour néon, un sous-titre plus petit, 3 bénéfices en lignes avec icônes lumineuses. Pas de visage : au plus une silhouette de dos devant un écran. Bouton d'appel à l'action lumineux en bas." },
  { id: "scène de vie + autocollants", brief: "Photo lifestyle plein cadre d'une personne dans un vrai décor du quotidien (marché coloré, rue animée, atelier, salon, terrasse), prise sur le vif. Le titre est posé sur une zone dégagée de l'image, dans un grand bloc de couleur ou en lettres blanches avec ombre portée. 3 bénéfices en étiquettes façon autocollants collées sur l'image. Le produit tenu en main, bien visible. Appel à l'action dans une pastille ronde en bas à droite." },
  { id: "pile de produits + éclats", brief: "Fond uni coloré avec un dégradé radial. Le produit répété en 3 à 5 exemplaires, en pile ou en éventail, très grand au centre, avec des ombres douces. Le titre ÉNORME placé DERRIÈRE les produits (les lettres sont en partie masquées mais restent lisibles), des éclats, étoiles et confettis. Un sticker rond « Nouveau » et un bandeau d'appel à l'action en bas. Aucune personne." },
];

const PALETTES: Array<{ label: string; key: RegExp }> = [
  { label: "bleu nuit et jaune soleil", key: /bleu nuit|marine/i },
  { label: "noir profond et vert citron", key: /citron|noir profond/i },
  { label: "rouge brique et crème", key: /brique/i },
  { label: "violet profond et orange vif", key: /violet/i },
  { label: "vert émeraude et or", key: /émeraude|emeraude/i },
  { label: "rose fuchsia et blanc", key: /fuchsia/i },
  { label: "turquoise et corail", key: /turquoise/i },
  { label: "bleu ciel et orange vif", key: /bleu ciel/i },
  { label: "bordeaux et rose poudré", key: /bordeaux/i },
  { label: "ocre et vert forêt", key: /ocre|forêt|foret/i },
  { label: "blanc cassé et noir avec un seul accent rouge", key: /accent rouge/i },
  { label: "indigo et menthe", key: /indigo|menthe/i },
];

function pick<T>(list: T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

const ORIENTATION_HINT: Record<Orientation, string> = {
  portrait: "format vertical : empile titre, produit et appel à l'action sur la hauteur, le titre dans le tiers haut",
  landscape: "format horizontal : répartis en colonnes (texte d'un côté, visuel de l'autre), le titre sur la moitié gauche ou en bandeau large",
  square: "format carré : un titre large en haut ou sur le côté, le visuel principal au centre, l'appel à l'action en bas",
};

export function buildLayoutDirection(
  input: { orientation: Orientation; previousPrompt?: string; userBrief?: string },
  random: () => number = Math.random,
) {
  const previous = input.previousPrompt ?? "";
  const freshPalettes = PALETTES.filter((palette) => !previous || !palette.key.test(previous));
  const palette = pick(freshPalettes.length ? freshPalettes : PALETTES, random);
  const layout = pick(LAYOUTS, random);
  const hasBrief = Boolean(input.userBrief?.trim());

  const text = [
    `MISE EN PAGE IMPOSÉE « ${layout.id} » : ${layout.brief}`,
    `PALETTE IMPOSÉE : ${palette.label} (elle remplace les palettes suggérées plus haut).`,
    `Adaptation au format : ${ORIENTATION_HINT[input.orientation]}.`,
    "Adapte cette mise en page au produit (décor, accessoires, icônes, tenue, bénéfices) sans en changer la structure. Les « pistes déduites » plus haut servent seulement pour le décor, le public et la mise en place du produit ; en cas de contradiction avec la mise en page imposée (présence de personne, style), la mise en page l'emporte.",
    hasBrief ? "Si les consignes de l'utilisateur décrivent déjà une mise en page ou un style, elles priment sur cette mise en page imposée." : "",
  ].filter(Boolean).join("\n");

  return { layoutId: layout.id, paletteLabel: palette.label, text };
}
