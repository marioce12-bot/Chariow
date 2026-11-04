"use client";

import { BookOpen, Check, Download, Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { OPEN_SUBSCRIPTION_SECTION_EVENT } from "@/lib/subscription/ui";
import { useI18n } from "@/lib/i18n/i18n";
import "./training-invitation.css";

type Props = {
  experienceLevel?: string | null;
  subscription?: { status?: string; trial_active?: boolean } | null;
};

const GUIDES = [
  { number: "01", fr: "Comprendre le marché des produits digitaux", en: "Understand the digital-product market", frDescription: "Identifier une vraie demande et utiliser le Radar marché.", enDescription: "Identify real demand and use Market Radar." },
  { number: "02", fr: "Trouver et analyser une opportunité", en: "Find and assess an opportunity", frDescription: "Passer d’une idée intéressante à une offre exploitable.", enDescription: "Turn a promising idea into a viable offer." },
  { number: "03", fr: "Configurer son compte Meta Ads", en: "Set up a Meta Ads account", frDescription: "Préparer Business Manager, compte publicitaire et connexion à Vendeo.", enDescription: "Prepare Business Manager, an ad account, and its Vendeo connection." },
  { number: "04", fr: "Créer un ebook et son contenu", en: "Create an ebook and its content", frDescription: "Structurer, rédiger et exporter un produit digital avec Manus et les outils IA.", enDescription: "Plan, write, and export a digital product with Manus and AI tools." },
  { number: "05", fr: "Créer des visuels avec Studio", en: "Create visuals with Studio", frDescription: "Préparer un prompt, choisir un format et contrôler les crédits utilisés.", enDescription: "Prepare a prompt, choose a format, and track the credits used." },
  { number: "06", fr: "Préparer et lancer une campagne", en: "Prepare and launch a campaign", frDescription: "Choisir l’objectif, le budget, l’audience et vérifier le récapitulatif.", enDescription: "Choose the objective, budget, and audience, then review the summary." },
  { number: "07", fr: "Analyser et optimiser ses performances", en: "Analyze and optimize performance", frDescription: "Lire les indicateurs Vendeo et décider quoi améliorer.", enDescription: "Read Vendeo metrics and decide what to improve." },
] as const;

export function TrainingInvitation({ experienceLevel, subscription }: Props) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  if (!experienceLevel || !["beginner", "some_experience"].includes(experienceLevel)) return null;

  // The complete pack is a paid benefit: an unexpired free trial is not enough.
  const subscribed = subscription?.status === "active" && subscription?.trial_active === false;
  function openSubscription() { window.dispatchEvent(new Event(OPEN_SUBSCRIPTION_SECTION_EVENT)); }

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch("/api/training/download", { cache: "no-store" });
      if (response.status === 402) { openSubscription(); return; }
      if (!response.ok) throw new Error(en ? "The training pack is temporarily unavailable. Try again shortly." : "Le pack de formation est temporairement indisponible. Réessaie dans un instant.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "formation-vendeo-guides.zip";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(en ? "The training pack could not be downloaded. Try again." : "Le pack de formation n’a pas pu être téléchargé. Réessaie.");
    } finally {
      setDownloading(false);
    }
  }

  const copy = en ? {
    eyebrow: subscribed ? "VENDEO TRAINING" : "TRAINING PACK PREVIEW",
    title: "Learn how to grow your digital business",
    lead: "A practical set of PDF guides about the market, product creation, Vendeo, and launching your first campaigns.",
    locked: "This preview is available in Notifications. Activate the Vendeo subscription to download the complete pack.",
    activate: "Activate my subscription",
    download: downloading ? "Preparing download…" : "Download the complete ZIP",
    available: "Available",
    lockedLabel: "Included with an active paid subscription",
  } : {
    eyebrow: subscribed ? "FORMATION VENDEO" : "APERÇU DU PACK DE FORMATION",
    title: "Apprends à développer ton business digital",
    lead: "Un ensemble de guides PDF pratiques sur le marché, la création de produits, Vendeo et le lancement de tes premières campagnes.",
    locked: "Cet aperçu est disponible dans Notifications. Active l’abonnement Vendeo pour télécharger le pack complet.",
    activate: "Activer mon abonnement",
    download: downloading ? "Préparation du téléchargement…" : "Télécharger le pack ZIP complet",
    available: "Disponible",
    lockedLabel: "Inclus avec un abonnement payant actif",
  };

  return <section className="training-invitation app-card" aria-labelledby="training-invitation-title">
    <div className="training-invitation-head">
      <span className="training-invitation-icon"><BookOpen size={20} /></span>
      <div><span className="eyebrow">{copy.eyebrow}</span><h2 id="training-invitation-title">{copy.title}</h2></div>
      <Sparkles size={19} className="training-sparkle" aria-hidden="true" />
    </div>
    <p className="training-invitation-lead">{copy.lead}</p>
    <div className="training-guide-list">{GUIDES.map((guide) => <article key={guide.number} className="training-guide-item">
      <span>{guide.number}</span>
      <div><strong>{en ? guide.en : guide.fr}</strong><p>{en ? guide.enDescription : guide.frDescription}</p></div>
      {subscribed ? <Check size={16} aria-label={copy.available} /> : <Lock size={15} aria-label={copy.lockedLabel} />}
    </article>)}</div>
    {downloadError ? <p className="training-locked-note" role="alert">{downloadError}</p> : null}
    {subscribed ? <button type="button" className="btn btn-dark training-action" onClick={() => void download()} disabled={downloading}>
      <Download size={16} />{copy.download}
    </button> : <>
      <p className="training-locked-note">{copy.locked}</p>
      <button type="button" className="btn btn-dark training-action" onClick={openSubscription}>{copy.activate}</button>
    </>}
  </section>;
}
