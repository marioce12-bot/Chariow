import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/dashboard/CreativePerformanceReadOnlyPreview", () => ({
  default: () => createElement("div", null, "isolated preview client"),
}));
import CreativePerformancePreviewPage from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
  notFound.mockClear();
});

describe("creative performance preview page access", () => {
  it("returns notFound outside Vercel Preview", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => CreativePerformancePreviewPage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("renders in Vercel Preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const markup = renderToStaticMarkup(createElement(CreativePerformancePreviewPage));
    expect(notFound).not.toHaveBeenCalled();
    expect(markup).toContain("lecture seule");
    expect(markup).toContain("isolated preview client");
  });
});
