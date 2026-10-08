import { ImageResponse } from "next/og";

export const alt = "Vendeo | Vends, analyse et lance tes pubs Meta & TikTok";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Aperçu de partage 1200×630 (WhatsApp, Facebook, X, LinkedIn), généré au build.
export default function OpengraphImage() {
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
        <div style={{ display: "flex", fontSize: 56, fontWeight: 800, letterSpacing: -1, color: "#c8f23c" }}>Vendeo</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>
          <div style={{ display: "flex" }}>Vends, analyse et lance</div>
          <div style={{ display: "flex" }}>tes pubs Meta &amp; TikTok.</div>
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 34, color: "#cfd8f6" }}>Boutique · Publicités · Studio IA</div>
      </div>
    ),
    { ...size },
  );
}
