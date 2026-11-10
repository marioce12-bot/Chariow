"use client";

import { useI18n } from "@/lib/i18n/i18n";
import Link from "next/link";
import { LegalDocumentShell } from "./LegalDocumentShell";

export default function AboutContent() {
  const { locale, t } = useI18n();

  return (
    <LegalDocumentShell
      locale={locale}
      path="/about"
      title={t("settings.about")}
      intro={t("sweep2.text1")}
      variant="about"
      eyebrow="Vendeo"
      subtitle="Digital store global"
      homeLabel={t("sweep1.text0")}
    >
      <section aria-labelledby="about-features-title">
        <h2 id="about-features-title">{t("finalExtra.text52")}</h2>
        <ul className="legal-about-features">
          <li>{t("sweep3.text2")}</li>
          <li>{t("sweep1.text3")}</li>
          <li>{t("sweep2.text4")}</li>
          <li>{t("sweep3.text5")}</li>
          <li>{t("sweep1.text6")}</li>
        </ul>
      </section>
      <section aria-labelledby="about-positioning-title">
        <h2 id="about-positioning-title">{t("finalExtra.text53")}</h2>
        <p>{t("sweep2.text7")}</p>
      </section>
      <section aria-labelledby="about-contact-title">
        <h2 id="about-contact-title">{t("finalExtra.text54")}</h2>
        <p>{t("sweep3.text8")}{" "}<a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>.</p>
      </section>
      <section aria-labelledby="about-legal-title">
        <h2 id="about-legal-title">{t("finalExtra.text55")}</h2>
        <ul className="legal-about-links">
          <li><Link href="/terms">{t("finalExtra.text56")}</Link></li>
          <li><Link href="/privacy">{t("settings.privacy")}</Link></li>
          <li><Link href="/data-deletion">{t("sweep1.text9")}</Link></li>
        </ul>
      </section>
    </LegalDocumentShell>
  );
}
