export const META_PIXEL_ID = "1658429795999318";

const META_PIXEL_SCRIPT_URL = "https://connect.facebook.net/en_US/fbevents.js";

type MetaPixelCommand = (...args: unknown[]) => void;
type MetaPixelFunction = MetaPixelCommand & {
  callMethod?: MetaPixelCommand;
  queue?: unknown[][];
  push?: MetaPixelCommand;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    __vendeoMetaPixelInitialized?: boolean;
    __vendeoMetaPixelLastPageView?: string;
  }
}

function initializeMetaPixel(): MetaPixelFunction | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue?.push(args);
    }) as MetaPixelFunction;

    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
  }

  const fbq = window.fbq;
  if (!fbq) return;

  const existingScript = document.querySelector(`script[src="${META_PIXEL_SCRIPT_URL}"]`);
  if (!existingScript) {
    const script = document.createElement("script");
    script.async = true;
    script.src = META_PIXEL_SCRIPT_URL;
    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) firstScript.parentNode.insertBefore(script, firstScript);
    else (document.head ?? document.documentElement).appendChild(script);
  }

  if (!window.__vendeoMetaPixelInitialized) {
    fbq("init", META_PIXEL_ID);
    window.__vendeoMetaPixelInitialized = true;
  }

  return fbq;
}

export function trackMetaPageView(pageKey: string): void {
  if (typeof window === "undefined" || !pageKey) return;
  if (window.__vendeoMetaPixelLastPageView === pageKey) return;

  const fbq = initializeMetaPixel();
  if (!fbq) return;

  fbq("track", "PageView");
  window.__vendeoMetaPixelLastPageView = pageKey;
}
