"use client";

import { BookOpen, Check, Download, Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { OPEN_SUBSCRIPTION_SECTION_EVENT } from "@/lib/subscription/ui";
import "./training-invitation.css";

type Props = {
  experienceLevel?: string | null;
  subscription?: { status?: string; trial_active?: boolean } | null;
};

const GUIDES = [
  ["01", "Comprendre le marché des produits digitaux", "Identifier une vraie demande et utiliser le Radar marché."],
  ["02", "Trouver et analyser une opportunité", "Passer d’une idée intéressante à une offre exploitable."],
  ["03", "Configurer son compte Meta Ads", "Préparer Business Manager, compte publicitaire et connexion à Vendeo."],
  ["04", "Créer un ebook et son contenu", "Structurer, rédiger et exporter un produit digital avec Manus et les outils IA."],
  ["05", "Créer des visuels avec Studio", "Préparer un prompt, choisir un format et contrôler les crédits utilisés."],
  ["06", "Préparer et lancer une campagne", "Choisir l’objectif, le budget, l’audience et vérifier le récapitulatif."],
  ["07", "Analyser et optimiser ses performances", "Lire les indicateurs Vendeo et décider quoi améliorer."],
] as const;

export function TrainingInvitation({ experienceLevel, subscription }: Props) {
  const [downloading, setDownloading] = useState(false);
  if (!experienceLevel || !["beginner", "some_experience"].includes(experienceLevel)) return null;
  const subscribed = subscription?.status === "active" && subscription?.trial_active === false;
  function openSubscription() { window.dispatchEvent(new Event(OPEN_SUBSCRIPTION_SECTION_EVENT)); }
  async function download() {
    setDownloading(true);
    try {
      const response = await fetch("/api/training/download");
      if (!response.ok) { openSubscription(); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "formation-vendeo-guides.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  }
  return <section className="training-invitation app-card" aria-labelledby="training-invitation-title">
    <div className="training-invitation-head"><span className="training-invitation-icon"><BookOpen size={20} /></span><div><span className="eyebrow">{subscribed ? "FORMATION VENDEO" : "APERÇU DE LA FORMATION"}</span><h2 id="training-invitation-title">Apprends à développer ton business digital</h2></div><Sparkles size={19} className="training-sparkle" aria-hidden="true" /></div>
    <p className="training-invitation-lead">Un pack de guides PDF pratiques pour comprendre le marché, créer tes produits, utiliser Vendeo et lancer tes premières campagnes.</p>
    <div className="training-guide-list">{GUIDES.map(([number, title, description]) => <article key={number} className="training-guide-item"><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div>{subscribed ? <Check size={16} aria-label="Disponible" /> : <Lock size={15} aria-label="Réservé aux abonnés" />}</article>)}</div>
    {subscribed ? <button type="button" className="btn btn-dark training-action" onClick={() => void download()} disabled={downloading}><Download size={16} />{downloading ? "Préparation du téléchargement…" : "Télécharger le pack ZIP"}</button> : <><p className="training-locked-note">L’aperçu est visible pendant ton essai. Active ton abonnement pour télécharger les guides complets immédiatement.</p><button type="button" className="btn btn-dark training-action" onClick={openSubscription}>Activer mon abonnement</button></>}
  </section>;
}
