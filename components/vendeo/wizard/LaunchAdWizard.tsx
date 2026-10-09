"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { DEFAULT_WIZARD_STATE, type WizardState } from "./types";
import type { PlanId } from "@/lib/plans";
import { Step1Product } from "./Step1Product";
import { Step2NetworkCreative, type Step2FooterState } from "./Step2NetworkCreative";
import { Step3Audience } from "./Step3Audience";
import { Step4Budget } from "./Step4Budget";
import { useI18n } from "@/lib/i18n/i18n";

interface LaunchAdWizardProps {
  storeId: string;
  plan: PlanId;
  onClose: () => void;
  onLaunched?: (campaignId: string) => void;
}

type MetaPreview = { id: string; label: string; html: string };

/**
 * Wizard de lancement de pub en 5 étapes (Bloc 3 de la refonte dashboard).
 * Ouvre en modale plein écran sur mobile, panneau centré sur desktop.
 *
 * Rendu via un portail React directement dans document.body : si le wizard
 * est appelé depuis un composant imbriqué dans un conteneur avec overflow
 * (ex. le scroll du dashboard) ou une transformation CSS, un simple
 * `position: fixed` se positionnerait par rapport à ce conteneur au lieu de
 * l'écran entier — c'est ce qui causait les boutons "Retour/Continuer"
 * invisibles sous la barre de navigation de l'app sur mobile. Le portail
 * évite complètement ce piège.
 *
 * Étape 2 : Retour/Continuer sont rendus ici, hors de la zone qui défile,
 * pour ne jamais être masqués par le clavier mobile pendant la saisie d'un
 * champ (ex. "Lien de destination"). L'Étape 2 est elle-même découpée en deux
 * écrans internes ("Ensemble de publicités" / "Publicité", façon Meta Ads
 * Manager) qui pilotent ce pied de page via onFooterChange — voir
 * Step2NetworkCreative.tsx pour le détail. Les autres étapes gardent leur
 * propre pied de page interne (sticky bottom-0 dans leur zone de scroll).
 */
