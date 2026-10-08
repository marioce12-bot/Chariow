import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Vendeo | Vends, analyse et lance tes pubs Meta & TikTok";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Aperçu de partage 1200×630 (WhatsApp, Facebook, X, LinkedIn), généré au build.
// Le logo est lu depuis public/ et injecté en data URI (PNG : le webp n'est pas supporté ici).
export default async function OpengraphImage() {
  const icon = await readFile(join(process.cwd(), "public", "icons", "vendeo-icon-1024.png"));
  const iconSrc = `data:image/png;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "linear-gradient(135deg, #020B35 0%, #103ef8 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} width={120} height={120} alt="" style={{ borderRadius: 28 }} />
          <div style={{ display: "flex", marginLeft: 28, fontSize: 64, fontWeight: 800, letterSpacing: -1, color: "#c8f23c" }}>Vendeo</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>
          <div style={{ display: "flex" }}>Vends, analyse et lance</div>
          <div style={{ display: "flex" }}>tes pubs Meta &amp; TikTok.</div>
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 34, color: "#cfd8f6" }}>Boutique · Publicités · Studio IA</div>
      </div>
    ),
    { ...size },
  );
}
