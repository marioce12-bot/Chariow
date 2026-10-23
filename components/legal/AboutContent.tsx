"use client";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import Link from "next/link";



export default function AboutContent() {
  const { locale , t } = useI18n();
  useEffect(() => { document.title = locale === "en" ? 'About — Vendeo' : 'À propos — Vendeo'; }, [locale]);
  return <main className="legal-page"><article className="legal-card"><Link href="/" className="legal-back">{t("sweep1.text0")}</Link><span className="eyebrow">Vendeo</span><h1>{t("settings.about")}</h1><p className="legal-updated">Digital store global</p><p>{t("sweep2.text1")}</p><h2>{t("finalExtra.text52")}</h2><ul><li>{t("sweep3.text2")}</li><li>{t("sweep1.text3")}</li><li>{t("sweep2.text4")}</li><li>{t("sweep3.text5")}</li><li>{t("sweep1.text6")}</li></ul><h2>{t("finalExtra.text53")}</h2><p>{t("sweep2.text7")}</p><h2>{t("finalExtra.text54")}</h2><p>{t("sweep3.text8")}{" "}<a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>.</p><h2>{t("finalExtra.text55")}</h2><ul><li><Link href="/terms">{t("finalExtra.text56")}</Link></li><li><Link href="/privacy">{t("settings.privacy")}</Link></li><li><Link href="/data-deletion">{t("sweep1.text9")}</Link></li></ul></article></main>;
}