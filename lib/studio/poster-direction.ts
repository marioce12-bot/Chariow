import { inferProductType, type ProductType } from "./creative-workflows";

// Direction artistique d'une affiche, DÉDUITE du produit (nom, description, type) et non tirée au hasard :
// - le thème (business, tech, beauté, sport, cuisine…) fixe la palette, le décor, le style et les tenues ;
// - le public visé fixe le genre et l'âge de la personne (si le public est mixte, on alterne avec la
//   génération précédente pour ne pas retomber sur la même personne) ;
// - le type de produit (ebook, formation, logiciel…) fixe la façon de le mettre en scène.
// Le hasard n'intervient que pour choisir PARMI des options déjà adaptées au produit (coiffure, attitude…).

type Audience = "femme" | "homme" | "mixte";
type Theme = {
  id: string;
  keywords: RegExp;
  audience: Audience;
  palettes: string[];
  style: string;
  setting: string;
  outfitMan: string[];
  outfitWoman: string[];
};

const THEMES: Theme[] = [
  { id: "beauté et mode", keywords: /(beauté|beaute|coiffure|tresse|maquillage|cheveux|perruque|peau|soin|parfum|couture|wax|mode|vêtement|robe|bijou)/i, audience: "femme",
    palettes: ["rose poudré et or", "violet profond et rose clair", "corail et crème", "bordeaux et or"], style: "photo de studio élégante, lumière douce et flatteuse, esprit magazine de mode",
    setting: "salon lumineux, miroir, tissus et accessoires", outfitMan: ["chemise wax élégante", "ensemble sobre bien coupé"], outfitWoman: ["robe wax moderne", "tenue élégante colorée", "ensemble en lin"] },
  { id: "sport et bien-être", keywords: /(santé|sante|fitness|sport|musculation|yoga|nutrition|régime|minceur|bien-être|bien-etre|méditation|perte de poids|marathon|football)/i, audience: "mixte",
    palettes: ["vert frais et blanc", "orange énergique et noir", "bleu électrique et blanc"], style: "photo dynamique en lumière naturelle, énergie et mouvement",
    setting: "extérieur, salle de sport ou cuisine saine", outfitMan: ["tenue de sport propre", "t-shirt technique et short"], outfitWoman: ["tenue de sport colorée", "brassière et legging propres"] },
  { id: "cuisine", keywords: /(recette|cuisine|pâtisserie|patisserie|gâteau|gateau|restaurant|traiteur|boulangerie|plat\b)/i, audience: "mixte",
    palettes: ["rouge vif et jaune chaud", "vert basilic et crème", "orange épicé et bois clair"], style: "photo culinaire gourmande, lumière chaude naturelle",
    setting: "cuisine lumineuse ou table dressée", outfitMan: ["tablier et chemise retroussée"], outfitWoman: ["tablier et foulard en wax"] },
  { id: "finance et investissement", keywords: /(épargne|epargne|finance|crypto|bourse|trading|immobilier|comptab|budget|investi|actionnaire|dividende|patrimoine)/i, audience: "mixte",
    palettes: ["vert foncé et or", "bleu marine et blanc", "noir élégant avec un accent doré"], style: "photo publicitaire sobre et premium, contraste net",
    setting: "bureau élégant ou salon moderne avec graphiques en arrière-plan flou", outfitMan: ["costume sans cravate", "chemise blanche remontée aux manches"], outfitWoman: ["blazer sur chemisier clair", "tailleur moderne"] },
  { id: "business et entrepreneuriat", keywords: /(saas|startup|entrepreneu|business|marketing|freelance|vente|vendre|client|prospect|linkedin|réseau|reseau|boutique|e-?commerce|revenu|argent|mlm)/i, audience: "mixte",
    palettes: ["bleu roi profond et jaune soleil", "noir élégant avec un accent jaune doré", "vert émeraude et blanc", "orange brûlé et bleu nuit"], style: "photo publicitaire de studio sur fond uni coloré, ombres douces",
    setting: "bureau moderne, coworking ou café avec ordinateur portable", outfitMan: ["chemise blanche remontée aux manches", "polo sobre et veste légère", "t-shirt uni et blazer"], outfitWoman: ["blazer coloré sur t-shirt blanc", "chemisier clair et pantalon taille haute"] },
  { id: "tech et création numérique", keywords: /(code|codage|programm|développ|developp|web\b|site\b|application|appli\b|\bia\b|intelligence artificielle|no-?code|notion|excel|template|design|figma|canva|logiciel)/i, audience: "mixte",
    palettes: ["violet électrique et bleu clair", "bleu ciel et blanc très lumineux", "noir profond et cyan vif"], style: "composition moderne et nette, éclairage doux, touches de lumière colorée",
    setting: "poste de travail avec écran montrant une interface propre", outfitMan: ["sweat à capuche décontracté", "t-shirt uni et chemise ouverte"], outfitWoman: ["t-shirt uni décontracté", "sweat coloré"] },
  { id: "éducation et développement personnel", keywords: /(formation|cours|apprendre|masterclass|coaching|atelier|certification|étudiant|etudiant|examen|concours|langue|anglais|confiance|motivation|productivité|productivite|carrière|carriere|emploi|cv\b)/i, audience: "mixte",
    palettes: ["vert émeraude et crème", "bleu ciel et jaune doux", "violet électrique et rose clair", "orange brûlé et bleu nuit"], style: "photo lumineuse et inspirante, lumière du jour",
    setting: "bibliothèque, salle de classe moderne ou salon studieux", outfitMan: ["chemise en pagne wax moderne", "polo sobre"], outfitWoman: ["robe wax moderne", "chemisier clair"] },
  { id: "spiritualité et famille", keywords: /(spirituel|prière|priere|foi\b|bible|parent|enfant|bébé|bebe|grossesse|maman|famille|mariage|couple)/i, audience: "mixte",
    palettes: ["bleu ciel et blanc très lumineux", "vert menthe et corail", "jaune doux et crème"], style: "photo chaleureuse et authentique, lumière douce du quotidien",
    setting: "salon chaleureux ou jardin", outfitMan: ["chemise claire sobre"], outfitWoman: ["robe simple et colorée"] },
];

