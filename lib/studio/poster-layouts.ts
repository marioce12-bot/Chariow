// Mises en page d'affiches publicitaires, inspirées d'affiches pro de produits digitaux.
// Chaque mise en page a sa propre structure, son propre style et sa propre présence (ou non) de personne :
// on en IMPOSE une (tirée au sort) à l'IA pour que deux affiches ne se ressemblent jamais.
// La PALETTE n'est pas imposée : l'IA la choisit elle-même d'après le nom et la description du produit.
// Les briefs ci-dessous parlent donc de « couleur principale / secondaire / d'accent », jamais d'une teinte précise.
// PERSONNE PAR DÉFAUT : sans choix contraire, on ne tire que des mises en page avec une personne ; c'est l'IA qui décide
// qui elle est, sa tenue, sa posture et si elle tient le produit. Les mises en page sans personne ne servent que pour « sans personnage ».
// AUCUNE MENTION INVENTÉE : les briefs ne contiennent aucun mot-promesse (BONUS, Nouveau, Offre limitée…) ; seules des icônes
// ou des phrases d'accroche tirées du produit sont autorisées. Les tons foncés ne doivent pas dominer l'image.

type Orientation = "square" | "landscape" | "portrait";

// auto = personne par défaut ; with = personne imposée ; without = aucune personne (choix explicite ou demandé dans les consignes).
export type CharacterChoice = "with" | "without" | "auto";

// yes : la personne fait partie de la structure ; no : la structure n'en a pas ; optional : la personne est un détail qu'on peut retirer.
type Person = "yes" | "no" | "optional";

type Layout = { id: string; person: Person; brief: string };

