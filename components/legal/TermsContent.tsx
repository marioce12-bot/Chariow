"use client";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import Link from "next/link";



export default function TermsContent() {
  const { locale , t } = useI18n();
  useEffect(() => { document.title = locale === "en" ? 'Terms of Use — Vendeo' : "Conditions d'utilisation — Vendeo"; }, [locale]);
  return <main className="legal-page"><article className="legal-card"><Link href="/register" className="legal-back">{t("sweep1.text27")}</Link><span className="eyebrow">Vendeo</span><h1>{t("finalExtra.text56")}</h1><p className="legal-updated">{t("sweep1.text12")}</p><p>{t("sweep3.text59")}</p><h2>{t("sweep1.text60")}</h2><p>{t("sweep2.text61")}</p><p>{t("sweep3.text62")}</p><h2>{t("sweep1.text63")}</h2><p>{t("sweep2.text64")}</p><h2>{t("finalExtra.text63")}</h2><ul><li>{t("sweep3.text65")}</li><li>{t("sweep1.text66")}</li><li>{t("sweep2.text67")}</li><li>{t("sweep3.text68")}</li><li>{t("sweep1.text69")}</li></ul><h2>{t("finalExtra.text64")}</h2><p>{t("sweep2.text70")}</p><p>{t("sweep3.text71")}</p><h2>{t("sweep1.text72")}</h2><p>{t("sweep2.text73")}</p><h2>{t("sweep3.text74")}</h2><p>{t("sweep1.text75")}</p><h2>{t("finalExtra.text65")}</h2><p>{t("sweep2.text76")}</p><h2>{t("sweep3.text77")}</h2><p>{t("sweep1.text78")}</p><h2>{t("sweep2.text79")}</h2><p>{t("sweep3.text80")}</p><h2>10. Contact</h2><p>{t("finalExtra.text67")}{" "}<a href="mailto:marioceatin@gmail.com">marioceatin@gmail.com</a>.</p></article></main>;
}