const DEFAULT_THEME: Theme = {
  id: "général", keywords: /$^/, audience: "mixte",
  palettes: ["bleu roi profond et jaune soleil", "vert émeraude et crème", "violet électrique et rose clair", "orange brûlé et bleu nuit"],
  style: "photo publicitaire propre, lumière flatteuse", setting: "décor simple en rapport avec le thème du produit",
  outfitMan: ["t-shirt uni et veste légère", "chemise en pagne wax moderne"], outfitWoman: ["t-shirt uni décontracté", "robe wax moderne"],
};

const PLACEMENTS: Record<ProductType, string[]> = {
  ebook: ["tenu en main à hauteur de poitrine, couverture entièrement lisible", "posé debout sur une table ou un bureau, légèrement de trois quarts", "plusieurs exemplaires empilés ou en éventail au premier plan", "posé sur un canapé ou un comptoir, dans le décor du thème"],
  formation: ["affiché en grand sur l'écran d'un ordinateur portable posé sur un bureau, vignette du cours lisible", "affiché sur une tablette posée ou tenue, vignette du cours lisible"],
  saas: ["interface affichée en grand sur un écran d'ordinateur, propre et lisible", "interface affichée sur un téléphone au premier plan"],
  mode: ["porté par la personne, bien visible de la tête aux pieds ou en plan taille", "présenté en gros plan au premier plan"],
  food: ["plat ou produit en gros plan au premier plan, appétissant", "posé sur une table dressée dans le décor"],
  physique: ["posé en gros plan au premier plan, bien éclairé", "utilisé ou montré par la personne"],
  service: ["la personne en pleine action de service, résultat visible"],
  evenement: ["ambiance de l'événement, scène ou public, sans montrer de produit en main"],
  autre: ["posé sur une table ou un meuble du décor, bien visible au premier plan", "tenu en main par la personne", "présenté debout, légèrement de trois quarts"],
};

// Probabilité qu'une personne apparaisse, selon le type de produit.
const PERSON_CHANCE: Record<ProductType, number> = { ebook: 0.8, formation: 0.9, saas: 0.55, mode: 0.95, food: 0.4, physique: 0.5, service: 1, evenement: 0.8, autre: 0.8 };