const LAYOUTS: Layout[] = [
  { id: "manchette géante + bénéfices", person: "yes", brief: "Fond clair lumineux. En haut à gauche, un petit mot-étiquette (ex. « EBOOK ») avec un filet, puis un TITRE MONUMENTAL sur 2 lignes (un mot-clé dans la couleur d'accent) et une sous-ligne qui interpelle. À droite, une personne en plan taille, regard caméra, qui présente le produit. Le produit en grand au centre-bas, légèrement incliné, posé sur une table en bois près d'une plante (ou tenu par la personne). Sous le titre, 3 pastilles-icônes rondes alignées, chacune avec un bénéfice de 3 à 5 mots. En bas, une grande vague de la couleur principale avec un appel à l'action à gauche et une phrase manuscrite soulignée avec une flèche à droite." },
  { id: "géométrique + bulles flottantes", person: "optional", brief: "Fond clair avec de grandes formes géométriques (un grand cercle de la couleur d'accent coupé par le bord, des coins de la couleur secondaire). TITRE EN MAJUSCULES sur 3 lignes en haut, en deux couleurs contrastées. Le produit flotte en grand au centre, entouré de 4 à 5 bulles d'icônes ou d'interface en 3D douce, choisies pour le thème du produit. À gauche, 3 pastilles numérotées qui racontent 3 étapes. Une personne détourée en bas à droite, bras croisés ou main ouverte vers le produit. Un large bouton arrondi plein en bas avec une icône et l'appel à l'action." },
  { id: "portrait héros + étiquette", person: "yes", brief: "Une personne en gros plan occupe toute la moitié droite, regard caméra, lumière de studio, décor flou et lumineux d'étagères et de plantes. En haut à gauche, le titre dans un bloc de couleur franche façon logo, avec une sous-ligne en dessous. Le produit debout au premier plan en bas à gauche. À droite du produit, 3 bénéfices avec icônes rondes séparées par de fines lignes. Un autocollant en coup de pinceau de la couleur d'accent, incliné, avec une phrase d'accroche. En bas, un bandeau clair ou de la couleur principale avec 3 mini-icônes d'arguments puis un bouton d'appel à l'action de la couleur d'accent avec une flèche." },
  { id: "titre surligneur + pastille", person: "yes", brief: "Un bandeau arrondi de la couleur principale en haut avec une petite icône de fusée et une phrase d'accroche tirée du produit (jamais de fausse urgence), puis un titre COLOSSAL sur 2 lignes dont un mot posé sur un grand coup de surligneur/pinceau de la couleur d'accent la plus vive. Colonne de 3 bénéfices à gauche avec des icônes rondes colorées. À droite, une personne souriante, le menton dans la main ; devant elle, le produit et une tablette dont l'écran montre seulement des icônes et des formes simples, sans texte. Une pastille ronde de la couleur d'accent avec une icône seule (étoile ou coche), sans aucun mot. En bas, une grande vague de la couleur secondaire avec une phrase manuscrite et une flèche." },
  { id: "collage ville + carte d'Afrique", person: "yes", brief: "Décor de ville africaine lumineuse et floue (skyline, bord de lagune, monument) avec une carte de l'Afrique en réseau de points lumineux. Titre ÉNORME dans la couleur principale dont un mot géant, une bannière en coup de pinceau de la couleur d'accent pour une phrase d'accroche tirée du produit. Un jeune en sweat à capuche au centre, téléphone en main, regard vers le haut. Devant lui, un ordinateur portable et un téléphone dont l'écran montre seulement des formes simples, sans texte, et le produit est debout à côté. Un gros autocollant incliné de la couleur d'accent avec la promesse principale du produit (sans prix). Bas de l'image : bande de la couleur principale avec 2 mini-arguments." },
  { id: "typographie pure", person: "no", brief: "Affiche typographique : le titre occupe 60 % de l'image, en lettres géantes ultra épaisses, un mot en contour et un mot dans la couleur d'accent ; le produit en 3D propre passe DEVANT une partie des lettres. Fond uni très saturé mais clair ou vif, illustration vectorielle plate, aucune photo, quelques éclats et étoiles. 2 bénéfices en étiquettes inclinées façon autocollant, appel à l'action dans un bouton en bas." },
  { id: "avant / après", person: "optional", brief: "Image coupée en deux par une diagonale : à gauche une ambiance grise et terne qui représente le problème (étiquette « Sans »), à droite une ambiance colorée et lumineuse qui représente le résultat (étiquette « Avec »). Le produit est posé sur la ligne de coupe, au centre. Un titre large sur un bandeau de couleur franche traverse le haut. Une personne de chaque côté, ou la même, dans deux états différents. Aucune promesse chiffrée. Bouton d'appel à l'action en bas." },
  { id: "couverture de magazine", person: "yes", brief: "Fausse couverture de magazine : un grand bandeau-titre en haut (le thème du produit en lettres élégantes très grandes), portrait plein cadre d'une personne qui regarde l'objectif, 3 accroches de « une » en colonne sur un côté (tirées du produit, sans chiffres ni statistiques), le produit tenu en main ou posé en bas, un petit médaillon rond avec une icône seule (sans mot) et un appel à l'action en bandeau en bas." },
  { id: "néon lumineux", person: "no", brief: "Fond en dégradé profond de la couleur principale (jamais noir), éclairage néon dans les couleurs de la palette, particules lumineuses. Le produit en 3D flotte au centre avec un halo, des éléments d'interface holographiques autour. Titre en grandes lettres claires avec un contour néon, un sous-titre plus petit, 3 bénéfices en lignes avec icônes lumineuses. Pas de visage : au plus une silhouette de dos devant un écran. Bouton d'appel à l'action lumineux en bas." },
  { id: "scène de vie + autocollants", person: "yes", brief: "Photo lifestyle plein cadre d'une personne dans un vrai décor du quotidien (marché coloré, rue animée, atelier, salon, terrasse), prise sur le vif. Le titre est posé sur une zone dégagée de l'image, dans un grand bloc de couleur ou en lettres blanches avec ombre portée. 3 bénéfices en étiquettes façon autocollants collées sur l'image. Le produit tenu en main, bien visible. Appel à l'action dans une pastille ronde en bas à droite." },
  { id: "pile de produits + éclats", person: "no", brief: "Fond uni coloré clair ou vif avec un dégradé radial. Le produit répété en 3 à 5 exemplaires, en pile ou en éventail, très grand au centre, avec des ombres douces. Le titre ÉNORME placé DERRIÈRE les produits (les lettres sont en partie masquées mais restent lisibles), des éclats, étoiles et confettis. Un sticker rond avec une icône seule (sans mot) et un bandeau d'appel à l'action en bas. Aucune personne." },
];

