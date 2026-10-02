import { describe, expect, it } from "vitest";
import { resolveLaunchPlatform } from "./launch-platform";

describe("resolveLaunchPlatform", () => {
  it("lit le champ platform du JSON de l'IA en priorité", () => {
    expect(resolveLaunchPlatform("tiktok", ["sur meta"])).toBe("tiktok");
    expect(resolveLaunchPlatform("TikTok", [])).toBe("tiktok");
    expect(resolveLaunchPlatform("meta", ["sur tiktok"])).toBe("meta");
    expect(resolveLaunchPlatform("Facebook", [])).toBe("meta");
  });

  it("retombe sur les messages de l'utilisateur, la dernière plateforme nommée gagne", () => {
    expect(resolveLaunchPlatform(undefined, ["Je veux relancer la campagne mais sur tiktok"])).toBe("tiktok");
    expect(resolveLaunchPlatform(null, ["Je ne veux pas lancer ça sur meta. J'ai dit sur TikTok"])).toBe("tiktok");
    expect(resolveLaunchPlatform(null, ["pas sur TikTok, sur Meta"])).toBe("meta");
    expect(resolveLaunchPlatform(null, ["sur tiktok", "ok merci"])).toBe("tiktok");
    expect(resolveLaunchPlatform(null, ["sur tiktok", "finalement sur Facebook"])).toBe("meta");
  });

  it("vaut Meta par défaut (comportement d'avant)", () => {
    expect(resolveLaunchPlatform(undefined, [])).toBe("meta");
    expect(resolveLaunchPlatform("autre", ["oui lance"])).toBe("meta");
    expect(resolveLaunchPlatform(42, ["bonjour"])).toBe("meta");
  });
});
