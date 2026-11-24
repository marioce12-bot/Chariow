"use client";

import { useEffect, useRef } from "react";

export type StudioCreationMode = "image" | "slideshow" | "video";

type StudioHomeOnboardingProps = {
  open: boolean;
  locale: string;
  onClose: () => void;
  onSelectMode: (mode: StudioCreationMode) => void;
};

export function StudioHomeOnboarding({ open, locale, onClose, onSelectMode }: StudioHomeOnboardingProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isEnglish = locale === "en";

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="studio-home-onboarding-backdrop">
      <section
        ref={dialogRef}
        className="studio-home-onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-home-onboarding-title"
        aria-describedby="studio-home-onboarding-description"
      >
        <header className="studio-home-onboarding-header">
          <div>
            <span className="eyebrow">Studio</span>
            <h2 id="studio-home-onboarding-title">
              {isEnglish ? "What would you like to create?" : "Que veux-tu créer aujourd’hui ?"}
            </h2>
            <p id="studio-home-onboarding-description">
              {isEnglish ? "Choose a format and try the Studio." : "Choisis un format et essaie le Studio."}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="studio-home-onboarding-close"
            onClick={onClose}
            aria-label={isEnglish ? "Close" : "Fermer"}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="studio-mobile-choice-list studio-home-onboarding-list">
          <article className="studio-mobile-choice" data-studio-format="image">
            <div className="studio-mobile-choice-preview" data-example-slot="image" aria-hidden="true">
              <img src="/studio-format-previews/image-poster.jpeg" alt="" loading="lazy" decoding="async" />
            </div>
            <div className="studio-mobile-choice-footer">
              <strong className="studio-mobile-choice-title">Image</strong>
              <p className="studio-mobile-choice-description">{isEnglish ? "Promotional poster" : "Affiche promotionnelle"}</p>
              <button type="button" className="studio-mobile-choice-select" onClick={() => onSelectMode("image")}>
                {isEnglish ? "Select" : "Sélectionner"}
              </button>
            </div>
          </article>

          <article className="studio-mobile-choice" data-studio-format="slideshow">
            <div className="studio-mobile-choice-preview" data-example-slot="slideshow" aria-hidden="true">
              <img src="/studio-format-previews/slideshow-poster.webp" alt="" loading="lazy" decoding="async" />
            </div>
            <div className="studio-mobile-choice-footer">
              <strong className="studio-mobile-choice-title">{isEnglish ? "Slideshow" : "Diaporama"}</strong>
              <p className="studio-mobile-choice-description">
                {isEnglish ? "A sequence of images with voice-over" : "Une suite d’images avec une voix off"}
              </p>
              <button type="button" className="studio-mobile-choice-select" onClick={() => onSelectMode("slideshow")}>
                {isEnglish ? "Select" : "Sélectionner"}
              </button>
            </div>
          </article>

          <article className="studio-mobile-choice" data-studio-format="video">
            <div className="studio-mobile-choice-preview" data-example-slot="video" aria-hidden="true">
              <img src="/studio-format-previews/video-poster.webp" alt="" loading="lazy" decoding="async" />
            </div>
            <div className="studio-mobile-choice-footer">
              <strong className="studio-mobile-choice-title">{isEnglish ? "Video" : "Vidéo"}</strong>
              <p className="studio-mobile-choice-description">{isEnglish ? "A short promotional video" : "Une courte vidéo publicitaire"}</p>
              <button type="button" className="studio-mobile-choice-select" onClick={() => onSelectMode("video")}>
                {isEnglish ? "Select" : "Sélectionner"}
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
