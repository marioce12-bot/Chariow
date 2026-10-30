import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../components/dashboard/sections.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/styles/dashboard.css", import.meta.url), "utf8");
const card = (format: string) => dashboard.match(new RegExp(`<article className="studio-mobile-choice" data-studio-format="${format}">([\\s\\S]*?)</article>`))?.[1] ?? "";

describe("mobile Studio format cards", () => {
  it("shows the supplied promotional poster and retains the Image selection button", () => {
    const image = card("image");
    expect(image).toContain('<img src="/studio-format-previews/image-poster.jpeg"');
    expect(image).toContain('"Affiche promotionnelle"');
    expect(image).toContain('openStudioMode("image")');
    expect(image).toContain('"Sélectionner"');
  });

  it("uses the LinkedIn slideshow for Slideshow and the product presentation loop for Video", () => {
    const slideshow = card("slideshow");
    const video = card("video");
    for (const [markup, src, frenchDescription, mode] of [
      [slideshow, "/studio-format-previews/video-linkedin.mp4", "Une suite d’images pour présenter un produit", "slideshow"],
      [video, "/studio-format-previews/slideshow-lonae.mp4", "Une courte vidéo publicitaire", "video"],
    ]) {
      expect(markup).toContain(`src="${src}" autoPlay muted loop playsInline controls={false}`);
      expect(markup).toContain(`"${frenchDescription}"`);
      expect(markup).toContain(`openStudioMode("${mode}")`);
      expect(markup).toContain('"Sélectionner"');
    }
  });

  it("lays out the media as decorative card backgrounds and keeps descriptions below them", () => {
    expect(css).toContain(".studio-mobile-choice-preview img,.studio-mobile-choice-preview video");
    expect(css).toContain("pointer-events:none");
    expect(css).toContain(".studio-mobile-choice-description");
  });
});