const HAIR_MAN = ["crâne rasé et barbe courte taillée", "coupe courte dégradée (fade) sans barbe", "petites locks courtes", "afro court naturel avec une fine moustache", "cheveux ras et barbe de trois jours", "twists courts sur le dessus"];
const HAIR_WOMAN = ["tresses africaines longues (box braids)", "cheveux crépus naturels coupés très court", "foulard ou headwrap en wax coloré", "chignon haut avec quelques mèches", "locks mi-longues attachées", "cheveux lissés au carré", "afro volumineux naturel"];
const ATTITUDES = ["rire franc et spontané", "concentré et sérieux", "sourire confiant, bras croisés", "enthousiaste et surpris", "regard caméra calme et assuré", "pris sur le vif, en mouvement", "penché vers l'avant, complice"];

export const USER_DESCRIBES_PERSON = /(homme|femme|man\b|woman|men\b|women|garçon|fille|mère|père|couple|groupe|enfant|étudiant|étudiante|personnage|sans personne|no person)/i;

function hash(text: string) {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}
function pick<T>(list: T[], random: () => number): T { return list[Math.floor(random() * list.length)]; }
function pickMany<T>(list: T[], count: number, random: () => number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}

export function detectTheme(text: string): Theme {
  return THEMES.find((theme) => theme.keywords.test(text)) ?? DEFAULT_THEME;
}

export function detectAudience(text: string, theme: Theme, name: string, previousPrompt: string): "homme" | "femme" {
  if (/(femmes?\b|mamans?|mères|dames?|entrepreneuses?|filles)/i.test(text)) return "femme";
  if (/(hommes?\b|papas?|pères|messieurs|garçons)/i.test(text)) return "homme";
  if (theme.audience !== "mixte") return theme.audience;
  // Public mixte : on alterne avec la génération précédente ; sinon le genre est stable pour un produit donné.
  if (/(une femme|a woman|femme de)/i.test(previousPrompt)) return "homme";
  if (/(un homme|a man|homme de)/i.test(previousPrompt)) return "femme";
  return hash(name) % 2 === 0 ? "femme" : "homme";
}

export function detectAge(text: string) {
  if (/(étudiant|etudiant|lycée|lycee|jeune|débutant|debutant|concours|examen)/i.test(text)) return "environ 22 ans";
  if (/(senior|retraite|retraité|grand-parent)/i.test(text)) return "environ 55 ans";
  if (/(entrepreneu|business|manager|freelance|professionnel|carrière|carriere|investi)/i.test(text)) return "environ 35 ans";
  return "environ 30 ans";
}

export function buildPosterDirection(input: { name: string; description?: string; userBrief?: string; previousPrompt?: string }, random: () => number = Math.random) {
  const userBrief = input.userBrief ?? "";
  const text = `${input.name} ${input.description ?? ""}`;
  const theme = detectTheme(text);
  const type = inferProductType(input.name, input.description);
  const userDescribesPerson = USER_DESCRIBES_PERSON.test(userBrief);
  const withoutPerson = !userDescribesPerson && random() >= PERSON_CHANCE[type];

  // Ce ne sont que des PISTES de départ : l'IA analyse elle-même le produit et reste libre de les suivre, de les
  // mélanger ou de proposer mieux. On donne 2 options (palette, mise en place) plutôt qu'un choix unique.
  const placements = PLACEMENTS[type].filter((option) => !withoutPerson || !/(personne|en main)/.test(option));
  const placementOptions = pickMany(placements.length ? placements : ["posé bien en vue au premier plan, dans le décor"], 2, random);
  const paletteOptions = pickMany(theme.palettes, 2, random);

  const parts = [
    `thème probable : ${theme.id}`,
    `décor possible : ${theme.setting}`,
    `ambiance possible : ${theme.style}`,
    `palettes possibles : ${paletteOptions.join(" ou ")}`,
    `mise en place possible du produit (${type}) : ${placementOptions.join(" ou ")}`,
  ];
  if (withoutPerson) parts.push("l'affiche peut très bien se passer de personne : le produit peut être le héros de l'image");
  else if (!userDescribesPerson) {
    const gender = detectAudience(text, theme, input.name, input.previousPrompt ?? "");
    const man = gender === "homme";
    parts.push(`public probable : ${man ? "un homme" : "une femme"} ${detectAge(text)} (pour varier d'une génération à l'autre, ne reprends pas la dernière personne) ; pense à la coiffure, à la tenue et à l'attitude qui collent le mieux au produit, avec un visage distinctif`);
  }
  return { withoutPerson, themeId: theme.id, text: `Pistes déduites du produit et de son public (simples suggestions : analyse toi-même le produit, tu restes libre de les suivre, de les mélanger ou de faire mieux) : ${parts.join(" ; ")}.` };
}
