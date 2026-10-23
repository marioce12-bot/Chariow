export type SlideshowMotionProfile = { transitions: string[]; zoomDirection: 1 | -1 };
export type NativeMotionScene = { zoom: string; x: string; y: string; transition: "fade" | "smoothleft" | "smoothright"; duration: number };
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

/** Five restrained camera beats; last scene is deliberately static for a legible CTA. */
export function buildNativeMotionScenes(sceneCount: number, fps: number, transitionDuration: number): NativeMotionScene[] {
  if (!Number.isInteger(sceneCount) || sceneCount < 1 || fps < 1 || transitionDuration <= 0) throw new Error("Invalid native motion scene settings");
  const drifts = [
    ["(iw-iw/zoom)*0.35", "(ih-ih/zoom)*0.45"],
    ["(iw-iw/zoom)*0.65", "(ih-ih/zoom)*0.55"],
    ["(iw-iw/zoom)*0.5", "(ih-ih/zoom)*0.35"],
    ["(iw-iw/zoom)*0.4", "(ih-ih/zoom)*0.65"],
  ];
  return Array.from({ length: sceneCount }, (_, i) => {
    const final = i === sceneCount - 1;
    const [x, y] = final ? ["(iw-iw/zoom)*0.5", "(ih-ih/zoom)*0.5"] : drifts[i % drifts.length];
    return { zoom: final ? "1" : `1+0.012*min(on/${fps * 5},1)`, x, y, transition: i % 3 === 0 ? "fade" : i % 2 ? "smoothleft" : "smoothright", duration: transitionDuration };
  });
}
