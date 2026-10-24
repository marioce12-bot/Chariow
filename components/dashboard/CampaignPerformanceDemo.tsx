import { Eye, FileText, Info, Play, Sparkles } from "lucide-react";
import "./performance-visuel.css";

export function CampaignPerformanceDemo({ locale = "fr" }: { locale?: string }) {
  const en = locale === "en";
  return (
    <section className="creative-library ad-campaign-preparation" aria-labelledby="ad-campaign-title">
      <div className="ad-data-disclaimer" role="note">
        <Info size={19} aria-hidden="true" />
        <div>
          <strong>{en ? "MOCKUP — EXAMPLE, NOT BASED ON REAL DATA" : "MAQUETTE — EXEMPLE, NON BASÉ SUR DES DONNÉES RÉELLES"}</strong>
          <span>{en ? "This illustrative recommendation shows how the interface works. It is not a real campaign or a customer result." : "Cette recommandation est fournie à titre illustratif pour montrer le fonctionnement de Vendeo. Ce n’est ni une vraie campagne ni un résultat client."}</span>
        </div>
      </div>
      <div className="ad-recommendation">
        <div className="ad-recommendation-layout">
          <div className="ad-recommendation-details">
            <div className="ad-recommendation-heading">
              <span className="ad-recommendation-icon"><Sparkles size={18} aria-hidden="true" /></span>
              <div>
                <h3 id="ad-campaign-title">{en ? "Campaign recommendation" : "Recommandation de campagne"}</h3>
                <p>{en ? "A complete suggestion, ready to review and personalize." : "Une suggestion complète, prête à être appliquée et personnalisée."}</p>
              </div>
            </div>
            <dl className="ad-config-grid">
              <div><dt>{en ? "Product" : "Produit"}</dt><dd>{en ? "Glow serum (example)" : "Sérum éclat (exemple)"}</dd></div>
              <div><dt>{en ? "Platform" : "Plateforme"}</dt><dd>{en ? "Meta Ads (example)" : "Meta Ads (exemple)"}</dd></div>
              <div><dt>{en ? "Country / audience" : "Pays / audience"}</dt><dd>{en ? "Country confirmed by sales · lookalike audience if the data allows it" : "Pays confirmé par vos ventes · audience similaire à vos acheteurs (si les données le permettent)"}</dd></div>
              <div><dt>{en ? "Creative format" : "Format créatif"}</dt><dd>{en ? "Vertical 9:16 video, product demonstration" : "Vidéo verticale 9:16, démonstration produit"}</dd></div>
              <div><dt>{en ? "Headline" : "Titre"}</dt><dd>{en ? "Discover your new routine" : "Découvrez votre nouvelle routine"}</dd></div>
              <div><dt>{en ? "Text" : "Texte"}</dt><dd>{en ? "Present your product with a simple, authentic demonstration." : "Présentez votre produit avec une démonstration simple et authentique."}</dd></div>
              <div><dt>{en ? "Description" : "Description"}</dt><dd>{en ? "A conversion-focused creative to validate against the real product details." : "Une création pensée pour convertir, à valider selon les informations réelles du produit."}</dd></div>
              <div><dt>{en ? "Budget" : "Budget"}</dt><dd>{en ? "Suggested from your data and shown before applying" : "Proposé selon vos données et affiché avant application"}</dd></div>
              <div><dt>{en ? "Duration" : "Durée"}</dt><dd>{en ? "Recommended from your history" : "Recommandée selon votre historique"}</dd></div>
            </dl>
          </div>
          <aside className="ad-visual-preview" aria-label={en ? "Example creative preview" : "Aperçu du visuel exemple"}>
            <div className="ad-preview-head"><strong><Eye size={15} aria-hidden="true" /> {en ? "Creative preview (example)" : "Aperçu du visuel (exemple)"}</strong><span>{en ? "Format 9:16" : "Format 9:16"}</span></div>
            <div className="ad-visual-frame">
              <div className="ad-phone-shell">
                <div className="ad-phone-screen">
                  <img className="ad-phone-image" src="/demo/ad-serum.jpg" alt={en ? "Example serum advertisement" : "Publicité d’exemple pour un sérum"} />
                  <div className="ad-phone-sponsored"><span className="ad-phone-avatar">V</span><span>Vendeo<small>{en ? "Sponsored" : "Sponsorisé"}</small></span><span className="ad-phone-close" aria-hidden="true">×</span></div>
                  <div className="ad-phone-cta"><span>{en ? "Discover your new routine" : "Découvrez votre nouvelle routine"}</span><span aria-hidden="true">›</span></div>
                </div>
              </div>
            </div>
            <small>{en ? "Illustrative mockup visual · not generated" : "Visuel illustratif · non généré"}</small>
          </aside>
        </div>
        <div className="ad-action-footer">
          <div className="ad-apply-area">
            <button type="button" className="ad-apply-button" disabled title={en ? "Examples cannot be applied." : "Un exemple ne peut pas être appliqué."}><Sparkles size={16} /> {en ? "Apply" : "Appliquer"}</button>
            <small className="ad-credit-note">{en ? "The credit cost is shown before validation. No image is generated from this example." : "Le coût en crédits s’affiche avant validation. Aucun visuel n’est généré depuis cet exemple."}</small>
          </div>
          <div className="ad-review-step" role="note">
            <span className="ad-review-icon"><FileText size={18} aria-hidden="true" /></span>
            <div><strong>{en ? "After draft review" : "Après revue du brouillon"}</strong><p>{en ? "The real draft can be checked and edited before launch." : "Le brouillon réel pourra être vérifié et modifié avant son lancement."}</p></div>
            <button type="button" className="ad-launch-button" disabled title={en ? "A real draft is required." : "Un brouillon réel est requis."}><Play size={15} /> {en ? "Launch now" : "Lancer maintenant"}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
