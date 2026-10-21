export type SlideshowMotionProfile = { transitions: string[]; zoomDirection: 1 | -1 };
const TRANSITIONS = ["fade", "smoothleft", "smoothright", "wipeleft", "wiperight", "circleopen", "circleclose"] as const;

/** Stable FNV-1a seeded shuffle, with a per-render random seed by default. */
export function chooseSlideshowMotionProfile(seed: string | number = `${Date.now()}-${Math.random()}`): SlideshowMotionProfile {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  const transitions = [...TRANSITIONS];
  for (let i = transitions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [transitions[i], transitions[j]] = [transitions[j], transitions[i]];
  }
  return { transitions: transitions.slice(0, 4), zoomDirection: random() < 0.5 ? 1 : -1 };
}
