import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// En-têtes de sécurité des vitrines publiques (/shop/*). Le CSP autorise les scripts inline (nécessaires à Next.js
// sans nonce) et le pixel Meta ; les images sont en https car les visuels produits viennent du CDN de Chariow.
const shopCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://www.facebook.com https://connect.facebook.net${isProd ? "" : " ws: wss:"}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// CSP du reste du site (accueil, login, dashboard, admin) en mode REPORT-ONLY : le navigateur ne bloque rien, il
// signale seulement ce qui serait bloqué à /api/csp-report (visible dans les logs Vercel). Une fois les rapports
// propres, on passera cette règle en "Content-Security-Policy" (blocage réel).
const appCspReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.facebook.com https://connect.facebook.net https://graph.facebook.com https://api.cloudinary.com${isProd ? "" : " ws: wss:"}`,
  "frame-src 'self' https://business.facebook.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");

// En-têtes appliqués à tout le reste du site (accueil, login, dashboard, admin, API).
const globalSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: appCspReportOnly },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: globalSecurityHeaders },
      { source: "/shop/:path*", headers: [...securityHeaders, { key: "Content-Security-Policy", value: shopCsp }] },
      { source: "/api/shop/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
