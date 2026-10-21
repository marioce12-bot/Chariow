// Synthetic product data for offline regression tests; no provider is called.
export const packFixture = {
  name: "Pack spécial Promo développement",
  description: "Trois guides numériques : application, IA et réseau LinkedIn. Des conseils pratiques pour développer son projet.",
  image: "https://images.chariowcdn.com/fixtures/pack.jpg",
};
export const drinksFixture = {
  name: "10 recettes de boissons",
  description: "", // Missing interior/recipe data is intentionally not filled in.
  image: "https://images.chariowcdn.com/fixtures/boissons.jpg",
};
export const inventedInteriorResponse = `Create an open ebook with interior pages labeled Fruitées, Florales, Épicées. Add recipes for hibiscus, ginger and pineapple. Add the tagline Des saveurs d'Afrique dans votre verre and GUARANTEED results. Put it in a premium box.`;
export const injectedCreativePlan = JSON.stringify({
  style: "editorial", composition: "spacious", copyIndices: [0, 2, -1, "Florales"],
  title: "Une nouvelle promesse", categories: ["Fruitées", "Florales", "Épicées"],
  tagline: "Des saveurs d'Afrique dans votre verre", packaging: "premium box", interior: "open ebook",
  benefits: ["GUARANTEED results"], palette: ["#ff6a00", "turquoise"], person: "man in a blazer",
});
