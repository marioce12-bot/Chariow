export const ugcAnalysis = (name: string) => ({
  product_type: "digital" as const, niche: "guide pratique", target_audience: "Adultes francophones", core_problem: null,
  main_benefit: null, emotion_dominante: "curiosité", usage_context: "consultation sur téléphone", visual_assets: ["couverture fournie"],
  price_positioning: "accessible" as const, objections_probables: ["contenu adapté ?"], risks: ["aucun résultat garanti"], assumptions: [],
  confirmed_facts: [`name: ${name}`],
});

export const ugcCreative = (name: string, language = "French") => {
  const lines = language.toLowerCase().startsWith("english")
    ? [`I open ${name} on my phone.`, "I browse the chapter titles.", "I pause at an exercise.", "I keep the guide within reach.", `Find ${name} in the shop.`]
    : [`J’ouvre ${name} sur mon téléphone.`, "Je parcours les titres des chapitres.", "Je m’arrête sur un exercice.", "Je garde le guide à portée de main.", `Retrouve ${name} dans la boutique.`];
  return {
    assumptions: [], angle: "consultation au quotidien", hook: { text: lines[0], visual: `Le titre ${name} apparaît sur la couverture fournie` },
    scene: { location: "coin lecture lumineux", lighting: "lumière naturelle", mood: "spontané", props: ["téléphone affichant la couverture fournie"] },
    characters: [{ id: "c1", age: "30", gender: "femme", look: "femme noire adulte", outfit: "chemise simple", personality: "curieuse", role: "présentatrice" }],
    shots: [
      { start: 0, end: 3, type: "hook", visual: `La couverture affiche ${name}`, action: `montre ${name} sur l’écran`, dialogue: lines[0], camera: "selfie vertical" },
      { start: 3, end: 8, type: "problem", visual: `Le titre ${name} reste lisible`, action: "fait défiler les titres visibles", dialogue: lines[1], camera: "plan rapproché" },
      { start: 8, end: 15, type: "solution", visual: `Elle consulte ${name} sur son téléphone`, action: "ouvre une page réelle fournie", dialogue: lines[2], camera: "gros plan stable" },
      { start: 15, end: 21, type: "proof", visual: `Elle reprend ${name} en main`, action: "reprend sa lecture", dialogue: lines[3], camera: "plan poitrine" },
      { start: 21, end: 25, type: "cta", visual: `La couverture ${name} est visible`, action: "pointe vers la boutique", dialogue: lines[4], camera: "selfie vertical" },
    ],
    cta: lines[4], negative_prompt: "aucun texte inventé, aucun faux avis ni promesse",
  };
};

export const ugcFixtureResponse = (messages: Array<{ content: string }>) => {
  const content = messages.map(message => message.content).join(" ");
  let name = "Guide pratique";
  try {
    const payload = JSON.parse(messages[1]?.content ?? "{}") as { product?: { name?: string; product?: { name?: string } } };
    name = payload.product?.product?.name ?? payload.product?.name ?? name;
  } catch {
    name = content.match(/\"productName\":\"([^\"]+)\"/)?.[1] ?? name;
  }
  return JSON.stringify(content.includes("Tu analyses un produit") ? ugcAnalysis(name) : ugcCreative(name, /English|anglais/i.test(content) ? "English" : "French"));
};
