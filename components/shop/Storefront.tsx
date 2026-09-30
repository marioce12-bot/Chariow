import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { readableTextOn } from "@/lib/shop/color";
import type { ShopItem, ShopOk } from "@/lib/shop/data";
import { BuyLink } from "./BuyLink";
import { MetaPixel } from "./MetaPixel";
import { ShopBeacon } from "./ShopBeacon";

function buyHref(view: ShopOk, item: ShopItem, query: string) {
  // En aperçu (non publiée), le bouton est inactif : la redirection n'existe que pour une vitrine publiée.
  if (view.preview) return "#";
  return `/shop/${view.slug}/buy/${encodeURIComponent(item.id)}${query ? `?${query}` : ""}`;
}

function productHref(view: ShopOk, item: ShopItem, query: string) {
  return `/shop/${view.slug}/${encodeURIComponent(item.id)}${query ? `?${query}` : ""}`;
}

export function ShopShell({ view, children }: { view: ShopOk; children: ReactNode }) {
  const { config } = view;
  const style = { "--shop-primary": config.primaryColor, "--shop-on-primary": readableTextOn(config.primaryColor) } as CSSProperties;
  return (
    <main className={`shop-root shop-theme-${config.theme} shop-title-${config.titleStyle}`} style={style}>
      {view.preview ? <div className="shop-preview">Aperçu privé : cette vitrine n’est pas encore publiée.</div> : null}
      <div className="shop-container">{children}</div>
      {view.preview ? null : <ShopBeacon slug={view.slug} />}
      {view.pixelId ? <MetaPixel pixelId={view.pixelId} /> : null}
    </main>
  );
}

function Header({ view, linked }: { view: ShopOk; linked: boolean }) {
  const { config } = view;
  const title = <h1 className="shop-title">{config.shopName}</h1>;
  return (
    <header className="shop-header">
      {config.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="shop-logo" src={config.logoUrl} alt={`Logo ${config.shopName}`} width={72} height={72} referrerPolicy="no-referrer" />
      ) : null}
      {linked ? <Link href={`/shop/${view.slug}`} className="shop-title-link">{title}</Link> : title}
      {config.tagline ? <p className="shop-tagline">{config.tagline}</p> : null}
    </header>
  );
}

export function ShopStorefront({ view, query }: { view: ShopOk; query: string }) {
  const { config, items } = view;
  return (
    <ShopShell view={view}>
      <Header view={view} linked={false} />
      {config.about ? <p className="shop-about">{config.about}</p> : null}
      {view.productsError ? <p className="shop-empty">Les produits sont momentanément indisponibles. Réessaie dans un instant.</p> : null}
      {!view.productsError && items.length === 0 ? <p className="shop-empty">Aucun produit à afficher pour le moment.</p> : null}
      <section className="shop-grid" aria-label="Produits">
        {items.map((item) => (
          <article key={item.id} className="shop-card">
            <Link href={productHref(view, item, query)} className="shop-card-media" aria-label={item.title}>
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.title} loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="shop-card-placeholder" aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</span>
              )}
            </Link>
            <div className="shop-card-body">
              <h2 className="shop-card-title"><Link href={productHref(view, item, query)}>{item.title}</Link></h2>
              {item.price ? <p className="shop-price">{item.price}</p> : null}
              {item.description ? <p className="shop-desc">{item.description}</p> : null}
              <BuyLink href={buyHref(view, item, query)} productId={item.id} className="shop-buy">{config.buttonLabel}</BuyLink>
            </div>
          </article>
        ))}
      </section>
    </ShopShell>
  );
}

export function ShopProductDetail({ view, item, query }: { view: ShopOk; item: ShopItem; query: string }) {
  return (
    <ShopShell view={view}>
      <Header view={view} linked />
      <Link href={`/shop/${view.slug}${query ? `?${query}` : ""}`} className="shop-back">← Tous les produits</Link>
      <article className="shop-detail">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="shop-detail-image" src={item.image} alt={item.title} referrerPolicy="no-referrer" />
        ) : null}
        <h2 className="shop-detail-title">{item.title}</h2>
        {item.price ? <p className="shop-price">{item.price}</p> : null}
        {item.description ? <p className="shop-detail-desc">{item.description}</p> : null}
        <BuyLink href={buyHref(view, item, query)} productId={item.id} className="shop-buy">{view.config.buttonLabel}</BuyLink>
      </article>
    </ShopShell>
  );
}

export function ShopMessage({ title, text }: { title: string; text: string }) {
  return (
    <main className="shop-root shop-theme-light">
      <title>{title}</title>
      <div className="shop-container shop-message">
        <h1 className="shop-title">{title}</h1>
        <p className="shop-tagline">{text}</p>
      </div>
    </main>
  );
}
