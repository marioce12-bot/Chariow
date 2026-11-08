/**
 * Progression affichée pendant le rendu d'une vidéo Studio.
 *
 * Le serveur n'enregistre sa progression que par paliers (voir lib/studio/video-workflow.ts)
 * et le client ne l'interroge que toutes les 30 s : une barre qui suivrait ces valeurs à la lettre
 * saute, puis reste immobile pendant que le fournisseur génère une séquence.
 * La valeur affichée avance donc en continu entre deux paliers et rattrape le serveur sans à-coup.
 */

/** Paliers enregistrés par le workflow vidéo : le rendu d'une séquence se fait entre deux d'entre eux. */
export const STUDIO_VIDEO_PROGRESS_MILESTONES = [10, 42, 48, 52, 58, 82, 86, 90, 94, 100] as const;

/** Valeur minimale affichée dès le lancement, pour que la barre ne reste pas vide. */
export const STUDIO_VIDEO_PROGRESS_START = 3;
/** Plafond tant que la vidéo n'est pas livrée : 100 % est réservé à la fin. */
export const STUDIO_VIDEO_PROGRESS_MAX_RUNNING = 99;

/** Plus ce délai est court, plus la barre se rapproche vite du prochain palier. */
const CREEP_TIME_CONSTANT_MS = 75_000;
/** Vitesse minimale entre deux paliers : environ 1 % toutes les 25 s, la barre ne se fige jamais. */
const MIN_CREEP_PER_SECOND = 0.04;
/** Vitesse minimale pour rattraper un palier serveur plus avancé. */
const MIN_CATCH_UP_PER_SECOND = 1.2;
/** Part de l'écart rattrapée par seconde quand le serveur est en avance. */
const CATCH_UP_GAP_PER_SECOND = 0.4;
/** Un onglet mis en veille ne doit pas produire un saut de plusieurs minutes d'un coup. */
const MAX_ELAPSED_MS = 2_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Plus haute valeur que l'on peut afficher sans dépasser le prochain palier du serveur. */
export function studioVideoProgressCeiling(serverProgress: number): number {
  const server = clamp(Number.isFinite(serverProgress) ? serverProgress : 0, 0, STUDIO_VIDEO_PROGRESS_MAX_RUNNING);
  const next = STUDIO_VIDEO_PROGRESS_MILESTONES.find((milestone) => milestone > server) ?? 100;
  return Math.min(STUDIO_VIDEO_PROGRESS_MAX_RUNNING, next - 1);
}

/**
 * Calcule la prochaine valeur (fractionnaire) de la barre.
 * Ne recule jamais, rattrape le serveur s'il est en avance, sinon avance doucement vers le palier suivant.
 */
export function nextStudioVideoProgress(current: number, serverProgress: number, elapsedMs: number): number {
  const seconds = clamp(Number.isFinite(elapsedMs) ? elapsedMs : 0, 0, MAX_ELAPSED_MS) / 1000;
  const server = clamp(Number.isFinite(serverProgress) ? serverProgress : 0, 0, STUDIO_VIDEO_PROGRESS_MAX_RUNNING);
  const value = clamp(Number.isFinite(current) ? current : 0, STUDIO_VIDEO_PROGRESS_START, STUDIO_VIDEO_PROGRESS_MAX_RUNNING);

  if (value < server) {
    const step = Math.max(MIN_CATCH_UP_PER_SECOND * seconds, (server - value) * Math.min(1, CATCH_UP_GAP_PER_SECOND * seconds));
    return Math.min(server, value + step);
  }

  const ceiling = studioVideoProgressCeiling(server);
  if (value >= ceiling) return value;
  const step = Math.max(((ceiling - value) * seconds * 1000) / CREEP_TIME_CONSTANT_MS, MIN_CREEP_PER_SECOND * seconds);
  return Math.min(ceiling, value + step);
}
