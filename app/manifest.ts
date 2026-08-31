import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vendeo",
    short_name: "Vendeo",
    description: "Gère, analyse et optimise ton activité digitale depuis un seul espace.",
    start_url: "/",
    display: "standalone",
    background_color: "#020B35",
    theme_color: "#020B35",
    lang: "fr",
    icons: [
      { src: "/icons/vendeo-icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
