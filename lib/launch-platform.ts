export type LaunchPlatform = "meta" | "tiktok";

export const TIKTOK_FROM_CHAT_MESSAGE =
  "Le lancement sur TikTok n’est pas encore disponible depuis le chat (cette campagne partirait sur Meta). Utilise Pub → Lancer une pub → TikTok pour la lancer sur TikTok.";

const TIKTOK = /tik\s?-?tok/gi;
const META = /\b(meta|facebook|instagram|fb)\b/gi;

function lastIndexOfMatch(text: string, pattern: RegExp): number {
  let last = -1;
  for (const match of text.matchAll(pattern)) last = match.index ?? last;
  return last;
}

// Plateforme visee par la campagne : d'abord le champ `platform` du JSON de l'IA, sinon le dernier
// message de l'utilisateur qui nomme une plateforme (la derniere nommee gagne : « pas sur Meta, sur TikTok » -> TikTok).
// Par defaut Meta, comme avant.
export function resolveLaunchPlatform(payloadPlatform: unknown, userMessages: string[]): LaunchPlatform {
  if (typeof payloadPlatform === "string") {
    if (/tik\s?-?tok/i.test(payloadPlatform)) return "tiktok";
    if (/meta|facebook|instagram/i.test(payloadPlatform)) return "meta";
  }
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const text = userMessages[index];
    const tiktokAt = lastIndexOfMatch(text, TIKTOK);
    const metaAt = lastIndexOfMatch(text, META);
    if (tiktokAt === -1 && metaAt === -1) continue;
    return tiktokAt > metaAt ? "tiktok" : "meta";
  }
  return "meta";
}