export function LaunchAdWizard({ storeId, plan, onClose, onLaunched }: LaunchAdWizardProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const stepLabels = en ? ["Product", "Ad set & creative", "Audience", "Budget", "Creation"] : ["Produit", "Ensemble & publicité", "Audience", "Budget", "Création"];
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({ ...DEFAULT_WIZARD_STATE, storeId });
  const [step2Footer, setStep2Footer] = useState<Step2FooterState | null>(null);
  const [mounted, setMounted] = useState(false);
  const [metaPreviews, setMetaPreviews] = useState<MetaPreview[]>([]);
  const [activeMetaPreview, setActiveMetaPreview] = useState(0);
  const [metaPreviewLoading, setMetaPreviewLoading] = useState(false);
  const [metaPreviewError, setMetaPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (step !== 5 || state.platform !== "meta" || !state.metaAdAccountId || !state.metaPageId || !state.mediaUrl) return;
    let cancelled = false;
    setMetaPreviewLoading(true);
    setMetaPreviewError(null);
    setMetaPreviews([]);
    setActiveMetaPreview(0);
    fetch("/api/ad-campaigns/previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta_ad_account_id: state.metaAdAccountId,
        meta_page_id: state.metaPageId,
        placement: state.placement,
        link: state.destinationUrl,
        image_url: state.mediaUrl,
        message: state.adText,
        headline: state.title || state.product?.name || "",
      }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "Aperçus Meta indisponibles");
        if (!cancelled) setMetaPreviews(Array.isArray(data.previews) ? data.previews : []);
      })
      .catch((error) => {
        if (!cancelled) setMetaPreviewError(error instanceof Error ? error.message : "Aperçus Meta indisponibles");
      })
      .finally(() => {
        if (!cancelled) setMetaPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, state.platform, state.metaAdAccountId, state.metaPageId, state.placement, state.destinationUrl, state.mediaUrl, state.adText, state.title, state.product?.name]);

  const patch = (partial: Partial<WizardState>) => setState((s) => ({ ...s, ...partial }));
  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/40 sm:items-center sm:justify-center">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">{en ? "Launch an ad" : "Lancer une pub"}</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            {en ? "Close" : "Fermer"}
          </button>
        </div>

        {/* Progress */}
        <div className="flex shrink-0 items-center gap-1 px-5 py-3">
          {stepLabels.map((label, i) => {
            const idx = i + 1;
            const done = idx < step;
            const active = idx === step;
            return (
              <div key={label} className="flex flex-1 items-center gap-1">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    done
                      ? "bg-[#10B981] text-white"
                      : active
                        ? "bg-[#6366F1] text-white"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : idx}
                </div>
                {idx < 5 && (
                  <div className={`h-0.5 flex-1 ${idx < step ? "bg-[#10B981]" : "bg-gray-100"}`} />
                )}
              </div>
            );
          })}
        </div>
        <p className="shrink-0 px-5 pb-2 text-xs font-medium text-gray-400">
          {en ? "Step" : "Étape"} {step}/5 — {stepLabels[step - 1]}
        </p>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {step === 1 && <Step1Product state={state} patch={patch} onNext={next} />}
          {step === 2 && (
            <Step2NetworkCreative
              state={state}
              patch={patch}
              onFooterChange={setStep2Footer}
              onBackToStep1={back}
              onAdvanceToStep3={next}
              plan={plan}
            />
          )}
          {step === 3 && <Step3Audience state={state} patch={patch} onNext={next} onBack={back} />}
          {step === 4 && <Step4Budget state={state} patch={patch} onNext={next} onBack={back} />}
          {step === 5 && state.campaignId && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#ECFDF5] p-4 text-sm text-[#065F46]"><strong className="block">{en ? "Campaign preview" : "Aperçu de la campagne"}</strong><span>{en ? "Review the content below before opening it in Ads. Nothing is launched yet." : "Vérifie le contenu ci-dessous avant de l'ouvrir dans Pub. Rien n'est encore lancé."}</span></div>
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                {state.mediaUrl ? <img src={state.mediaUrl} alt={state.product?.name ?? "Campaign creative"} className="max-h-64 w-full object-cover" /> : <div className="flex h-32 items-center justify-center bg-gray-50 text-sm text-gray-400">{en ? "No image" : "Aucune image"}</div>}
                <div className="space-y-2 p-4">
                  <h3 className="font-bold text-gray-900">{state.title || state.product?.name || (en ? "Untitled campaign" : "Campagne sans titre")}</h3>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{state.adText || (en ? "No ad description" : "Aucune description")}</p>
                </div>
              </div>
              {state.platform === "meta" && state.metaPageId && (
                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <h3 className="mb-3 text-sm font-bold text-gray-900">{en ? "Meta placement previews" : "Aperçus selon le placement Meta"}</h3>
                  {metaPreviewLoading && <p className="text-sm text-gray-500">{en ? "Loading previews from Meta…" : "Chargement des aperçus depuis Meta…"}</p>}
                  {metaPreviewError && <p className="text-sm text-[#991B1B]">{metaPreviewError}</p>}
                  {metaPreviews.length > 0 && (
                    <>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {metaPreviews.map((preview, index) => (
                          <button key={preview.id} type="button" onClick={() => setActiveMetaPreview(index)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${index === activeMetaPreview ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]" : "border-gray-200 text-gray-600"}`}>
                            {preview.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex min-h-[220px] justify-center overflow-hidden rounded-xl bg-gray-50 p-2" dangerouslySetInnerHTML={{ __html: metaPreviews[activeMetaPreview]?.html ?? "" }} />
                      <p className="mt-2 text-[11px] text-gray-400">{en ? "Preview generated by Meta for the selected placement." : "Aperçu généré par Meta pour le placement sélectionné."}</p>
                    </>
                  )}
                </div>
              )}
              <p className="text-sm text-gray-500">{en ? "Payment will only be requested when you click “Launch campaign” from the Ads page." : "Le paiement sera demandé uniquement lorsque tu cliqueras sur « Lancer la campagne » depuis la page Pub."}</p>
              <button type="button" onClick={() => { onLaunched?.(state.campaignId!); onClose(); }} className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white">{en ? "View my campaign in Ads" : "Voir ma campagne dans Pub"}</button>
            </div>
          )}
        </div>

        {/* Pied de page de l'étape 2 : hors de la zone qui défile, donc jamais
            masqué par le clavier mobile pendant la saisie d'un champ. Piloté par
            Step2NetworkCreative via onFooterChange (deux écrans internes + les
            sous-écrans d'édition par champ ont chacun leur propre libellé/action). */}
        {step === 2 && step2Footer && (
          <div className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button onClick={step2Footer.onBack} className="text-sm font-medium text-gray-500">
              {step2Footer.backLabel}
            </button>
            {step2Footer.nextLabel && step2Footer.onNext && (
              <button
                disabled={step2Footer.nextDisabled}
                onClick={step2Footer.onNext}
                className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {step2Footer.nextLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
