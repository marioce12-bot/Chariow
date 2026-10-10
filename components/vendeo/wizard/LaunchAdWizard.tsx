"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { DEFAULT_WIZARD_STATE, wizardStateFromCampaign, type EditableCampaign, type WizardState } from "./types";
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
  /** Mode modification : campagne existante dont les valeurs pré-remplissent les 5 étapes. */
  editCampaign?: EditableCampaign;
  /** Message affiché en haut en mode modification (ex. motif du dernier refus). */
  editNotice?: string | null;
  /** Mode modification : appelé à la fin de l'étape 5 pour revenir au lancement. */
  onEdited?: (campaignId: string) => void;
}

type MetaPreview = { id: string; label: string; html: string };
// Doit rester aligné sur PREVIEW_FORMATS de app/api/ad-campaigns/previews/route.ts
// (valeurs ad_format acceptées par Meta pour /generatepreviews).
const META_PREVIEW_FORMATS = [
  { id: "MOBILE_FEED_STANDARD", label: "Facebook Feed" },
  { id: "INSTAGRAM_STANDARD", label: "Instagram Feed" },
  { id: "INSTAGRAM_STORY", label: "Instagram Story" },
  { id: "INSTAGRAM_REELS", label: "Instagram Reel" },
  { id: "FACEBOOK_STORY_MOBILE", label: "Facebook Story" },
  { id: "FACEBOOK_REELS_MOBILE", label: "Facebook Reel" },
  { id: "WHATSAPP_STATUS_MEDIA", label: "Statut WhatsApp" },
] as const;

