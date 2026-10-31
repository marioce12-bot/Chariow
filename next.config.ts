import { withWorkflow } from "workflow/next";
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

const videoRuntimeFiles = [
  "./node_modules/ffmpeg-static/index.js",
  "./node_modules/ffmpeg-static/package.json",
  "./node_modules/ffmpeg-static/ffmpeg",
  "./node_modules/ffprobe-static/index.js",
  "./node_modules/ffprobe-static/package.json",
  "./node_modules/ffprobe-static/bin/linux/x64/ffprobe",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  outputFileTracingExcludes: {
    // Only the durable step handler can reach runTaskStep/renderSlideshow; keep workflow control routes light.
    "/.well-known/workflow/v1/step": ["./node_modules/ffprobe-static/bin/darwin/**", "./node_modules/ffprobe-static/bin/win32/**", "./node_modules/ffprobe-static/bin/linux/ia32/**", "./node_modules/ffprobe-static/bin/linux/arm64/**"],
    "/api/studio/tasks/**": ["./node_modules/ffprobe-static/bin/darwin/**", "./node_modules/ffprobe-static/bin/win32/**", "./node_modules/ffprobe-static/bin/linux/ia32/**", "./node_modules/ffprobe-static/bin/linux/arm64/**"],
    "/api/studio/slideshow/**": ["./node_modules/ffprobe-static/bin/darwin/**", "./node_modules/ffprobe-static/bin/win32/**", "./node_modules/ffprobe-static/bin/linux/ia32/**", "./node_modules/ffprobe-static/bin/linux/arm64/**"],
  },
  outputFileTracingIncludes: {
    "/api/studio/video": videoRuntimeFiles,
    "/api/studio/video/*": videoRuntimeFiles,
    "/api/studio/video/*/content": videoRuntimeFiles,
    "/.well-known/workflow/v1/step": [...videoRuntimeFiles, "./public/vendeo-logo.webp"],
    "/api/studio/tasks": videoRuntimeFiles,
    "/api/studio/tasks/*": videoRuntimeFiles,
    "/api/studio/slideshow/*": [...videoRuntimeFiles, "./public/vendeo-logo.webp"],
    "/api/studio/slideshow/music/*": [...videoRuntimeFiles, "./public/vendeo-logo.webp"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: globalSecurityHeaders },
      { source: "/shop/:path*", headers: [...securityHeaders, { key: "Content-Security-Policy", value: shopCsp }] },
      { source: "/api/shop/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default withWorkflow(nextConfig);
