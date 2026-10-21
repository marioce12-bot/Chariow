import { describe, expect, it } from "vitest";
import { getLicensedTrack, LICENSED_MUSIC, musicAttribution, privateTrackPath } from "../lib/studio/licensed-music";
describe("licensed synchronized studio music", () => {
  it("lists only the 13 verified Scott Buckley tracks with source and mandatory attribution", () => {
    expect(LICENSED_MUSIC).toHaveLength(13);
    expect(new Set(LICENSED_MUSIC.map(track => track.id)).size).toBe(13);
    for (const track of LICENSED_MUSIC) {
      expect(track.artist).toBe("Scott Buckley"); expect(track.license).toBe("CC BY 4.0");
      expect(new URL(track.sourceUrl).hostname).toBe("www.scottbuckley.com.au");
      expect(new URL(track.downloadUrl).hostname).toBe("www.scottbuckley.com.au");
      expect(track.credit).toContain(track.title); expect(track.youtubeNotice).toContain("DESCRIPTION");
    }
    expect(getLicensedTrack("../../secret")).toBeUndefined();
  });
  it("exports the artist credit, source, license, YouTube requirement and actual changes", () => {
    const credit = musicAttribution(LICENSED_MUSIC[0], { changes: ["trimmed", "volume adjusted", "transcoded"] });
    expect(credit).toContain(LICENSED_MUSIC[0].credit); expect(credit).toContain(LICENSED_MUSIC[0].sourceUrl);
    expect(credit).toContain("https://creativecommons.org/licenses/by/4.0/");
    expect(credit).toContain("trimmed, volume adjusted, transcoded"); expect(credit).toContain("DESCRIPTION"); expect(credit).toContain("Content ID");
    expect(musicAttribution(LICENSED_MUSIC[0])).toContain("Modifications: aucune");
  });
  it("keeps paths in the private server namespace", () => {
    expect(privateTrackPath("track.mp3")).toBe(`${process.cwd()}/private/studio-music/track.mp3`);
  });
});
