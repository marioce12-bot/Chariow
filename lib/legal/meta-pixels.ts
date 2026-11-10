type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: (...args: unknown[]) => void;
  loaded?: boolean;
  version?: string;
};

type MetaPixelWindow = Window & {
  fbq?: MetaPixelFunction;
  _fbq?: MetaPixelFunction;
  __vendeoMetaPixelIds?: Set<string>;
};

export function enableMetaPixel(pixelId: string) {
  if (typeof window === "undefined" || !/^\d{5,20}$/.test(pixelId)) return;
  const target = window as MetaPixelWindow;
  let fbq = target.fbq;

  if (!fbq) {
    const queue: unknown[][] = [];
    const stub = ((...args: unknown[]) => {
      if (stub.callMethod) stub.callMethod(...args);
      else queue.push(args);
    }) as MetaPixelFunction;
    stub.queue = queue;
    stub.push = stub;
    stub.loaded = true;
    stub.version = "2.0";
    target.fbq = stub;
    target._fbq = stub;
    fbq = stub;

    const script = document.createElement("script");
    script.id = "vendeo-meta-pixel-library";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  target.__vendeoMetaPixelIds ??= new Set<string>();
  if (!target.__vendeoMetaPixelIds.has(pixelId)) {
    fbq("init", pixelId);
    target.__vendeoMetaPixelIds.add(pixelId);
  }
  fbq("trackSingle", pixelId, "PageView");
}

export function disableMetaPixels() {
  if (typeof window === "undefined") return;
  const target = window as MetaPixelWindow;
  document.querySelectorAll('script#vendeo-meta-pixel-library, script[src*="connect.facebook.net/en_US/fbevents.js"]').forEach((script) => script.remove());
  delete target.fbq;
  delete target._fbq;
  delete target.__vendeoMetaPixelIds;
}
