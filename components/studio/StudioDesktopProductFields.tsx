"use client";

export type StudioDesktopProduct = {
  id: string;
  name: string;
  description?: string | null;
};

export function StudioDesktopProductFields({
  products,
  selectedProduct,
  onSelect,
  locale,
  mode,
}: {
  products: StudioDesktopProduct[];
  selectedProduct: StudioDesktopProduct | null;
  onSelect: (productId: string | null) => void;
  locale: string;
  mode: "slideshow" | "video";
}) {
  const en = locale === "en";
  const slideshow = mode === "slideshow";

  return (
    <section
      className={`studio-desktop-product studio-desktop-product--${mode}`}
      aria-label={en ? "Your product" : "Votre produit"}
    >
      {slideshow ? <h2>{en ? "Your product" : "Votre produit"}</h2> : null}
      <label className="studio-field">
        <span>
          {slideshow
            ? en ? "Product name" : "Nom du produit"
            : en ? "Your product" : "Votre produit"}
        </span>
        <select
          aria-label={slideshow
            ? en ? "Product name" : "Nom du produit"
            : en ? "Your product" : "Votre produit"}
          value={selectedProduct?.id ?? ""}
          onChange={(event) => onSelect(event.target.value || null)}
        >
          <option value="">
            {en ? "Choose a product" : "Choisir un produit"}
          </option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
      {slideshow ? (
        <div className="studio-field">
          <span id="studio-desktop-product-description-label">
            {en ? "Description (optional)" : "Description (optionnelle)"}
          </span>
          <p className="studio-product-description-value" aria-labelledby="studio-desktop-product-description-label">
            {selectedProduct?.description?.trim() || (en ? "No description available" : "Aucune description disponible")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
