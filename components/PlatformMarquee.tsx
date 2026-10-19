"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { SiMeta, SiTiktok, SiPinterest } from "react-icons/si";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/platform-marquee.css";

export function PlatformMarquee() {
  const { t, locale } = useI18n();
  const en = locale === "en";
  const [paused, setPaused] = useState(false);
  const platforms = [
    { name: "Chariow", image: "/logos/chariow.svg", width: 140 },
    { name: "Selar", image: "/logos/selar.png", width: 40, status: t("landing.hero.soon") },
    { name: "Gumroad", image: "/logos/gumroad.svg", width: 144, status: t("landing.hero.soon") },
    { name: "Meta", icon: SiMeta, color: "#0866ff", status: t("sweep2.text124") },
    { name: "TikTok", icon: SiTiktok, color: "#111827", status: t("sweep2.text124") },
    { name: "Pinterest", icon: SiPinterest, color: "#e60023", status: t("sweep2.text124") },
  ];

  return (
    <section className="landing-platforms platform-marquee" aria-labelledby="platform-marquee-title" data-paused={paused}>
      <div className="platform-marquee-heading">
        <span id="platform-marquee-title">{t("sweep3.text122")}</span>
        <button type="button" className="platform-marquee-toggle" aria-controls="platform-marquee-viewport" aria-pressed={paused} onClick={() => setPaused(!paused)}>
          {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
          {paused ? (en ? "Resume" : "Reprendre") : "Pause"}
        </button>
      </div>
      <p id="platform-marquee-help" className="sr-only">
        {en ? "Scrolling pauses on hover or keyboard focus. With reduced motion, scroll horizontally to explore all platforms." : "Le défilement s’arrête au survol ou au focus clavier. Avec les animations réduites, faites défiler horizontalement pour découvrir toutes les plateformes."}
      </p>
      <div id="platform-marquee-viewport" className="platform-marquee-viewport" tabIndex={0} role="region" aria-labelledby="platform-marquee-title" aria-describedby="platform-marquee-help">
        <div className="platform-marquee-track">
          {[false, true].map((duplicate) => (
            <ul className="platform-marquee-group" key={String(duplicate)} aria-hidden={duplicate || undefined} role="list">
              {platforms.map(({ name, image, width, status, icon: Icon, color }) => (
                <li className={`platform-marquee-item platform-marquee-${name.toLowerCase()}`} key={name}>
                  <span className="platform-marquee-brand">
                    {image ? <Image src={image} alt={name} width={width} height={40} loading="eager" /> : Icon ? <><Icon aria-hidden="true" style={{ color }} /><span>{name}</span></> : null}
                  </span>
                  {status && <small>({status})</small>}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
