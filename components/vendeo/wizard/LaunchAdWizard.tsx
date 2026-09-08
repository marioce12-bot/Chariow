"use client";

import { useState } from "react";
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
 * Étape 2 : Retour/Continuer sont maintenant rendus ICI, hors de la zone qui
 * défile, pour ne jamais être masqués par le clavier mobile quand on remplit
 * un champ de texte (ex. "Lien de destination"). Les autres étapes gardent
 * pour l'instant leur propre pied de page interne, inchangé.
 */
export function LaunchAdWizard({ storeId, onClose, onLaunched }: LaunchAdWizardProps) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({ ...DEFAULT_WIZARD_STATE, storeId });
  const [step2Valid, setStep2Valid] = useState(false);

  const patch = (partial: Partial<WizardState>) => setState((s) => ({ ...s, ...partial }));
  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Lancer une pub</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            Fermer
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 px-5 py-3">
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
        <p className="px-5 pb-2 text-xs font-medium text-gray-400">
          Étape {step}/5 — {STEP_LABELS[step - 1]}
        </p>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
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
          <div className="flex items-center justify-between border-t border-gray-100 bg-white px-5 py-3">
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
    </div>
  );
}
