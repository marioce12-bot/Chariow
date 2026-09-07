"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import type { Objective, Platform, WizardState } from "./types";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

const OBJECTIVES: { value: Objective; label: string }[] = [
  { value: "sales", label: "Ventes" },
  { value: "traffic", label: "Trafic" },
  { value: "engagement", label: "Engagement" },
  { value: "leads", label: "Leads" },
];

/**
 * Étape 2/5 — Réseau (Meta/TikTok), objectif, visuel et texte de l'annonce.
 *
 * NB : la sélection du compte Meta Ads (metaAdAccountId/metaPageId) ou du
 * compte TikTok Ads (tiktokAdAccountId/tiktokIdentityId) n'est pas gérée ici :
 * branche-la sur tes sélecteurs existants (ceux utilisés dans le flux actuel
 * de connexion Meta/TikTok) et passe les valeurs via `patch(...)`.
 *
 * NB2 : l'upload du visuel suppose que POST /api/uploads accepte un
 * FormData avec un champ "file" et renvoie du JSON contenant l'URL publique
 * sous l'une des clés url / publicUrl / file_url / path / data.url. Si ta
 * route a un contrat différent, ajuste handleFileSelected en conséquence.
 */
export function Step2NetworkCreative({ state, patch, onNext, onBack }: StepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "video" | null>(null);

  // Pré-remplit le texte/titre à partir du produit choisi à l'étape 1.
  useEffect(() => {
    if (state.product && !state.adText) {
      patch({
        adText: state.product.description?.slice(0, 200) ?? `Découvre ${state.product.name} 🔥`,
        title: state.product.name,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.product]);

  // Pré-remplit le lien de destination avec la page produit Chariow si
  // disponible — sans ça, le bouton "Continuer" restait bloqué tant que
  // personne ne collait un lien à la main.
  useEffect(() => {
    if (state.product?.url && !state.destinationUrl) {
      patch({ destinationUrl: state.product.url });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.product]);

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
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Échec de l'envoi du fichier");

      const url: string | null =
        data?.url ?? data?.publicUrl ?? data?.file_url ?? data?.data?.url ?? data?.path ?? null;
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

  const canContinue =
    state.mediaUrl.trim().length > 0 &&
    !uploading &&
    state.adText.trim().length > 0 &&
    state.destinationUrl.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">Réseau</p>
        <div className="flex gap-2">
          {(["meta", "tiktok"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => patch({ platform: p })}
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
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
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
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
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
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        {state.product?.url && (
          <p className="mt-1 text-xs text-gray-400">Pré-rempli depuis la page du produit choisi.</p>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="text-sm font-medium text-gray-500">
          Retour
        </button>
        <button
          disabled={!canContinue}
          onClick={onNext}
          className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continuer
        </button>
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
