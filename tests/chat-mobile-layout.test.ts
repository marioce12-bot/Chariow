import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/translate";

const css = postcss.parse(readFileSync(new URL("../app/vendeo-ai.css", import.meta.url), "utf8"));
function mobileDeclarations(selector: string) {
  const result: Record<string, string> = {};
  css.walkAtRules("media", (media) => {
    if (media.params !== "(max-width:760px)") return;
    media.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return;
      rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
    });
  });
  return result;
}

describe("mobile chat layout", () => {
  it("removes stacked page/card gutters and aligns the composer with messages", () => {
    expect(mobileDeclarations(".app-layout-flush .app-main.chat-page")).toMatchObject({ "padding-left": "0", "padding-right": "0" });
    expect(mobileDeclarations(".ai-page .chat-card.ai-main")).toMatchObject({ padding: "0", border: "0" });
    expect(mobileDeclarations(".ai-page .chat-messages")).toMatchObject({ padding: "18px 12px 16px", gap: "22px" });
    expect(mobileDeclarations(".ai-page .chat-composer")).toMatchObject({ "padding-left": "12px", "padding-right": "12px" });
  });
  it("gives assistant cards full width and user bubbles more space without forcing short messages wide", () => {
    expect(mobileDeclarations(".ai-page .chat-bubble.assistant")).toMatchObject({ "max-width": "100%", padding: "16px", "font-size": "16px", "line-height": "1.65" });
    const user = mobileDeclarations(".ai-page .chat-bubble.user");
    expect(user).toMatchObject({ "max-width": "92%", padding: "14px 16px", "font-size": "16px", "line-height": "1.6" });
    expect(user.width).toBeUndefined();
    expect(mobileDeclarations(".ai-page .chat-bubble")).toMatchObject({ "overflow-wrap": "anywhere", "min-width": "0", "flex-shrink": "0" });
  });
  it("retains French and English labels for existing chat controls", () => {
    for (const locale of ["fr", "en"] as const) {
      for (const key of ["placeholder", "send", "seeMore", "seeLess", "copy", "launchNow", "history"]) {
        expect(translate(locale, `chat.${key}`)).not.toBe(`chat.${key}`);
      }
    }
  });
});
