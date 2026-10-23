"use client";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import Link from "next/link";



export default function DataDeletionContent() {
  const { locale , t } = useI18n();
  useEffect(() => { document.title = locale === "en" ? 'Data deletion — Vendeo' : 'Suppression des données — Vendeo'; }, [locale]);
  return <main className="legal-page"><article className="legal-card"><Link href="/privacy" className="legal-back">{t("sweep2.text10")}</Link><span className="eyebrow">Vendeo</span><h1>{t("sweep3.text11")}</h1><p className="legal-updated">{t("sweep1.text12")}</p><p>{t("sweep2.text13")}</p><h2>{locale === "en" ? "Account deletion and recovery" : "Suppression et restauration du compte"}</h2><p>{locale === "en" ? "An account deletion request suspends access immediately; it does not erase data at once. Data remains recoverable for 90 days. Before the deadline, the account can be restored after email verification. The trial continues as scheduled and is not reset or extended." : "Une demande de suppression suspend immédiatement l’accès ; elle n’efface pas les données sur-le-champ. Les données restent restaurables pendant 90 jours. Avant l’échéance, le compte peut être restauré après vérification de l’adresse e-mail. L’essai suit son calendrier et n’est ni réinitialisé ni prolongé."}</p><p>{locale === "en" ? "After erasure, if the 15-day trial is still running, only a protected marker may remain; it does not contain the email in plain text." : "Après l’effacement, si l’essai de 15 jours est toujours en cours, seul un marqueur protégé peut subsister ; il ne contient pas l’adresse e-mail en clair."}</p><h2>{t("finalExtra.text57")}</h2><p>{t("sweep3.text14")}{" "}<a href="mailto:vendeo008@gmail.com?subject=Demande%20de%20suppression%20des%20donn%C3%A9es">vendeo008@gmail.com</a> {" "}{t("sweep1.text15")}</p><h2>{t("sweep2.text16")}</h2><p>{t("sweep3.text17")}</p><ul><li>{t("sweep1.text18")}</li><li>{t("sweep2.text19")}</li><li>{t("sweep3.text20")}</li><li>{t("sweep1.text21")}</li></ul><h2>{t("sweep2.text22")}</h2><p>{t("sweep3.text23")}</p><h2>{t("sweep1.text24")}</h2><p>{t("sweep2.text25")}</p><p>{t("finalExtra.text58")}{" "}<a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>{t("sweep3.text26")}{" "}<Link href="/privacy">{t("auth.privacy")}</Link>.</p></article></main>;
}
