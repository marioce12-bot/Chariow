import Image from "next/image";
import { ArrowUpRight, BookOpen, Check, Layers, ShoppingBag, Sparkles } from "lucide-react";
import { SiMeta, SiPinterest, SiTiktok } from "react-icons/si";

/** Static explanatory composition. Sample products and events are not customer results. */
export function DigitalWorkspaceVisual({ isEnglish = false }: { isEnglish?: boolean }) {
  const en = isEnglish;
  return <figure className="digital-workspace" id="apercu" aria-labelledby="workspace-visual-title" aria-describedby="workspace-example-note">
    <figcaption className="workspace-visual-heading" id="workspace-visual-title"><Layers size={16} aria-hidden="true"/>{en ? "Your business, connected in Vendeo" : "Ton activité, réunie dans Vendeo"}</figcaption>
    <div className="workspace-map">
      <span className="workspace-connection connection-top" aria-hidden="true"/>
      <span className="workspace-connection connection-bottom" aria-hidden="true"/>
      <section className="workspace-card workspace-products" aria-label={en ? "Digital product mockups" : "Mockups de produits digitaux"}>
        <p className="workspace-card-label"><BookOpen size={14} aria-hidden="true"/>{en ? "Your digital products" : "Tes produits digitaux"}</p>
        <div className="workspace-books" aria-hidden="true">
          <div className="workspace-book book-course"><span>{en ? "ONLINE COURSE" : "FORMATION"}</span><i/><strong>{en ? "Share your\nexpertise" : "Partage ton\nexpertise"}</strong><small>{en ? "YOUR KNOW-HOW" : "TON SAVOIR-FAIRE"}</small></div>
          <div className="workspace-book book-ebook"><span>EBOOK</span><strong>{en ? "Your next\nbig idea." : "Ta prochaine\ngrande idée."}</strong><i/><small>{en ? "YOUR DIGITAL GUIDE" : "TON GUIDE DIGITAL"}</small></div>
        </div>
      </section>
      <section className="workspace-card workspace-networks" aria-label={en ? "Advertising platforms" : "Plateformes publicitaires"}>
        <p className="workspace-card-label">{en ? "Your advertising channels" : "Tes canaux publicitaires"}</p>
        <ul className="workspace-platforms">
          <li><SiMeta aria-hidden="true" className="network-meta"/><span>Meta</span><ArrowUpRight aria-hidden="true"/></li>
          <li><SiTiktok aria-hidden="true" className="network-tiktok"/><span>TikTok</span><ArrowUpRight aria-hidden="true"/></li>
          <li><SiPinterest aria-hidden="true" className="network-pinterest"/><span>Pinterest</span><ArrowUpRight aria-hidden="true"/></li>
        </ul>
      </section>
      <section className="workspace-hub" aria-label={en ? "Vendeo workspace and authentic AI Studio detail" : "Espace Vendeo et détail authentique du Studio IA"}>
        <div className="workspace-hub-header"><Image src="/vendeo-logo.webp" alt="Vendeo" width={126} height={34}/><span><Layers size={12} aria-hidden="true"/>{en ? "One workspace" : "Un seul espace"}</span></div>
        <div className="workspace-hub-tools"><span>{en ? "Store" : "Boutique"}</span><span className="active">Studio IA</span><span>{en ? "Ads" : "Publicités"}</span><span>{en ? "Orders" : "Commandes"}</span></div>
        <div className="workspace-studio-detail"><Image src={`/landing/studio-detail-${en ? "en" : "fr"}.webp`} width={600} height={158} sizes="(max-width: 600px) 74vw, 380px" alt={en ? "Authentic Vendeo AI Studio excerpt: create your media with AI, with Image and Video options." : "Extrait réel du Studio IA Vendeo : Crée tes médias avec l’IA, options Image et Vidéo."}/></div>
        <p className="workspace-hub-note"><Sparkles size={12} aria-hidden="true"/>{en ? "Authentic AI Studio detail" : "Extrait réel du Studio IA"}</p>
      </section>
      <section className="workspace-card workspace-ad" aria-label={en ? "Illustrative ad preview" : "Aperçu illustratif d’une publicité"}>
        <p className="workspace-card-label">{en ? "Your next ad" : "Ta prochaine publicité"}<small>{en ? "Example" : "Exemple"}</small></p>
        <div className="workspace-ad-creative">
          <Image src="/landing/digital-creator.webp" alt="" width={960} height={1200} sizes="(max-width: 600px) 30vw, 150px"/>
          <div><span>{en ? "YOUR EBOOK" : "TON EBOOK"}</span><strong>{en ? "Share\nyour knowledge." : "Partage\nton savoir."}</strong><span className="workspace-ad-cta">{en ? "Discover" : "Découvrir"} <ArrowUpRight size={10} aria-hidden="true"/></span></div>
        </div>
      </section>
      <section className="workspace-card workspace-order" aria-label={en ? "Fictional new order example" : "Exemple fictif de nouvelle commande"}>
        <p className="workspace-card-label"><span className="workspace-order-icon"><ShoppingBag size={15} aria-hidden="true"/></span>{en ? "New order" : "Nouvelle commande"}</p>
        <span className="workspace-example-tag">{en ? "Example event" : "Événement fictif"}</span>
        <div className="workspace-order-product"><BookOpen size={25} aria-hidden="true"/><div><strong>{en ? "Your ebook" : "Ton ebook"}</strong><span>{en ? "Digital product" : "Produit digital"}</span></div></div>
        <p className="workspace-order-status"><Check size={13} aria-hidden="true"/>{en ? "Order received" : "Commande reçue"}</p>
      </section>
    </div>
    <p className="workspace-example-note" id="workspace-example-note">{en ? "Illustrative workflow · sample products, ad and order. No customer results shown." : "Illustration du parcours · produits, publicité et commande fictifs. Aucun résultat client présenté."}</p>
  </figure>;
}
