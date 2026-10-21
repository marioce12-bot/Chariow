import { describe, expect, it, vi } from "vitest";
import { commonsSearchUrl, parseCommonsTracks, searchCommonsMusic } from "@/lib/studio/music-catalog";

const item = (license: string, mime = "audio/ogg", url = "https://upload.wikimedia.org/wikipedia/commons/a/a1/demo.ogg", extra: Record<string, { value?: string }> = {}, mediatype?: string) => ({
  title: "File:Demo.ogg", imageinfo: [{ url, mime, mediatype, descriptionurl: "https://commons.wikimedia.org/wiki/File:Demo.ogg", extmetadata: {
    LicenseShortName: { value: license }, LicenseUrl: { value: "https://creativecommons.org/publicdomain/zero/1.0/" }, Artist: { value: "Composer" }, ...extra,
  } }],
});

describe("music catalog", () => {
  it("only exposes per-file CC0 and public-domain audio metadata and accepts OGG mediatype", () => {
    const tracks = parseCommonsTracks({ query: { pages: {
      a: item("CC0 1.0", "application/ogg", undefined, {}, "AUDIO"),
      b: item("CC BY-SA 4.0"), c: item("Public domain", "image/jpeg"),
      d: item("Public domain", "audio/ogg", "http://127.0.0.1/private"),
      e: item("not public domain"), f: item("CC0", "video/ogg", undefined, {}, "VIDEO"),
    } } });
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ id: "a", license: "CC0 1.0", artist: "Composer" });
  });

  it("rejects unsafe license and file-page URLs and builds attribution from descriptive metadata", () => {
    const badLicense = item("CC0");
    badLicense.imageinfo[0].extmetadata.LicenseUrl = { value: "https://creativecommons.org.evil.test/publicdomain/zero" };
    const badPage = item("CC0");
    badPage.imageinfo[0].descriptionurl = "https://commons.wikimedia.org.evil.test/wiki/File";
    const good = item("Public domain", "application/ogg", undefined, { AttributionRequired: { value: "true" }, Attribution: { value: "Recording attribution" } }, "AUDIO");
    const tracks = parseCommonsTracks({ query: { pages: { a: badLicense, b: badPage, c: good } } });
    expect(tracks).toHaveLength(1);
    expect(tracks[0].attribution).toBe("Demo — Composer — Public domain — Recording attribution");
    expect(tracks[0].attribution).not.toContain("true");
  });

  it("filters the Commons search before results and encodes user text as a parameter", () => {
    const url = new URL(commonsSearchUrl("piano & anything"));
    expect(url.origin).toBe("https://commons.wikimedia.org");
    expect(url.pathname).toBe("/w/api.php");
    expect(url.searchParams.get("gsrsearch")).toContain("insource:");
    expect(url.searchParams.get("gsrsearch")).toContain("piano & anything");
    expect(url.searchParams.get("iiprop")).toContain("mediatype");
  });

  it("fetches fixed endpoint and follows bounded search pagination", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: { a: item("CC0") } }, continue: { gsroffset: 30 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: { b: item("CC0") } }, continue: { gsroffset: 60 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: { c: item("CC0") } }, continue: { gsroffset: 90 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: { d: item("CC0") } } }), { status: 200 }));
    await expect(searchCommonsMusic("piano", mockFetch as unknown as typeof fetch)).resolves.toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });
});
