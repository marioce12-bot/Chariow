import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vendeo",
    short_name: "Vendeo",
    description: "Ton analyste IA pour vendre plus de produits digitaux.",
    start_url: "/",
    display: "standalone",
    background_color: "#020B35",
    theme_color: "#020B35",
    lang: "fr",
    icons: [
      { src: "/icons/vendeo-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
