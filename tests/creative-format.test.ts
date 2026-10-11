import { describe, expect, it } from "vitest";
import { FEED_TRANSFORM, VERTICAL_TRANSFORM, feedAdjustment, feedTransformFor, isAcceptedRatio, readImageSize, withCloudinaryTransform } from "@/lib/media/creative-format";

describe("isAcceptedRatio", () => {
  it("accepte les ratios Meta (9:16, 4:5, 1:1, 1,91:1, 16:9)", () => {
    expect(isAcceptedRatio({ width: 1080, height: 1920 })).toBe(true);
    expect(isAcceptedRatio({ width: 1080, height: 1350 })).toBe(true);
    expect(isAcceptedRatio({ width: 800, height: 800 })).toBe(true);
    expect(isAcceptedRatio({ width: 1200, height: 630 })).toBe(true);
    expect(isAcceptedRatio({ width: 1920, height: 1080 })).toBe(true);
  });

  it("refuse les autres ratios (4:3, 2:3) et les dimensions invalides", () => {
    expect(isAcceptedRatio({ width: 1200, height: 900 })).toBe(false);
    expect(isAcceptedRatio({ width: 1000, height: 1500 })).toBe(false);
    expect(isAcceptedRatio({ width: 0, height: 100 })).toBe(false);
  });
});

describe("feedTransformFor", () => {
  it("ne touche pas une image déjà conforme", () => {
    expect(feedTransformFor({ width: 1080, height: 1350 }, true)).toBeNull();
    expect(feedTransformFor({ width: 1080, height: 1080 }, true)).toBeNull();
    expect(feedAdjustment({ width: 1080, height: 1350 }, true)).toBeNull();
  });

  it("recadre en 4:5 quand le ratio n'est pas accepté", () => {
    const transform = feedTransformFor({ width: 1200, height: 900 }, true);
    expect(transform).toContain("ar_4:5");
    expect(transform).toContain("c_fill");
    expect(transform).toContain("g_auto");
    expect(transform).toContain("f_jpg");
    expect(feedAdjustment({ width: 1200, height: 900 }, true)).toBe("cropped");
  });

  it("agrandit une image étroite sans la recadrer et réduit une image énorme", () => {
    expect(feedTransformFor({ width: 450, height: 450 }, true)).toContain("c_scale,w_1080");
    expect(feedAdjustment({ width: 450, height: 450 }, true)).toBe("resized");
    expect(feedTransformFor({ width: 4000, height: 4000 }, true)).toContain("w_2048");
  });

  it("convertit un WebP ou un format illisible en JPEG", () => {
    expect(feedTransformFor({ width: 1080, height: 1350 }, false)).toBe("b_white,f_jpg,q_auto");
    expect(feedTransformFor(null, true)).toBe("b_white,f_jpg,q_auto");
    expect(feedAdjustment({ width: 1080, height: 1350 }, false)).toBe("converted");
  });
});

describe("withCloudinaryTransform", () => {
  const plain = "https://res.cloudinary.com/demo/image/upload/v123/vendeo/campaign-creatives/abc.jpg";

  it("insère la transformation avant la version", () => {
    expect(withCloudinaryTransform(plain, "c_scale,w_1080")).toBe("https://res.cloudinary.com/demo/image/upload/c_scale,w_1080/v123/vendeo/campaign-creatives/abc.jpg");
  });

  it("remplace une transformation existante au lieu de l'empiler", () => {
    const transformed = withCloudinaryTransform(plain, FEED_TRANSFORM) as string;
    expect(withCloudinaryTransform(transformed, VERTICAL_TRANSFORM)).toBe(`https://res.cloudinary.com/demo/image/upload/${VERTICAL_TRANSFORM}/v123/vendeo/campaign-creatives/abc.jpg`);
  });

  it("retourne null pour une URL qui n'est pas une image Cloudinary", () => {
    expect(withCloudinaryTransform("https://exemple.com/a.jpg", "c_scale,w_10")).toBeNull();
  });
});

describe("readImageSize", () => {
  it("lit les dimensions d'un PNG", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 1080);
    new DataView(png.buffer).setUint32(20, 1350);
    expect(readImageSize(png)).toEqual({ width: 1080, height: 1350 });
  });

  it("lit les dimensions d'un JPEG (segment SOF0 après un APP0)", () => {
    const jpeg = new Uint8Array(24);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x46, 0x04, 0x38, 0x03]);
    expect(readImageSize(jpeg)).toEqual({ width: 1080, height: 1350 });
  });

  it("retourne null pour un format inconnu ou tronqué", () => {
    expect(readImageSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBeNull();
  });
});
