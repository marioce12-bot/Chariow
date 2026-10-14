"use client";

import { useEffect } from "react";

export type StudioCharacterChoice = "with" | "without";

type Props = {
  open: boolean;
  locale?: "fr" | "en";
  onChoose: (choice: StudioCharacterChoice) => void;
  onClose: () => void;
};

const TEXTS = {
  fr: {
    title: "Avec ou sans personnage ?",
    subtitle: "Choisis le style de ton affiche, puis la génération démarre.",
    withLabel: "Avec personnage",
    withHint: "Une personne met ton produit en valeur",
    withoutLabel: "Sans personnage",
    withoutHint: "Le produit est la star de l'image",
    cancel: "Annuler",
  },
  en: {
    title: "With or without a character?",
    subtitle: "Pick the style of your poster, then generation starts.",
    withLabel: "With a character",
    withHint: "A person showcases your product",
    withoutLabel: "Without a character",
    withoutHint: "The product is the star of the image",
    cancel: "Cancel",
  },
} as const;

export function CharacterChoiceDialog({ open, locale = "fr", onChoose, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const t = TEXTS[locale];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-choice-title"
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1530] p-5 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="character-choice-title" className="text-lg font-semibold">{t.title}</h2>
        <p className="mt-1 text-sm text-white/60">{t.subtitle}</p>
        <div className="mt-4 grid gap-3">
          <button
            type="button"
            onClick={() => onChoose("with")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
          >
            <span className="block font-medium">{t.withLabel}</span>
            <span className="block text-xs text-white/60">{t.withHint}</span>
          </button>
          <button
            type="button"
            onClick={() => onChoose("without")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
          >
            <span className="block font-medium">{t.withoutLabel}</span>
            <span className="block text-xs text-white/60">{t.withoutHint}</span>
          </button>
        </div>
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-2xl px-4 py-2 text-sm text-white/60 transition hover:text-white">
          {t.cancel}
        </button>
      </div>
    </div>
  );
}
