export const ugcAnalysis = (_name: string) => ({
  product_type: "digital" as const, niche: "guide pratique", target_audience: "Adultes francophones",
  core_problem: null, main_benefit: null, emotion_dominante: "curiosité", usage_context: "consultation sur téléphone",
  visual_assets: ["couverture fournie"], price_positioning: "accessible" as const,
  objections_probables: ["contenu adapté ?"], risks: ["ne pas promettre un résultat"], assumptions: [], confirmed_fact_ids: [0],
});

const scriptFor = (name: string, duration: number, english: boolean) => {
  if (duration === 10) return english
    ? [`Need a place to start with ${name}?`, "I pause and look at its supplied reference.", `Find ${name} in the shop.`]
    : [`Tu cherches par où commencer avec ${name} ?`, "Je m'arrête un instant et regarde sa référence.", `Retrouve ${name} dans la boutique.`];
  if (duration === 15) return english
    ? [`Looking for a way to begin exploring ${name} today?`, "I pause and look around my everyday workspace.", "I pick up the supplied reference and turn it gently.", `Find ${name} in the shop whenever you want to explore.`]
    : [`Tu cherches une idée pour commencer avec ${name} aujourd'hui ?`, "Je m'arrête un instant et regarde autour de moi.", "Je prends la référence et la tourne doucement.", `Retrouve ${name} dans la boutique si tu veux le découvrir.`];
  return english
    ? [`Have you wanted to explore ${name}, but felt unsure where to start?`, "I stop beside my open notebook and look over my first notes.", `I pick up ${name} and calmly read the reference shown on the screen.`, "I take a moment to compare that idea with what I wanted to explore.", `Find ${name} in the shop if you would like to learn more.`]
    : [`Tu as déjà eu envie de découvrir ${name}, sans savoir par où commencer ?`, "Je m'arrête devant mon carnet ouvert et regarde mes premières notes.", `Je prends ${name} et relis tranquillement la référence affichée sur l'écran.`, "Je prends un instant pour comparer cette idée à ce que je voulais explorer.", `Retrouve ${name} dans la boutique si tu veux en savoir davantage.`];
};

export const ugcCreative = (name: string, language = "French", duration = 25, description = "") => {
  const english = language.toLowerCase().startsWith("english") || language.toLowerCase() === "en";
  const lines = scriptFor(name, duration, english);
  const ends = duration === 10 ? [3, 7, 10] : duration === 15 ? [4, 8, 12, 15] : [4, 9, 15, 20, 25];
  const types = duration === 10 ? ["hook", "product", "cta"] : duration === 15 ? ["hook", "problem", "product", "cta"] : ["hook", "problem", "turning_point", "product", "cta"];
  let start = 0;
  const shots = lines.map((dialogue, index) => {
    const end = ends[index];
    const shot = {
      start, end, type: types[index], visual: `La référence réelle de ${name} dans un contexte quotidien`,
      action: "Elle baisse les yeux vers la scène, saisit la référence puis la tourne vers la caméra.",
      dialogue, camera: "selfie vertical avec léger rapprochement", emotion: ["curiosité", "hésitation", "déclic", "intérêt", "confiance"][index],
    };
    start = end;
    return shot;
  });
  const subject = `${name} ${description}`.toLowerCase();
  const location = /jardin|plante|botan/i.test(subject) ? "balcon avec jardinières"
    : /cuisine|recette|épice|epice/i.test(subject) ? "cuisine près du plan de travail"
    : /savon|soin|beauté|beaute/i.test(subject) ? "salle de bain près du lavabo"
    : /photo|portrait/i.test(subject) ? "extérieur pour une séance photo"
    : "coin d'étude à la maison";
  const themeWord = name.match(/[\p{L}]{4,}/u)?.[0] ?? name;
  const characters = [{ id: "c1", age: "30", gender: "femme", look: "femme noire adulte", outfit: "chemise simple", personality: "curieuse", role: "présentatrice fictive" }];
  const creative = {
    angle: "Une situation quotidienne et une découverte",
    link_theme: english ? `The setting reflects the product topic ${themeWord} from its supplied record.` : `La scène reprend le thème ${themeWord} indiqué dans la fiche produit.`,
    hook: { text: lines[0], visual: "Le personnage hésite puis regarde la référence." },
    scene: { location, lighting: "lumière naturelle", mood: "curieux et quotidien", props: ["téléphone", "carnet"], characters }, shots,
  };
  Object.defineProperty(creative, "characters", { value: characters, enumerable: false });
  Object.defineProperty(creative, "cta", { value: lines.at(-1), enumerable: false });
  return creative as typeof creative & { characters: typeof characters; cta: string };
};

export const ugcFixtureResponse = (messages: Array<{ content: string }>) => {
  const system = messages[0]?.content ?? "";
  let payload: { product?: { name?: string; description?: string; product?: { name?: string } }; duration?: number; language?: string } = {};
  try { payload = JSON.parse(messages[messages.length - 1]?.content ?? "{}"); } catch { /* use safe fixture defaults */ }
  const name = payload.product?.product?.name ?? payload.product?.name ?? "Guide pratique";
  if (system.includes("Tu es analyste produit")) return JSON.stringify(ugcAnalysis(name));
  return JSON.stringify(ugcCreative(name, payload.language === "en" ? "English" : "French", payload.duration ?? 25, payload.product?.description ?? ""));
};
