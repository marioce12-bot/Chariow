type PromptPayload = {
  product?: {
    title?: string;
    name?: string;
    description?: string;
    type?: string;
    category?: string;
    product?: { name?: string };
  };
  options?: { duration?: number; language?: string };
  language?: string;
  duration?: number;
};

const wordCount = (value: string) => value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:-[\p{L}\p{N}]+)*/gu)?.length ?? 0;
const padTotal = (dialogues: string[], target: number) => {
  const count = dialogues.reduce((sum, line) => sum + wordCount(line), 0);
  if (count < target) dialogues[0] += ` ${Array.from({ length: target - count }, () => "vraiment").join(" ")}`;
  return dialogues;
};

const boundsFor = (duration: number) => duration === 10
  ? [[0, 3], [3, 6.5], [6.5, 10]]
  : duration === 15
    ? [[0, 3.5], [3.5, 7.5], [7.5, 11.5], [11.5, 15]]
    : [[0, 5], [5, 10], [10, 15], [15, 21], [21, 25]];

const isEbook = (payload: PromptPayload, name: string) =>
  /\b(?:ebook|e-book|pdf|downloadable)\b/i.test(`${payload.product?.type ?? ""} ${payload.product?.category ?? ""}`)
  || /\b(?:ebook|e-book|guide|book|livre|pdf)\b/i.test(`${name} ${payload.product?.description ?? ""}`);

const frenchBeats = (duration: number, name: string, ebook: boolean, productKind: string) => {
  const scripts = duration === 10
    ? [
        "Tu cherches une idée nouvelle pour ta routine ?",
        "Je prends le produit et l'observe tranquillement.",
        ebook ? `Télécharge ${name} maintenant.` : productKind === "service" ? `Réserve ${name} maintenant.` : productKind === "physical" ? `Commande ${name} maintenant.` : `Découvre ${name} maintenant.`,
      ]
    : duration === 15
      ? [
          "Tu cherches une idée nouvelle pour ta routine ?",
          "Je prends le produit et l'observe tranquillement.",
          "Je le tourne doucement et regarde ses détails en lumière naturelle.",
          ebook ? `Télécharge ${name} dès maintenant.` : productKind === "service" ? `Réserve ${name} dès maintenant.` : productKind === "physical" ? `Commande ${name} dès maintenant.` : `Découvre ${name} dès maintenant.`,
        ]
      : [
          "Tu cherches une idée pour ta routine sans savoir par où commencer ?",
          "Je prends le produit et j'observe attentivement sa forme dans la lumière.",
          "Je le tourne doucement et prends le temps d'observer les détails en lumière naturelle.",
          "Je choisis un décor simple, rapproche le produit et le garde visible devant la caméra.",
          ebook ? `Télécharge ${name} dès maintenant.` : productKind === "service" ? `Réserve ${name} dès maintenant.` : productKind === "physical" ? `Commande ${name} dès maintenant.` : `Découvre ${name} dès maintenant.`,
        ];
  const targets: Record<number, number> = { 10: 25, 15: 38, 25: 63 };
  const dialogues = padTotal(scripts, targets[duration]);
  const lastVisual = ebook
    ? "ACTION: couverture réelle sur téléphone tenu face caméra; titre et illustration intacts, gros plan net centré"
    : "ACTION: vraie référence du produit tenue face caméra, clairement visible à l'écran";
  const bounds = boundsFor(duration);
  return bounds.map(([start, end], index) => {
    const action = index === bounds.length - 1 ? lastVisual : `ACTION: une adulte fictive manipule le produit dans une scène quotidienne liée à sa fiche`;
    return `${start}–${end}s | ${action}; CAMÉRA: plan vertical naturel; DIALOGUE EXACT: «${dialogues[index]}»`;
  });
};

const englishBeats = (duration: number, name: string, ebook: boolean, productKind: string) => {
  const scripts = duration === 10
    ? [
        "Are you looking for a fresh idea for your routine?",
        "I pick up the product and look at it slowly.",
        ebook ? `Download ${name} now.` : productKind === "service" ? `Book ${name} now.` : productKind === "physical" ? `Order ${name} now.` : `Discover ${name} now.`,
      ]
    : duration === 15
      ? [
          "Are you looking for a fresh idea for your routine?",
          "I pick up the product and look at it slowly.",
          "I turn it gently and notice its details in natural light.",
          ebook ? `Download ${name} today.` : productKind === "service" ? `Book ${name} today.` : productKind === "physical" ? `Order ${name} today.` : `Discover ${name} today.`,
        ]
      : [
          "Are you looking for an idea for your routine but unsure where to begin?",
          "I pick up the product and carefully observe its shape in the light.",
          "I turn it gently and take time to notice its details in natural light.",
          "I choose a simple setting, move the product closer, and keep it visible on camera.",
          ebook ? `Download ${name} today.` : productKind === "service" ? `Book ${name} today.` : productKind === "physical" ? `Order ${name} today.` : `Discover ${name} today.`,
        ];
  const targets: Record<number, number> = { 10: 25, 15: 38, 25: 63 };
  const dialogues = padTotal(scripts, targets[duration]);
  const lastVisual = ebook
    ? "ACTION: real cover on a phone held toward the camera; intact title and artwork, sharp centered close-up"
    : "ACTION: the real product reference is held toward the camera and clearly visible on screen";
  const bounds = boundsFor(duration);
  return bounds.map(([start, end], index) => {
    const action = index === bounds.length - 1 ? lastVisual : "ACTION: a fictional adult handles the product in an everyday scene connected to its listing";
    return `${start}–${end}s | ${action}; CAMERA: natural vertical shot; DIALOGUE EXACT: «${dialogues[index]}»`;
  });
};

/** Plain-text model fixture; image Studio keeps its separate constrained selection contract. */
export const ugcFixtureResponse = (messages: Array<{ role?: string; content: string }>) => {
  let payload: PromptPayload = {};
  try {
    const userMessage = [...messages].reverse().find(message => message.role === "user");
    payload = JSON.parse(userMessage?.content ?? "{}");
  } catch { /* route tests may provide a raw prompt; the fixture stays plain text */ }
  const name = payload.product?.title ?? payload.product?.product?.name ?? payload.product?.name ?? "Guide pratique";
  if (!payload.options) return `Create an image prompt for ${name}. Preserve the exact product name and use only the supplied reference.`;
  const duration = Number(payload.options.duration ?? 10);
  const english = /^(?:en|english|anglais)$/i.test(payload.options.language ?? payload.language ?? "");
  const type = `${payload.product?.type ?? ""} ${payload.product?.category ?? ""}`.toLowerCase();
  const ebook = isEbook(payload, name);
  const productKind = /service|event|evenement|événement/.test(type) ? "service" : /physique|physical|mode|food|nourriture|tasse|céramique|ceramique|savon|chaussure|vêtement|vetement|objet/.test(`${type} ${name} ${payload.product?.description ?? ""}`) ? "physical" : "other";
  const beats = english ? englishBeats(duration, name, ebook, productKind) : frenchBeats(duration, name, ebook, productKind);
  const title = english ? `UGC video prompt for ${name} — ${duration} seconds.` : `Scénario vidéo UGC pour ${name} — ${duration} secondes.`;
  return `${title}\n${english ? "Scene: A product-specific everyday moment." : "Scène: Un moment quotidien adapté au produit."}\n${beats.join("\n")}`;
};