// Les liens d'aperçu Meta expirent : on ne réutilise un aperçu que pendant ce délai.
const META_PREVIEW_CACHE_MS = 10 * 60 * 1000;

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
export function LaunchAdWizard({ storeId, plan, onClose, onLaunched, editCampaign, editNotice, onEdited }: LaunchAdWizardProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const stepLabels = en ? ["Product", "Ad set & creative", "Audience", "Budget", "Creation"] : ["Produit", "Ensemble & publicité", "Audience", "Budget", "Création"];
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(() => (editCampaign ? wizardStateFromCampaign(editCampaign, storeId) : { ...DEFAULT_WIZARD_STATE, storeId }));
  const [step2Footer, setStep2Footer] = useState<Step2FooterState | null>(null);
  const [mounted, setMounted] = useState(false);
  // Aperçus Meta : état indexé par format pour que chaque onglet ait son propre
  // chargement / erreur, et que tous les formats puissent se charger en parallèle.
  const [metaPreviews, setMetaPreviews] = useState<Record<string, MetaPreview>>({});
  const [activeMetaPreview, setActiveMetaPreview] = useState("MOBILE_FEED_STANDARD");
  const [metaPreviewLoading, setMetaPreviewLoading] = useState<Record<string, boolean>>({});
  const [metaPreviewErrors, setMetaPreviewErrors] = useState<Record<string, string>>({});
  // Hash de l'image côté Meta (même compte + même visuel) : obtenu dès l'étape 2 (ou au premier
  // aperçu) puis renvoyé aux suivants pour ne pas renvoyer l'image à Meta pour chaque placement.
  const metaImageHashRef = useRef<{ key: string; hash: string } | null>(null);
  // Envoi de l'image en cours (démarré à l'étape 2) : l'étape 5 l'attend au lieu de le refaire.
  const metaImageHashPendingRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  // Aperçus déjà générés (même contenu + même placement) : revenir à l'étape 5 est instantané.
  const metaPreviewCacheRef = useRef<Map<string, { preview: MetaPreview; at: number }>>(new Map());

  useEffect(() => {
    setMounted(true);
  }, []);

  const metaFormats = (state.placement === "whatsapp_status"
    ? META_PREVIEW_FORMATS.filter((format) => format.id === "INSTAGRAM_STORY" || format.id === "WHATSAPP_STATUS_MEDIA")
    : META_PREVIEW_FORMATS).map((format) => ({
      ...format,
      label: format.id === "WHATSAPP_STATUS_MEDIA" ? (en ? "WhatsApp Status" : "Statut WhatsApp") : format.label,
    }));

  const fetchMetaPreview = (formatId: string, isCancelled: () => boolean = () => false) => {
    const contentKey = JSON.stringify([state.metaAdAccountId, state.metaPageId, state.placement, state.destinationUrl, state.mediaUrl, state.adText, state.title, state.product?.name ?? ""]);
    const cacheKey = `${contentKey}|${formatId}`;
    const cached = metaPreviewCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.at < META_PREVIEW_CACHE_MS) {
      if (!isCancelled()) setMetaPreviews((current) => ({ ...current, [formatId]: cached.preview }));
      return Promise.resolve();
    }
    const hashKey = `${state.metaAdAccountId}|${state.mediaUrl}`;
    const knownHash = metaImageHashRef.current?.key === hashKey ? metaImageHashRef.current.hash : undefined;
    setMetaPreviewLoading((current) => ({ ...current, [formatId]: true }));
    setMetaPreviewErrors((current) => {
      const next = { ...current };
      delete next[formatId];
      return next;
    });
    return fetch("/api/ad-campaigns/previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta_ad_account_id: state.metaAdAccountId,
        meta_page_id: state.metaPageId,
        placement: state.placement,
        format: formatId,
        link: state.destinationUrl,
        image_url: state.mediaUrl,
        image_hash: knownHash,
        message: state.adText,
        headline: state.title || state.product?.name || "",
      }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.preview) throw new Error(data?.error || "Aperçu Meta indisponible");
        if (typeof data.image_hash === "string" && data.image_hash) metaImageHashRef.current = { key: hashKey, hash: data.image_hash };
        metaPreviewCacheRef.current.set(cacheKey, { preview: data.preview as MetaPreview, at: Date.now() });
        if (!isCancelled()) setMetaPreviews((current) => ({ ...current, [formatId]: data.preview as MetaPreview }));
      })
      .catch((error) => {
        if (!isCancelled()) {
          const message = error instanceof Error ? error.message : "Aperçu Meta indisponible";
          setMetaPreviewErrors((current) => ({ ...current, [formatId]: message }));
        }
      })
      .finally(() => {
        if (!isCancelled()) setMetaPreviewLoading((current) => ({ ...current, [formatId]: false }));
      });
  };

  // Dès que le visuel et le compte Meta sont connus (étape 2), on envoie l'image à Meta en
  // arrière-plan : à l'étape 5, le hash est déjà prêt et les aperçus partent sans attendre.
  // Doit rester déclaré avant l'effet des aperçus ci-dessous (ordre d'exécution des effets).
  useEffect(() => {
    if (step < 2 || state.platform !== "meta" || !state.metaAdAccountId || !state.mediaUrl) return;
    const hashKey = `${state.metaAdAccountId}|${state.mediaUrl}`;
    if (metaImageHashRef.current?.key === hashKey || metaImageHashPendingRef.current?.key === hashKey) return;
    const promise = fetch("/api/ad-campaigns/previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta_ad_account_id: state.metaAdAccountId, image_url: state.mediaUrl, prepare_only: true }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.ok && typeof data.image_hash === "string" && data.image_hash) {
          metaImageHashRef.current = { key: hashKey, hash: data.image_hash };
        }
      })
      .catch(() => {
        // best-effort : sans hash, le premier aperçu enverra l'image lui-même
      })
      .finally(() => {
        if (metaImageHashPendingRef.current?.key === hashKey) metaImageHashPendingRef.current = null;
      });
    metaImageHashPendingRef.current = { key: hashKey, promise };
  }, [step, state.platform, state.metaAdAccountId, state.mediaUrl]);

  useEffect(() => {
    if (step !== 5 || state.platform !== "meta" || !state.metaAdAccountId || !state.metaPageId || !state.mediaUrl) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    const firstFormat = state.placement === "whatsapp_status" ? "INSTAGRAM_STORY" : "MOBILE_FEED_STANDARD";
    const ids = [firstFormat, ...metaFormats.map((format) => format.id).filter((id) => id !== firstFormat)];
    setMetaPreviews({});
    setMetaPreviewErrors({});
    setActiveMetaPreview(firstFormat);
    // Si l'image est encore en cours d'envoi (démarré à l'étape 2), on l'attend plutôt que de la renvoyer.
    // Sinon le premier format part seul : il envoie l'image à Meta et récupère son hash. Les autres
    // partent ensuite en parallèle avec ce hash, donc changer d'onglet ensuite n'attend plus Meta.
    void (async () => {
      const pending = metaImageHashPendingRef.current;
      if (pending && pending.key === `${state.metaAdAccountId}|${state.mediaUrl}`) await pending.promise;
      if (cancelled) return;
      await fetchMetaPreview(ids[0], isCancelled);
      if (cancelled) return;
      ids.slice(1).forEach((id) => {
        void fetchMetaPreview(id, isCancelled);
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state.platform, state.metaAdAccountId, state.metaPageId, state.placement, state.destinationUrl, state.mediaUrl, state.adText, state.title, state.product?.name]);

  const selectMetaPreview = (formatId: string) => {
    setActiveMetaPreview(formatId);
    // Relance uniquement si rien n'est chargé ni en cours pour cet onglet
    // (ex. après une erreur) ; sinon on affiche simplement l'onglet.
    if (!metaPreviews[formatId] && !metaPreviewLoading[formatId]) void fetchMetaPreview(formatId);
  };

  const patch = (partial: Partial<WizardState>) => setState((s) => ({ ...s, ...partial }));
  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/40 sm:items-center sm:justify-center">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">{editCampaign ? (en ? "Edit the campaign" : "Modifier la campagne") : (en ? "Launch an ad" : "Lancer une pub")}</h2>
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
          {editCampaign && editNotice ? (
            <div className="mb-4 rounded-xl bg-[#FFFBEB] p-3 text-sm text-[#92400E]">
              <strong className="block">{en ? "To fix" : "À corriger"}</strong>
              <span>{editNotice}</span>
            </div>
          ) : null}
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
              {state.platform !== "meta" && <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                {state.mediaUrl ? <img src={state.mediaUrl} alt={state.product?.name ?? "Campaign creative"} className="max-h-64 w-full object-cover" /> : <div className="flex h-32 items-center justify-center bg-gray-50 text-sm text-gray-400">{en ? "No image" : "Aucune image"}</div>}
                <div className="space-y-2 p-4">
                  <h3 className="font-bold text-gray-900">{state.title || state.product?.name || (en ? "Untitled campaign" : "Campagne sans titre")}</h3>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{state.adText || (en ? "No ad description" : "Aucune description")}</p>
                </div>
              </div>}
              {state.platform === "meta" && state.metaPageId && (
                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <h3 className="mb-3 text-sm font-bold text-gray-900">{en ? "Meta placement previews" : "Aperçus selon le placement Meta"}</h3>
                  {(() => {
                    const activePreview = metaPreviews[activeMetaPreview];
                    const activeLoading = Boolean(metaPreviewLoading[activeMetaPreview]);
                    const activeError = metaPreviewErrors[activeMetaPreview];
                    return (
                    <>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {metaFormats.map((format) => (
                          <button key={format.id} type="button" onClick={() => selectMetaPreview(format.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${format.id === activeMetaPreview ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]" : "border-gray-200 text-gray-600"}`}>
                            {format.label}
                          </button>
                        ))}
                      </div>
                      {activeLoading && !activePreview && (
                        <div className="mt-2 flex min-h-[220px] items-center justify-center rounded-xl bg-gray-50 p-2">
                          <p className="animate-pulse text-sm text-gray-500">{en ? "Loading the preview from Meta…" : "Chargement de l’aperçu depuis Meta…"}</p>
                        </div>
                      )}
                      {activeError && !activePreview && !activeLoading && (
                        <div className="mt-2 space-y-2 rounded-xl bg-[#FEF2F2] p-3">
                          <p className="text-sm text-[#991B1B]">{activeError}</p>
                          <button type="button" onClick={() => void fetchMetaPreview(activeMetaPreview)} className="rounded-lg border border-[#FCA5A5] px-3 py-1.5 text-xs font-semibold text-[#991B1B]">
                            {en ? "Retry" : "Réessayer"}
                          </button>
                        </div>
                      )}
                      {activePreview && <div className="mt-2 flex min-h-[220px] justify-center overflow-hidden rounded-xl bg-gray-50 p-2" dangerouslySetInnerHTML={{ __html: activePreview.html }} />}
                      <p className="mt-2 text-[11px] text-gray-400">{en ? "Preview generated by Meta for the selected placement." : "Aperçu généré par Meta pour le placement sélectionné."}</p>
                    </>
                    );
                  })()}
                </div>
              )}
              <p className="text-sm text-gray-500">{en ? "Payment will only be requested when you click “Launch campaign” from the Ads page." : "Le paiement sera demandé uniquement lorsque tu cliqueras sur « Lancer la campagne » depuis la page Pub."}</p>
              <button type="button" onClick={() => { if (editCampaign && onEdited) { onEdited(state.campaignId!); return; } onLaunched?.(state.campaignId!); onClose(); }} className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white">{editCampaign ? (en ? "Save and go back to launch" : "Enregistrer et revenir au lancement") : (en ? "View my campaign in Ads" : "Voir ma campagne dans Pub")}</button>
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
