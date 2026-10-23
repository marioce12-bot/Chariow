import Image from "next/image";
import { BarChart3, BookOpen, Check, Image as ImageIcon, ShoppingBag, Video } from "lucide-react";
import { SiShopify } from "react-icons/si";

/** Static explanatory flow; product, campaign and order are illustrative, not customer results. */
export function DigitalWorkspaceVisual({ isEnglish = false }: { isEnglish?: boolean }) {
  const en = isEnglish;
  return <figure className="digital-workspace" id="apercu" aria-labelledby="workspace-visual-title" aria-describedby="workspace-example-note">
    <figcaption className="workspace-visual-heading" id="workspace-visual-title">
      {en ? "From digital product to order analysis" : "Du produit digital à l’analyse des commandes"}
    </figcaption>
    <div className="workspace-integrations" aria-label={en ? "Connect your store" : "Connecte ta boutique"}>
      <span>{en ? "Connect your store" : "Connecte ta boutique"}</span>
      <span className="integration-logo chariow-logo"><Image src="/logos/chariow.svg" alt="Chariow" width={92} height={24}/></span>
      <span className="integration-logo shopify-logo"><SiShopify aria-hidden="true"/> Shopify</span>
      <span className="integration-vendeo">→ <Image src="/vendeo-logo.webp" alt="Vendeo" width={84} height={24}/></span>
    </div>
    <ol className="workspace-flow" aria-label={en ? "Four steps with Vendeo" : "Quatre étapes avec Vendeo"}>
      <li className="flow-step flow-product">
        <span className="flow-step-number">01</span>
        <h3>{en ? "Digital product" : "Produit digital"}</h3>
        <div className="flow-product-mockups" aria-hidden="true">
          <div className="flow-book flow-course"><small>{en ? "ONLINE COURSE" : "FORMATION"}</small><BookOpen size={20}/><strong>{en ? "Your expertise" : "Ton expertise"}</strong></div>
          <div className="flow-book flow-ebook"><small>EBOOK</small><BookOpen size={19}/><strong>{en ? "Your next idea" : "Ta prochaine idée"}</strong></div>
        </div>
        <p>{en ? "An ebook or a course from your store" : "Un ebook ou une formation de ta boutique"}</p>
      </li>
      <li className="flow-step flow-creative">
        <span className="flow-step-number">02</span>
        <h3>{en ? "Image or video creative" : "Créa image ou vidéo"}</h3>
        <div className="flow-creative-preview">
          <Image src="/landing/digital-creator.webp" alt={en ? "Smiling digital creator in an illustrative ad creative" : "Créatrice souriante dans un visuel publicitaire illustratif"} width={960} height={1200} sizes="(max-width: 700px) 42vw, 210px"/>
          <span className="creative-format"><ImageIcon size={13} aria-hidden="true"/> {en ? "Image" : "Image"}</span>
          <span className="creative-format"><Video size={13} aria-hidden="true"/> {en ? "Video" : "Vidéo"}</span>
        </div>
        <p>{en ? "Create your ad in Vendeo Studio" : "Crée ta publicité dans le Studio Vendeo"}</p>
      </li>
      <li className="flow-step flow-campaign">
        <span className="flow-step-number">03</span>
        <h3>{en ? "Campaign published" : "Campagne publiée"}</h3>
        <div className="campaign-preview"><span className="campaign-status"><i/> {en ? "Example status" : "Statut illustratif"}</span><div className="campaign-art"><Image src="/landing/digital-creator.webp" alt="" width={960} height={1200} sizes="(max-width: 700px) 40vw, 180px"/><strong>{en ? "Share your knowledge" : "Partage ton savoir"}</strong></div><span className="campaign-channel">{en ? "Ad creative preview" : "Aperçu du visuel publicitaire"}</span></div>
        <p>{en ? "Review and launch your campaign" : "Vérifie et lance ta campagne"}</p>
      </li>
      <li className="flow-step flow-analysis">
        <span className="flow-step-number">04</span>
        <h3>{en ? "New order & analysis" : "Nouvelle commande & analyse"}</h3>
        <div className="order-preview"><span className="order-example"><ShoppingBag size={13} aria-hidden="true"/> {en ? "Fictional example" : "Exemple fictif"}</span><strong><Check size={15} aria-hidden="true"/>{en ? "New order" : "Nouvelle commande"}</strong><span>{en ? "Digital product · sample event" : "Produit digital · événement fictif"}</span><div className="analysis-link"><BarChart3 size={16} aria-hidden="true"/>{en ? "Review campaign and orders" : "Analyse tes campagnes et commandes"}</div></div>
        <p>{en ? "Follow orders and review campaign data" : "Suis tes commandes et analyse tes campagnes"}</p>
      </li>
    </ol>
    <p className="workspace-example-note" id="workspace-example-note">{en ? "Illustrative workflow · sample creative, campaign and order. No customer results or performance claims." : "Parcours illustratif · créa, campagne et commande fictives. Aucun résultat client ni promesse de performance."}</p>
  </figure>;
}
