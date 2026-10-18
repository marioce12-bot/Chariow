import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./sections.tsx", import.meta.url)), "utf8");

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// Mirrors the monotonically increasing request-token contract used by AdsView:
// only the currently selected account is allowed to publish a response.
describe("Meta account switching regression", () => {
  it("clears account-bound stats immediately and guards every older response, including A→B→C", async () => {
    expect(source).toContain("setMetaPerformance(null);");
    expect(source).toContain("setMetaResources(null);");
    expect(source).toContain("setMetaAccountRestricted(false);");
    expect(source).toContain("requestToken !== metaRequestToken.current");
    expect(source).toContain("setMetaLoadError(\"Impossible de charger les données de ce compte Meta.\")");

    const a = deferred<string>();
    const b = deferred<string>();
    const c = deferred<string>();
    let token = 0;
    let visible: { account: string; data: string } | null = null;
    const fetchAccount = (account: string, request: Deferred<string>) => {
      const ownToken = ++token;
      return request.promise.then((data) => { if (ownToken === token) visible = { account, data }; });
    };
    const requestA = fetchAccount("A", a);
    const requestB = fetchAccount("B", b);
    const requestC = fetchAccount("C", c);
    c.resolve("metrics-C");
    await requestC;
    b.resolve("metrics-B");
    a.resolve("metrics-A");
    await Promise.all([requestA, requestB]);
    expect(visible).toEqual({ account: "C", data: "metrics-C" });
  });

  it("keeps the toolbar/select available and only places the account skeleton beneath it", () => {
    expect(source).toContain("<label>{t(\"ads.account\")}<select");
    expect(source).toContain("<MetaAccountSkeleton />");
    const metaToolbar = source.indexOf("<div className=\"app-card meta-toolbar\">");
    const skeleton = source.indexOf("<MetaAccountSkeleton />", metaToolbar);
    const pixelPanel = source.indexOf("<section className=\"app-card\" style={{ marginBottom: 18 }}>", skeleton);
    expect(metaToolbar).toBeGreaterThan(-1);
    expect(skeleton).toBeGreaterThan(metaToolbar);
    expect(pixelPanel).toBeGreaterThan(skeleton);
    expect(source).toContain("Dernière synchro :");
    expect(source).toContain("!metaLoading && !metaLoadError && metaPerformance");
  });

  it("renders an explicit error rather than empty/zero account data after a failed fetch", () => {
    expect(source).toContain("if (!metrics.ok) throw new Error");
    expect(source).toContain("if (!resourceResponse.ok) throw new Error");
    expect(source).toContain("metaLoadError ? <div className=\"empty-state\" role=\"alert\">");
    expect(source).toContain("finally {\n      if (requestToken === metaRequestToken.current) setMetaLoading(false);");
    expect(source).toContain("!metaLoading && !metaLoadError && metaPerformance ?");
  });
});
