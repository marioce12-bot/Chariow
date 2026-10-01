import { afterEach, describe, expect, it, vi } from "vitest";
import { detectMetaImageType, extractAdImageHash, isOwnCloudinaryUrl, ownStudioPathFromUrl, prepareMetaCreativeImage, uploadMetaAdImage } from "@/lib/meta/ad-image";
import { createMetaCreative } from "@/lib/meta/campaigns";

const SUPABASE = "https://wlroozwtsdlgaohdklif.supabase.co";
const USER = "60a3d6ee-86f1-4c0a-bc19-939a19637f83";
const signed = (path: string) => `${SUPABASE}/storage/v1/object/sign/studio-media/${path}?token=abc`;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

afterEach(() => vi.unstubAllGlobals());

describe("ownStudioPathFromUrl", () => {
  it("retrouve le chemin d'un fichier de l'utilisateur dans notre bucket", () => {
    expect(ownStudioPathFromUrl(signed(`${USER}/chat/abc.jpg`), USER, SUPABASE)).toBe(`${USER}/chat/abc.jpg`);
  });

  it("refuse le fichier d'un autre utilisateur, un autre hôte, un faux chemin et une URL invalide", () => {
    expect(ownStudioPathFromUrl(signed("autre-user/chat/abc.jpg"), USER, SUPABASE)).toBeNull();
    expect(ownStudioPathFromUrl(`https://evil.example.com/storage/v1/object/sign/studio-media/${USER}/chat/a.jpg`, USER, SUPABASE)).toBeNull();
    expect(ownStudioPathFromUrl(signed(`${USER}/../autre/a.jpg`), USER, SUPABASE)).toBeNull();
    expect(ownStudioPathFromUrl(signed(`${USER}/%2e%2e/autre/a.jpg`), USER, SUPABASE)).toBeNull();
    expect(ownStudioPathFromUrl(`${SUPABASE}/storage/v1/object/sign/autre-bucket/${USER}/a.jpg`, USER, SUPABASE)).toBeNull();
    expect(ownStudioPathFromUrl("http://" + SUPABASE.slice(8) + `/storage/v1/object/sign/studio-media/${USER}/a.jpg`, USER, SUPABASE)).toBeNull();
    expect(ownStudioPathFromUrl("pas une url", USER, SUPABASE)).toBeNull();
    expect(ownStudioPathFromUrl(signed(`${USER}/a.jpg`), USER, undefined)).toBeNull();
  });
});

describe("isOwnCloudinaryUrl / extractAdImageHash / detectMetaImageType", () => {
  it("n'accepte que notre Cloudinary en https", () => {
    expect(isOwnCloudinaryUrl("https://res.cloudinary.com/democloud/image/upload/v1/x.jpg", "democloud")).toBe(true);
    expect(isOwnCloudinaryUrl("https://res.cloudinary.com/autre/image/upload/v1/x.jpg", "democloud")).toBe(false);
    expect(isOwnCloudinaryUrl("http://res.cloudinary.com/democloud/image/upload/v1/x.jpg", "democloud")).toBe(false);
    expect(isOwnCloudinaryUrl("https://res.cloudinary.com.evil.com/democloud/image/upload/v1/x.jpg", "democloud")).toBe(false);
    expect(isOwnCloudinaryUrl("https://res.cloudinary.com/democloud/image/upload/v1/x.jpg", undefined)).toBe(false);
  });

  it("lit le hash dans la réponse de Meta", () => {
    expect(extractAdImageHash({ images: { "creative.jpg": { hash: "abc123", url: "https://x" } } })).toBe("abc123");
    expect(extractAdImageHash({ images: {} })).toBeNull();
    expect(extractAdImageHash({ error: { message: "x" } })).toBeNull();
    expect(extractAdImageHash(null)).toBeNull();
  });

  it("reconnaît JPEG et PNG sur les octets, refuse le reste", () => {
    expect(detectMetaImageType(jpeg)).toBe("image/jpeg");
    expect(detectMetaImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectMetaImageType(new Uint8Array(Buffer.from("<svg></svg>")))).toBeNull();
  });
});

describe("uploadMetaAdImage", () => {
  it("envoie l'image à Meta et retourne le hash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ images: { "creative.jpg": { hash: "h123" } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadMetaAdImage({ accountId: "act_1", accessToken: "tok", bytes: jpeg })).resolves.toBe("h123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/act_1\/adimages$/);
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("remonte l'erreur de Meta et refuse un format non pris en charge", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid image" } }), { status: 400 })));
    await expect(uploadMetaAdImage({ accountId: "act_1", accessToken: "tok", bytes: jpeg })).rejects.toThrow("Invalid image");
    await expect(uploadMetaAdImage({ accountId: "act_1", accessToken: "tok", bytes: new Uint8Array([1, 2, 3]) })).rejects.toThrow("Format");
  });
});

describe("prepareMetaCreativeImage", () => {
  it("ne télécharge jamais une URL qui n'est pas la nôtre et retombe sur l'URL (aucun appel réseau)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(prepareMetaCreativeImage({ userId: USER, accountId: "act_1", accessToken: "tok", imageUrl: "https://evil.example.com/a.jpg" })).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createMetaCreative", () => {
  const base = { accountId: "act_1", accessToken: "tok", name: "Créative", pageId: "p1", link: "https://awa.mychariow.shop/prd_1", message: "Texte", headline: "Titre", imageUrl: "https://exemple.com/a.jpg" };
  const sentSpec = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(new URLSearchParams(String((fetchMock.mock.calls[0][1] as RequestInit).body)).get("object_story_spec") as string).link_data;

  it("utilise image_hash (et pas picture) quand l'image a été envoyée à Meta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "cr_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createMetaCreative({ ...base, imageHash: "h123" });
    const linkData = sentSpec(fetchMock);
    expect(linkData.image_hash).toBe("h123");
    expect(linkData.picture).toBeUndefined();
  });

  it("garde picture (URL) quand il n'y a pas de hash : comportement d'avant pour les autres appelants", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "cr_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createMetaCreative(base);
    const linkData = sentSpec(fetchMock);
    expect(linkData.picture).toBe("https://exemple.com/a.jpg");
    expect(linkData.image_hash).toBeUndefined();
  });
});
