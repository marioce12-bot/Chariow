import { describe, expect, it } from "vitest";
import { areExactSameFile, findQuasiDuplicates, hammingDistance } from "./similarity";

describe("creative media fingerprints", () => {
  it("distinguishes exact hashes from perceptual proximity", () => {
    expect(areExactSameFile("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(areExactSameFile("a".repeat(64), "b".repeat(64))).toBe(false);
    expect(areExactSameFile("invalid", "invalid")).toBe(false);
  });

  it("finds image variants near in pHash space but keeps distinct files separate", () => {
    const near = findQuasiDuplicates([
      { id: "one", sha256: "a".repeat(64), kind: "image", perceptualHash: "0000000000000000" },
      { id: "two", sha256: "b".repeat(64), kind: "image", perceptualHash: "0000000000000007" },
      { id: "far", sha256: "c".repeat(64), kind: "image", perceptualHash: "ffffffffffffffff" },
    ]);
    expect(near).toEqual([{ firstId: "one", secondId: "two", kind: "image", distance: 3 }]);
  });

  it("compares video keyframes without matching on a single coincidental frame", () => {
    const found = findQuasiDuplicates([
      { id: "v1", sha256: "a".repeat(64), kind: "video", keyframeHashes: ["0000000000000000", "1111111111111111", "2222222222222222"] },
      { id: "v2", sha256: "b".repeat(64), kind: "video", keyframeHashes: ["0000000000000003", "1111111111111111", "ffff0000ffff0000"] },
      { id: "v3", sha256: "c".repeat(64), kind: "video", keyframeHashes: ["0000000000000000"] },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ firstId: "v1", secondId: "v2", kind: "video", comparedFrames: 3 });
  });

  it("rejects malformed perceptual hashes", () => {
    expect(hammingDistance("bad", "0000000000000000")).toBeNull();
  });
});
