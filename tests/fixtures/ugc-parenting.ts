import { normalizeUgcInput } from "@/lib/studio/ugc-prompt-input";

/** User-supplied synthetic reproduction only; never fetched from an account. */
export const parentingDescription = `Et si ce qui pouvait vous rapprocher de votre enfant se cachait dans un petit moment de votre journée ?

Vous l’aimez… mais le quotidien vous éloigne
Vous l’aimez, mais entre la fatigue, les obligations et les désaccords, vos échanges tournent parfois aux rappels et aux reproches. Votre enfant se ferme, s’agite ou vous répond, et vous ne savez plus toujours comment revenir vers lui sans céder sur tout.

Retrouver l’écoute et des moments partagés
Vous aimeriez qu’il se sente écouté, qu’il ose vous parler et que vos moments ensemble ne soient pas seulement une succession de consignes. Retrouver un sourire, un jeu, une conversation simple… tout en gardant des limites claires.

Des gestes concrets pour nourrir votre lien
« Comment créer une complicité avec son enfant » vous propose une démarche concrète pour nourrir ce lien, un geste à la fois. Ce guide PDF de 65 pages en français vous aide à mieux écouter, reconnaître ses signaux et ses émotions, jouer sans matériel coûteux, poser des limites sans humiliation ni violence et renouer le dialogue après un conflit.

Vous y trouverez des phrases à essayer, des activités à adapter à l’âge de votre enfant, des idées de rituels et un parcours pratique de 30 jours. De quoi passer de « je devrais passer plus de temps avec lui » à « voici un petit moment que nous pouvons partager aujourd’hui ».

Avancez à votre rythme
Pas besoin d’être un parent parfait ni de tout changer d’un coup.
Choisissez une idée, adaptez-la à votre famille et avancez à votre rythme. Ce guide ne promet pas une transformation immédiate et ne remplace pas un accompagnement professionnel lorsque celui-ci est nécessaire.

Offrez-vous des repères simples pour construire davantage de confiance et de moments partagés. Vous recevez votre ebook PDF à télécharger après l’achat, à lire sur téléphone, tablette ou ordinateur.

Téléchargez dès maintenant
« Comment créer une complicité avec son enfant » et choisissez aujourd’hui un premier geste à essayer pour vous rapprocher.`;

export const parentingProduct = {
  name: "Comment créer une complicité avec son enfant",
  description: parentingDescription,
  type: "ebook",
  image: "https://cdn.example.test/synthetic-cover.png",
};
export const parentingInput = normalizeUgcInput(parentingProduct, { duration: 30, language: "fr" }, "fr");

/** Authored model stand-in: source-grounded prose, no provider call or rendered video. */
export const parentingNarrative = [
  "Scène: un salon calme, un parent adulte fictif et une amie adulte fictive échangent près du canapé. Aucun enfant à l'image; les gestes sont une illustration, pas un témoignage réel.",
  "0–5s | ACTION: Le parent pose ses affaires, s'assoit et laisse une place libre près de lui, le visage fatigué par sa journée; CAMÉRA: plan vertical rapproché à hauteur du regard; DIALOGUE EXACT: «J'aimerais retrouver des moments partagés, pas seulement donner des consignes.»",
  "5–10s | ACTION: L'amie lui présente un téléphone avec la couverture réelle du guide sélectionné, sans inventer de pages intérieures; CAMÉRA: mouvement doux vers l'écran puis retour aux visages; DIALOGUE EXACT: «Ce guide propose des repères concrets pour nourrir le lien.»",
  "10–15s | ACTION: Le parent pose son téléphone et tourne son corps vers l'amie pour l'écouter sans l'interrompre; CAMÉRA: plan serré sur son attention puis champ contrechamp naturel; DIALOGUE EXACT: «Dans ces 65 pages, des pistes pour mieux écouter.»",
  "15–20s | ACTION: Les adultes illustrent calmement un échange: le parent reformule un ressenti et l'amie acquiesce sans jouer le rôle d'un enfant; CAMÉRA: plan stable sur leurs gestes ouverts; DIALOGUE EXACT: «Reconnaître les émotions, poser des limites sans humiliation ni violence.»",
  "20–25s | ACTION: Le parent réserve un moment tranquille sur son canapé et invite l'amie à partager une conversation simple, sans représenter de résultat obtenu; CAMÉRA: plan moyen chaleureux, lumière naturelle; DIALOGUE EXACT: «Des idées de rituels et un parcours pratique de 30 jours.»",
  `25–30s | ACTION: Le parent présente la couverture réelle sur un téléphone tenu face caméra, centrée, titre et illustration intacts; CAMÉRA: gros plan net sur l'écran; DIALOGUE EXACT: «Appuie sur le bouton pour télécharger ${parentingProduct.name}.»`,
].join("\n");
