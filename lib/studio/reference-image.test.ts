import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReferenceImage } from "./reference-image";
const image = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp", "Content-Length": "3" } });
afterEach(() => vi.unstubAllGlobals());
describe("Studio reference download", () => {
  it.each(["images.chariowcdn.com", "assets.chariowcdn.com", "cdn.chariow.com", "res.cloudinary.com"])("accepts trusted HTTPS image host %s", async host => {
    const fetcher = vi.fn().mockResolvedValue(image()); vi.stubGlobal("fetch", fetcher);
    expect(await fetchReferenceImage(`https://${host}/product.webp`)).toEqual({ buffer: Buffer.from([1, 2, 3]), type: "image/webp" });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual", headers: { Accept: "image/webp,image/png,image/jpeg" } }));
  });
  it.each(["https://chariowcdn.com.evil.test/a", "https://evilchariowcdn.com/a", "http://images.chariowcdn.com/a", "https://127.0.0.1/a", "https://images.chariowcdn.com:8443/a"])("rejects untrusted URL %s before fetching", async url => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await fetchReferenceImage(url)).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("validates every redirect before fetching it", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } })); vi.stubGlobal("fetch", fetcher);
    expect(await fetchReferenceImage("https://images.chariowcdn.com/a")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("follows redirects only between trusted hosts", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://assets.chariowcdn.com/a" } })).mockResolvedValueOnce(image()); vi.stubGlobal("fetch", fetcher);
    expect((await fetchReferenceImage("https://images.chariowcdn.com/a"))?.type).toBe("image/webp"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([new Response("not image", { headers: { "Content-Type": "text/html" } }), new Response("", { headers: { "Content-Type": "image/jpeg" } }), new Response("x", { headers: { "Content-Type": "image/jpeg", "Content-Length": "10485761" } })])("rejects unsupported, empty and oversized responses", async response => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response)); expect(await fetchReferenceImage("https://images.chariowcdn.com/a")).toBeNull();
  });
});
