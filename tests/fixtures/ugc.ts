export const ugcAnalysis = (name: string) => ({
  product_type: "digital" as const,
  niche: "guide pratique",
  target_audience: "Adultes francophones",
  core_problem: null,
  main_benefit: null,
  emotion_dominante: "curiosité",
  usage_context: "consultation sur téléphone",
  visual_assets: ["couverture fournie"],
  price_positioning: "accessible" as const,
  objections_probables: ["contenu adapté ?"],
  risks: ["aucun résultat garanti"],
  assumptions: [],
  confirmed_fact_ids: [0],
});

export const ugcCreative = (name: string, language = "French") => {
  const lines = language.toLowerCase().startsWith("english")
    ? [`I open ${name} on my phone.`, "I browse the chapter titles.", "I pause at an exercise.", "I keep the guide within reach.", `Find ${name} in the shop.`]
    : [`J’ouvre ${name} sur mon téléphone.`, "Je parcours les titres des chapitres.", "Je m’arrête sur un exercice.", "Je garde le guide à portée de main.", `Retrouve ${name} dans la boutique.`];
  const draft = {
    angle: "consultation au quotidien",
    hook: { text: lines[0], visual: `Le titre ${name} apparaît sur la couverture fournie` },
    scene: { location: "coin lecture lumineux", lighting: "lumière naturelle", mood: "spontané", props: ["téléphone affichant la couverture fournie"] },
    characters: [{ id: "c1", age: "30", gender: "femme", look: "femme noire adulte", outfit: "chemise simple", personality: "curieuse", role: "présentatrice fictive" }],
    shortLines: lines.slice(1, 4),
  };
  const shots = lines.map((dialogue, index) => ({ start: index * 5, end: (index + 1) * 5, type: index === 0 ? "hook" : "proof", visual: `La couverture affiche ${name}`, action: "présente la référence réelle", dialogue, camera: "selfie vertical" }));
  Object.defineProperties(draft, {
    shots: { value: shots, enumerable: false },
    cta: { value: lines[4], enumerable: false },
  });
  return draft as typeof draft & { shots: typeof shots; cta: string };
};

export const ugcFixtureResponse = (messages: Array<{ content: string }>) => {
  const content = messages.map(message => message.content).join(" ");
  let name = "Guide pratique";
  try {
    const payload = JSON.parse(messages[messages.length - 1]?.content ?? "{}") as { product?: { name?: string; product?: { name?: string } } };
    name = payload.product?.product?.name ?? payload.product?.name ?? name;
  } catch {
    name = content.match(/\"productName\":\"([^\"]+)\"/)?.[1] ?? name;
  }
  if (content.includes("Tu analyses un produit")) return JSON.stringify(ugcAnalysis(name));
  return JSON.stringify(ugcCreative(name, /English|anglais/i.test(content) ? "English" : "French"));
};
