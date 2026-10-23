"use client";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { SHOPIFY_PRIVACY_COPY } from "@/lib/shopify/privacy-copy";
import Link from "next/link";

export default function PrivacyContent() {
  const { locale, t } = useI18n();
  useEffect(() => { document.title = locale === "en" ? "Privacy Policy — Vendeo" : "Politique de confidentialité — Vendeo"; }, [locale]);
  const shopifyPrivacy = SHOPIFY_PRIVACY_COPY[locale === "en" ? "en" : "fr"];
  return (
    <main className="legal-page">
      <article className="legal-card">
        <Link href="/register" className="legal-back">{t("sweep1.text27")}</Link>
        <span className="eyebrow">Vendeo</span>
        <h1>{t("settings.privacy")}</h1>
        <p className="legal-updated">{t("sweep1.text12")}</p>
        <p>{t("sweep2.text28")}</p>
        <h2>{t("finalExtra.text59")}</h2>
        <p>{t("sweep3.text29")}{" "}<a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>.</p>
        <h2>{t("sweep1.text30")}</h2>
        <ul>
          <li><strong>{t("sweep2.text31")}</strong> {" "}{t("sweep3.text32")}</li>
          <li><strong>{t("sweep1.text33")}</strong> {" "}{t("sweep2.text34")}</li>
          <li><strong>Shopify :</strong> {" "}{shopifyPrivacy.data}</li>
          <li><strong>{t("sweep3.text35")}</strong> {" "}{t("sweep1.text36")}</li>
          <li><strong>{t("sweep2.text37")}</strong> {" "}{t("sweep3.text38")}</li>
          <li><strong>{t("finalExtra.text60")}</strong> {" "}{t("sweep1.text39")}</li>
        </ul>
        <h2>{t("sweep2.text40")}</h2>
        <ul>
          <li>{shopifyPrivacy.use}</li>
          <li>{t("sweep3.text41")}</li>
          <li>{t("sweep1.text42")}</li>
          <li>{t("sweep2.text43")}</li>
          <li>{t("sweep3.text44")}</li>
          <li>{t("sweep1.text45")}</li>
        </ul>
        <h2>{t("sweep2.text46")}</h2>
        <p>{t("sweep3.text47")}</p>
        <ul>
          <li><strong>Meta Platforms :</strong> {" "}{t("sweep1.text48")}</li>
          <li><strong>Chariow :</strong> {" "}{t("sweep2.text49")}</li>
          <li><strong>Shopify :</strong> {" "}{shopifyPrivacy.sharing}</li>
          <li><strong>SasPay :</strong> {" "}{t("sweep3.text50")}</li>
          <li><strong>Supabase :</strong> {" "}{t("sweep1.text51")}</li>
        </ul>
        <h3>{locale === "en" ? "Shopify data recipients" : "Destinataires des données Shopify"}</h3>
        <p>{shopifyPrivacy.sharing}</p>
        <h2>{t("sweep2.text52")}</h2>
        <p>{t("sweep3.text53")}</p>
        <p>{shopifyPrivacy.retention}</p>
        <h2>{t("sweep1.text54")}</h2>
        <p>{t("sweep2.text55")}{" "}<Link href="/data-deletion">{t("sweep1.text9")}</Link>{t("sweep3.text56")}{" "}<a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>.</p>
        <h2>7. Cookies</h2>
        <p>{t("sweep1.text57")}</p>
        <h2>{t("finalExtra.text62")}</h2>
        <p>{t("sweep2.text58")}</p>
      </article>
    </main>
  );
}