function pick<T>(list: T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

const ORIENTATION_HINT: Record<Orientation, string> = {
  portrait: "format vertical : empile titre, produit et appel à l'action sur la hauteur, le titre dans le tiers haut",
  landscape: "format horizontal : répartis en colonnes (texte d'un côté, visuel de l'autre), le titre sur la moitié gauche ou en bandeau large",
  square: "format carré : un titre large en haut ou sur le côté, le visuel principal au centre, l'appel à l'action en bas",
};

// Mises en page compatibles : avec personne par défaut (auto) ou sur demande (with), sans personne seulement sur choix explicite (without).
function eligibleLayouts(character: CharacterChoice): Layout[] {
  const list = character === "without"
    ? LAYOUTS.filter((layout) => layout.person !== "yes")
    : LAYOUTS.filter((layout) => layout.person !== "no");
  return list.length ? list : LAYOUTS;
}

const CHARACTER_TEXT: Record<CharacterChoice, string> = {
  auto: "PERSONNAGE (par défaut) : l'affiche comporte une personne bien visible, expressive et de bonne taille (visage net, mains naturelles). C'est TOI qui décides qui elle est (genre, âge, style, coiffure), sa tenue, sa posture et son expression d'après le produit et son public, ainsi que son rôle : elle tient le produit, le désigne du doigt, le présente de la main ouverte ou le regarde, ou bien le produit est posé près d'elle. Le produit reste le héros : grand, net et jamais masqué par la personne.",
  with: "PERSONNAGE (choix de l'utilisateur) : l'affiche est AVEC personnage. Une personne bien visible, expressive, de bonne taille, doit figurer sur l'affiche (visage net, mains naturelles, tenue adaptée au produit). Tu décides de son profil, de sa posture et de son rôle (elle tient le produit ou non) d'après le produit.",
  without: "PERSONNAGE (choix de l'utilisateur) : l'affiche est SANS personnage. Aucune personne, aucun visage, aucune main humaine, aucune silhouette. Le produit est le héros ; si la mise en page prévoit une personne, remplace-la par des éléments graphiques (icônes, objets du thème, décor).",
};

// Règles communes à toutes les mises en page.
const COLOR_RULE = "COULEURS : l'image reste claire et lumineuse. Les tons foncés (noir, bleu nuit, bordeaux foncé…) ne dominent jamais : au plus un quart de l'image, en petites touches (lettres du titre, fine bande, ombres). Le fond principal est clair ou de ton moyen vif, et la couleur d'accent est bien visible. Dans la mise en page, « couleur principale » et « secondaire » désignent des tons francs de la palette, jamais du noir.";
const NO_INVENTED_TEXT_RULE = "AUCUNE MENTION INVENTÉE : aucun badge, autocollant, bandeau, bouton, écran ou tablette ne contient un mot, une promesse ou un contenu absent du nom et de la description du produit. Interdits sauf s'ils figurent dans la description : « BONUS », « Nouveau », « Offre limitée », « Gratuit », « Promo », « Garantie », une fausse urgence, ainsi que des listes ou des chiffres inventés sur un écran. Sans information, utilise des icônes seules, des formes simples ou une phrase d'accroche neutre tirée du produit.";

export function buildLayoutDirection(
  input: { orientation: Orientation; previousPrompt?: string; userBrief?: string; character?: CharacterChoice },
  random: () => number = Math.random,
) {
  const character = input.character ?? "auto";
  const layout = pick(eligibleLayouts(character), random);
  const hasBrief = Boolean(input.userBrief?.trim());

  const text = [
    `MISE EN PAGE IMPOSÉE « ${layout.id} » : ${layout.brief}`,
    "PALETTE : LIBRE. Elle n'est pas imposée : choisis toi-même 2 ou 3 couleurs (une dominante, une secondaire, une couleur d'accent pour le bouton et le mot-clé) en fonction du sujet, du public et de l'émotion du produit d'après son nom et sa description, et nomme-les dans le prompt. Les mots « couleur principale », « secondaire » et « d'accent » de la mise en page renvoient à ces couleurs.",
    COLOR_RULE,
    NO_INVENTED_TEXT_RULE,
    CHARACTER_TEXT[character],
    `Adaptation au format : ${ORIENTATION_HINT[input.orientation]}.`,
    "Adapte cette mise en page au produit (décor, accessoires, icônes, tenue, bénéfices) sans en changer la structure. Les « pistes déduites » plus haut servent seulement pour le décor, le public et la mise en place du produit ; en cas de contradiction avec la mise en page imposée (présence de personne, style), la mise en page l'emporte.",
    hasBrief ? "Si les consignes de l'utilisateur décrivent déjà une mise en page ou un style, elles priment sur cette mise en page imposée." : "",
  ].filter(Boolean).join("\n");

  return { layoutId: layout.id, text };
}
