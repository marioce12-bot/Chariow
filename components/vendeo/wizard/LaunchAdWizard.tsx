"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { DEFAULT_WIZARD_STATE, type WizardState } from "./types";
import { Step1Product } from "./Step1Product";
import { Step2NetworkCreative } from "./Step2NetworkCreative";
import { Step3Audience } from "./Step3Audience";
import { Step4Estimation } from "./Step4Estimation";
import { Step5Payment } from "./Step5Payment";

const STEP_LABELS = ["Produit", "Réseau & créative", "Audience", "Estimation", "Paiement"];

interface LaunchAdWizardProps {
  storeId: string;
  onClose: () => void;
  onLaunched?: (campaignId: string) => void;
}

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
 * champ (ex. "Lien de destination"). Les autres étapes gardent leur propre
 * pied de page interne (sticky bottom-0 dans leur zone de scroll).
 */
export function LaunchAdWizard({ storeId, onClose, onLaunched }: LaunchAdWizardProps) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({ ...DEFAULT_WIZARD_STATE, storeId });
  const [step2Valid, setStep2Valid] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const patch = (partial: Partial<WizardState>) => setState((s) => ({ ...s, ...partial }));
  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/40 sm:items-center sm:justify-center">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Lancer une pub</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            Fermer
          </button>
        </div>

        {/* Progress */}
        <div className="flex shrink-0 items-center gap-1 px-5 py-3">
          {STEP_LABELS.map((label, i) => {
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
          Étape {step}/5 — {STEP_LABELS[step - 1]}
        </p>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {step === 1 && <Step1Product state={state} patch={patch} onNext={next} />}
          {step === 2 && <Step2NetworkCreative state={state} patch={patch} onValidityChange={setStep2Valid} />}
          {step === 3 && <Step3Audience state={state} patch={patch} onNext={next} onBack={back} />}
          {step === 4 && <Step4Estimation state={state} patch={patch} onNext={next} onBack={back} />}
          {step === 5 && (
            <Step5Payment
              state={state}
              onBack={back}
              onLaunched={(campaignId) => {
                onLaunched?.(campaignId);
                onClose();
              }}
            />
          )}
        </div>

        {/* Pied de page de l'étape 2 : hors de la zone qui défile, donc jamais
            masqué par le clavier mobile pendant la saisie d'un champ. */}
        {step === 2 && (
          <div className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button onClick={back} className="text-sm font-medium text-gray-500">
              Retour
            </button>
            <button
              disabled={!step2Valid}
              onClick={next}
              className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continuer
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
