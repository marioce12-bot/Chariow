import type { CSSProperties, ReactNode } from "react";
import "@/app/platform-rotator.css";

const PLATFORMS: Array<{ name: string; icon: ReactNode }> = [
  {
    name: "Meta",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#0866FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 12c-1.6-2.6-3.2-5-5.4-5C4.2 7 3 9.3 3 12s1.2 5 3.6 5c2.2 0 3.8-2.4 5.4-5zm0 0c1.6-2.6 3.2-5 5.4-5C19.8 7 21 9.3 21 12s-1.2 5-3.6 5c-2.2 0-3.8-2.4-5.4-5z" />
      </svg>
    ),
  },
  {
    name: "Pinterest",
    icon: (
      <svg viewBox="0 0 24 24" fill="#E60023" aria-hidden="true">
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" />
      </svg>
    ),
  },
  {
    name: "TikTok",
    icon: (
      <svg viewBox="0 0 24 24" fill="#111" aria-hidden="true">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
];

/**
 * « Lancez vos campagnes sur » + une plateforme qui défile (Meta → Pinterest → TikTok → Meta…).
 * - `prefix` : début de phrase affiché au-dessus de la plateforme
 * - `fullText` : phrase complète, lue par les lecteurs d'écran et affichée si l'utilisateur
 *   a demandé moins d'animations (prefers-reduced-motion).
 */
export function PlatformRotator({ prefix, fullText }: { prefix: string; fullText: string }) {
  return (
    <p className="hero-tagline platform-tagline">
      <span className="platform-static">{fullText}</span>
      <span className="platform-animated" aria-hidden="true">
        <span className="platform-prefix">{prefix}</span>
        <span className="platform-line">
          <span className="platform-slot">
            {PLATFORMS.map((platform, index) => (
              <span key={platform.name} className="platform-item" style={{ "--i": index } as CSSProperties}>
                {platform.icon}
                <span>{platform.name}</span>
              </span>
            ))}
          </span>
        </span>
      </span>
    </p>
  );
}
