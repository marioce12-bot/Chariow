import { describe, expect, it } from "vitest";
import { storeConnectionReminderCopy } from "./store-connection-reminder";

describe("store connection reminder", () => {
  it("writes the requested French onboarding copy and dashboard CTA", () => {
    const copy = storeConnectionReminderCopy("fr", "Awa", "https://vendeo-studio.site/dashboard");
    expect(copy.subject).toContain("boutique Chariow");
    expect(copy.text).toContain("Il manque encore une étape");
    expect(copy.html).toContain("Connecter ma boutique");
    expect(copy.html).toContain("https://vendeo-studio.site/dashboard");
  });

  it("escapes names and supports English accounts", () => {
    const copy = storeConnectionReminderCopy("en", "<Awa>", "https://vendeo-studio.site/dashboard?a=1&b=2");
    expect(copy.text).toContain("<Awa>");
    expect(copy.html).toContain("&lt;Awa&gt;");
    expect(copy.html).toContain("&amp;");
    expect(copy.subject).toContain("connect your Chariow store");
  });
});
