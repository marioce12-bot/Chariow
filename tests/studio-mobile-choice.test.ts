import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../components/dashboard/sections.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/styles/dashboard.css", import.meta.url), "utf8");
const card = (format: string) => dashboard.match(new RegExp(`<article className="studio-mobile-choice" data-studio-format="${format}">([\\s\\S]*?)</article>`))?.[1] ?? "";
const previewComponent = dashboard.match(/function StudioFormatPreviewVideo[\s\S]*?\n}\n\nexport function StudioView/)?.[0] ?? "";

describe("mobile Studio format cards", () => {
  it("shows the supplied promotional poster and retains the Image selection button", () => {
    const image = card("image");
    expect(image).toContain('<img src="/studio-format-previews/image-poster.jpeg"');
    expect(image).toContain('"Affiche promotionnelle"');
    expect(image).toContain('openStudioMode("image")');
    expect(image).toContain('"Sélectionner"');
  });

  it("uses the matching clips and posters while retaining the card descriptions and selection buttons", () => {
    const slideshow = card("slideshow");
    const video = card("video");
    for (const [markup, src, poster, frenchDescription, englishDescription, mode] of [
      [slideshow, "/studio-format-previews/video-linkedin.mp4", "/studio-format-previews/slideshow-poster.webp", "Une suite d’images avec une voix off", "A sequence of images with voice-over", "slideshow"],
      [video, "/studio-format-previews/slideshow-lonae.mp4", "/studio-format-previews/video-poster.webp", "Une courte vidéo publicitaire", "A short promotional video", "video"],
    ]) {
      expect(markup).toContain(`<StudioFormatPreviewVideo src="${src}" poster="${poster}" />`);
      expect(markup).toContain(`"${frenchDescription}"`);
      expect(markup).toContain(`"${englishDescription}"`);
      expect(markup).toContain(`openStudioMode("${mode}")`);
      expect(markup).toContain('"Sélectionner"');
    }
  });

  it("starts both muted loops immediately and keeps small posters as loading placeholders", () => {
    expect(previewComponent).toContain("src={src}");
    expect(previewComponent).toContain("poster={poster}");
    expect(previewComponent).toContain('preload="auto"');
    expect(previewComponent).toMatch(/autoPlay[\s\S]*?muted[\s\S]*?loop[\s\S]*?playsInline[\s\S]*?controls=\{false\}/);
    expect(previewComponent).not.toContain("IntersectionObserver");
    for (const poster of ["slideshow-poster.webp", "video-poster.webp"]) {
      expect(statSync(new URL(`../public/studio-format-previews/${poster}`, import.meta.url)).size).toBeLessThan(32 * 1024);
    }
  });

  it("lays out the media as decorative card backgrounds and keeps descriptions below them", () => {
    expect(css).toContain(".studio-mobile-choice-preview img,.studio-mobile-choice-preview video");
    expect(css).toContain("pointer-events:none");
    expect(css).toContain(".studio-mobile-choice-description");
  });
});
