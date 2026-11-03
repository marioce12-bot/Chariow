type PromptPayload = {
  product?: { title?: string; name?: string; description?: string; product?: { name?: string } };
  options?: { duration?: number; language?: string };
  language?: string;
  duration?: number;
};

const frenchBeats = (duration: number, name: string) => {
  if (duration === 10) return [
    `0–3s | ACTION: Une adulte fictive remarque ${name}; CAMÉRA: plan vertical rapproché; DIALOGUE EXACT: «Tu cherches une idée pour ta routine ?»`,
    `3–7s | ACTION: Elle prend ${name} et regarde son étiquette; CAMÉRA: léger travelling; DIALOGUE EXACT: «Je découvre ${name} dans mon quotidien.»`,
    `7–10s | ACTION: Elle montre le produit à l'écran; CAMÉRA: plan stable; DIALOGUE EXACT: «Retrouve ${name} dans la boutique.»`,
  ];
  if (duration === 15) return [
    `0–5s | ACTION: Une adulte fictive observe ${name}; CAMÉRA: plan vertical; DIALOGUE EXACT: «Tu aimerais découvrir ${name} ?»`,
    `5–10s | ACTION: Elle prend le produit; CAMÉRA: plan rapproché; DIALOGUE EXACT: «Je regarde ce qui est indiqué sur sa fiche.»`,
    `10–15s | ACTION: Elle montre ${name}; CAMÉRA: plan poitrine; DIALOGUE EXACT: «Retrouve ${name} dans la boutique.»`,
  ];
  return [
    `0–5s | ACTION: Une adulte fictive entre dans la scène; CAMÉRA: plan vertical; DIALOGUE EXACT: «Tu aimerais découvrir ${name} ?»`,
    `5–10s | ACTION: Elle observe le produit; CAMÉRA: mouvement doux; DIALOGUE EXACT: «Je prends le temps de regarder sa fiche.»`,
    `10–15s | ACTION: Elle consulte la référence réelle; CAMÉRA: gros plan; DIALOGUE EXACT: «Je découvre les informations disponibles.»`,
    `15–20s | ACTION: Elle poursuit sa scène; CAMÉRA: retour au visage; DIALOGUE EXACT: «Je vois comment le présenter simplement.»`,
    `20–25s | ACTION: Elle conclut face caméra; CAMÉRA: plan stable; DIALOGUE EXACT: «Retrouve ${name} dans la boutique.»`,
  ];
};

const englishBeats = (duration: number, name: string) => {
  if (duration === 10) return [
    `0–3s | ACTION: A fictional adult notices ${name}; CAMERA: vertical close shot; DIALOGUE EXACT: «Do you want a new idea for your routine?»`,
    `3–7s | ACTION: They pick up ${name}; CAMERA: gentle move; DIALOGUE EXACT: «I look at ${name} as part of my day.»`,
    `7–10s | ACTION: They show the product; CAMERA: steady shot; DIALOGUE EXACT: «Find ${name} in the shop.»`,
  ];
  if (duration === 15) return [
    `0–5s | ACTION: A fictional adult looks at ${name}; CAMERA: vertical shot; DIALOGUE EXACT: «Would you like to discover ${name}?»`,
    `5–10s | ACTION: They pick up the product; CAMERA: close shot; DIALOGUE EXACT: «I read the details on its page.»`,
    `10–15s | ACTION: They show ${name}; CAMERA: medium shot; DIALOGUE EXACT: «Find ${name} in the shop.»`,
  ];
  return [
    `0–5s | ACTION: A fictional adult enters the scene; CAMERA: vertical shot; DIALOGUE EXACT: «Would you like to discover ${name}?»`,
    `5–10s | ACTION: They look at the product; CAMERA: gentle move; DIALOGUE EXACT: «I take a moment to read the details.»`,
    `10–15s | ACTION: They show the real reference; CAMERA: close shot; DIALOGUE EXACT: «I look at the available information.»`,
    `15–20s | ACTION: They continue the scene; CAMERA: return to face; DIALOGUE EXACT: «I see how to present it simply.»`,
    `20–25s | ACTION: They finish facing camera; CAMERA: steady shot; DIALOGUE EXACT: «Find ${name} in the shop.»`,
  ];
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
  const beats = english ? englishBeats(duration, name) : frenchBeats(duration, name);
  const title = english ? `UGC video prompt for ${name} — ${duration} seconds.` : `Scénario vidéo UGC pour ${name} — ${duration} secondes.`;
  return `${title}\nScene: ${english ? "A product-specific everyday moment." : "Un moment quotidien adapté au produit."}\n${beats.join("\n")}`;
};
