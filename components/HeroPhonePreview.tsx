"use client";

import { Step2NetworkCreative } from "@/components/vendeo/wizard/Step2NetworkCreative";
import { DEFAULT_WIZARD_STATE } from "@/components/vendeo/wizard/types";
import { useI18n } from "@/lib/i18n/i18n";

export function HeroPhonePreview() {
  const { locale } = useI18n();
  const en = locale === "en";
  return (
    <aside className="hero-phone-preview" aria-label={en ? "Actual ad setup demonstration" : "Démonstration du parcours publicitaire réel"}>
      <div className="hero-phone-badge">{en ? "Actual ad setup • Demo" : "Écran réel du parcours • Démonstration"}</div>
      <div className="hero-phone-device" aria-hidden="true">
        <div className="hero-phone-notch" />
        <div className="hero-phone-screen" inert>
          <Step2NetworkCreative
            state={DEFAULT_WIZARD_STATE}
            patch={() => {}}
            onFooterChange={() => {}}
            onBackToStep1={() => {}}
            onAdvanceToStep3={() => {}}
            plan="starter"
            previewMode
          />
        </div>
        <div className="hero-phone-home" />
      </div>
    </aside>
  );
}
