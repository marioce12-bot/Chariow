"use client";

import Script from "next/script";

// Pixel Meta du propriétaire de la vitrine. L'identifiant est validé côté serveur (chiffres uniquement) et re-vérifié ici
// avant d'être injecté dans le script.
export function MetaPixel({ pixelId }: { pixelId: string }) {
  if (!/^\d{5,20}$/.test(pixelId)) return null;
  const code = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`;
  return <Script id="meta-pixel" strategy="afterInteractive">{code}</Script>;
}
