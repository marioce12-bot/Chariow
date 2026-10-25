export type FingerprintedCreative = {
  id: string;
  sha256: string;
  kind: "image" | "video";
  perceptualHash?: string | null;
  keyframeHashes?: string[] | null;
};

export type QuasiDuplicate = {
  firstId: string;
  secondId: string;
  kind: "image" | "video";
  distance: number;
  comparedFrames?: number;
};

export function hammingDistance(left: string, right: string): number | null {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return null;
  let distance = 0;
  for (let index = 0; index < 16; index += 1) {
    let bits = parseInt(left[index], 16) ^ parseInt(right[index], 16);
    while (bits) {
      distance += bits & 1;
      bits >>>= 1;
    }
  }
  return distance;
}

const MAX_IMAGE_DISTANCE = 8;
const MAX_VIDEO_FRAME_DISTANCE = 8;

function compareVideoFrames(left: string[], right: string[]): { distance: number; comparedFrames: number } | null {
  const distances: number[] = [];
  for (const frame of left) {
    const nearest = right
      .map((candidate) => hammingDistance(frame, candidate))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b)[0];
    if (nearest !== undefined) distances.push(nearest);
  }
  if (distances.length < 2) return null;
  const closeFrames = distances.filter((distance) => distance <= MAX_VIDEO_FRAME_DISTANCE).length;
  if (closeFrames < 2) return null;
  return {
    distance: Math.round((distances.reduce((sum, distance) => sum + distance, 0) / distances.length) * 100) / 100,
    comparedFrames: distances.length,
  };
}

/** Retourne des alertes de proximité; seul un SHA-256 identique désigne le même fichier exact. */
export function findQuasiDuplicates(assets: FingerprintedCreative[]): QuasiDuplicate[] {
  const results: QuasiDuplicate[] = [];
  for (let first = 0; first < assets.length; first += 1) {
    for (let second = first + 1; second < assets.length; second += 1) {
      const left = assets[first];
      const right = assets[second];
      if (left.kind !== right.kind || left.sha256 === right.sha256) continue;
      if (left.kind === "image") {
        if (!left.perceptualHash || !right.perceptualHash) continue;
        const distance = hammingDistance(left.perceptualHash, right.perceptualHash);
        if (distance !== null && distance <= MAX_IMAGE_DISTANCE) {
          results.push({ firstId: left.id, secondId: right.id, kind: "image", distance });
        }
        continue;
      }
      const match = compareVideoFrames(left.keyframeHashes ?? [], right.keyframeHashes ?? []);
      if (match) results.push({ firstId: left.id, secondId: right.id, kind: "video", ...match });
    }
  }
  return results;
}

export function areExactSameFile(leftSha256: string, rightSha256: string): boolean {
  return /^[0-9a-f]{64}$/i.test(leftSha256) && leftSha256.toLowerCase() === rightSha256.toLowerCase();
}
