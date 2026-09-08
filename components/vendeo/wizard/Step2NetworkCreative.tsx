"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import type { Objective, Placement, Platform, WizardState } from "./types";
import { isAdPlatformAllowed, type PlanId } from "@/lib/plans";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onValidityChange: (valid: boolean) => void;
  plan: PlanId;
}

const OBJECTIVES: { value: Objective; label: string }[] = [
  { value: "sales", label: "Ventes" },
  { value: "traffic", label: "Trafic" },
  { value: "engagement", label: "Engagement" },
  { value: "leads", label: "Leads" },
];

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function Step2NetworkCreative({ state, patch, onValidityChange, plan }: StepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "video" | null>(null);

  useEffect(() => {
    if (state.product && !state.adText) {
      patch({
        adText: state.product.description ? stripHtml(state.product.description).slice(0, 200) : `Découvre ${state.product.name} 🔥`,
        title: state.product.name,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.product]);

  useEffect(() => {
    if (state.product?.url && !state.destinationUrl) {
      patch({ destinationUrl: state.product.url });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.product]);

  const canContinue =
    state.mediaUrl.trim().length > 0 &&
    !uploading &&
    state.adText.trim().length > 0 &&
    state.destinationUrl.trim().length > 0;

  // Prévient le pied de page (rendu par LaunchAdWizard, hors de cette zone
  // qui défile) dès que la validité de l'étape change.
  useEffect(() => {
    onValidityChange(canContinue);
  }, [canContinue, onValidityChange]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setMediaKind(file.type.startsWith("video/") ? "video" : "image");
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    patch({ mediaUrl: "" });

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/campaign-media", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Échec de l'envoi du fichier");

      const url: string | null = typeof data?.secure_url === "string" ? data.secure_url : null;
      if (!url) throw new Error("Le fichier a été envoyé mais aucune URL n'a été renvoyée");

      patch({ mediaUrl: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erreur d'envoi inconnue");
    } finally {
      setUploading(false);
    }
  }

  function clearMedia() {
    setPreviewUrl(null);
    setMediaKind(null);
    setUploadError(null);
    patch({ mediaUrl: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">Réseau</p>
        <div className="flex gap-2">
          {(["meta", "tiktok"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => patch({ platform: p, placement: p === "meta" ? state.placement : "auto" })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                state.platform === p
                  ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {p === "meta" ? "Meta Ads" : "TikTok Ads"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">Objectif</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OBJECTIVES.map((o) => (
            <button
              key={o.value}
              onClick={() => patch({ objective: o.value })}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                state.objective === o.value
                  ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {state.platform === "meta" && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-gray-700">Emplacement</p>
          <div className="flex gap-2">
            {(["auto", "whatsapp_status"] as Placement[]).map((p) => {
              const allowed = p === "auto" || isAdPlatformAllowed(plan, "whatsapp");
              const active = state.placement === p;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={!allowed}
                  onClick={() => allowed && patch({ placement: p })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                    active
                      ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]"
                      : allowed
                        ? "border-gray-200 text-gray-600"
                        : "border-gray-100 text-gray-300"
                  }`}
                >
                  {p === "auto" ? "Automatique" : "Statut WhatsApp"}
                  {p === "whatsapp_status" && !allowed && (
                    <span className="ml-1 text-[10px] font-normal text-gray-400">
                      (non inclus dans ton plan)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {state.placement === "whatsapp_status"
              ? "Diffusée dans l'onglet Actualités de WhatsApp (Statuts), en plus des Stories Instagram — Meta impose ce duo. Le clic ouvre ton lien de destination, pas une conversation WhatsApp."
              : "Meta choisit automatiquement les meilleurs emplacements (Facebook, Instagram)."}
          </p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          Visuel (image ou vidéo)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFileSelected}
          className="hidden"
        />

        {!previewUrl && !state.mediaUrl ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-8 text-sm text-gray-500 transition hover:border-[#6366F1] hover:text-[#6366F1]"
          >
            <ImagePlus className="h-6 w-6" />
            Choisir une image ou vidéo depuis l'appareil
          </button>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {mediaKind === "video" ? (
              <video src={previewUrl ?? undefined} className="h-40 w-full object-cover" muted />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl ?? state.mediaUrl}
                alt="Aperçu du visuel"
                className="h-40 w-full object-cover"
              />
            )}
            <button
              type="button"
              onClick={clearMedia}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
              aria-label="Retirer le visuel"
            >
              <X className="h-4 w-4" />
            </button>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-sm font-medium text-[#3730A3]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Envoi en cours…
              </div>
            )}
          </div>
        )}

        {uploadError ? (
          <p className="mt-1 text-xs text-[#991B1B]">{uploadError}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">
            JPG, PNG ou courte vidéo. L'envoi démarre automatiquement dès la sélection.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Titre</label>
        <input
          value={state.title}
          onChange={(e) => patch({ title: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          Texte de l'annonce
        </label>
        <textarea
          value={state.adText}
          onChange={(e) => patch({ adText: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          Lien de destination
        </label>
        <input
          value={state.destinationUrl}
          onChange={(e) => patch({ destinationUrl: e.target.value })}
          placeholder="https://ta-boutique.chariow.com/produit/…"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
        {state.product?.url && (
          <p className="mt-1 text-xs text-gray-400">Pré-rempli depuis la page du produit choisi.</p>
        )}
      </div>

      {!canContinue && !uploading && (
        <p className="text-right text-xs text-gray-400">
          {!state.mediaUrl.trim()
            ? "Ajoute un visuel pour continuer."
            : !state.destinationUrl.trim()
            ? "Renseigne un lien de destination pour continuer."
            : !state.adText.trim()
            ? "Ajoute un texte d'annonce pour continuer."
            : ""}
        </p>
      )}
    </div>
  );
}
