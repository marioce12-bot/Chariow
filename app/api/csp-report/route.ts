import { NextResponse } from "next/server";

// Reçoit les rapports du CSP en mode Report-Only. Ne fait que les écrire dans les logs (préfixe [csp-violation]) ;
// ne touche ni à la base ni à la session. Taille limitée, jamais d'erreur renvoyée au navigateur.
// Pour lire les rapports : logs Vercel, filtre "csp-violation".
export async function POST(request: Request) {
  try {
    const text = (await request.text()).slice(0, 4000);
    if (text) {
      const parsed = JSON.parse(text) as Record<string, any>;
      const report = parsed["csp-report"] ?? parsed;
      console.warn(
        "[csp-violation]",
        JSON.stringify({
          directive: report["violated-directive"] ?? report.effectiveDirective,
          blocked: report["blocked-uri"] ?? report.blockedURL,
          page: report["document-uri"] ?? report.documentURL,
        }),
      );
    }
  } catch {
    // rapport illisible : on ignore
  }
  return new NextResponse(null, { status: 204 });
}
