"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { META_PIXEL_ID, trackMetaPageView } from "@/lib/meta/site-pixel";

export function MetaPixel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    if (pathname === null) return;
    trackMetaPageView(`${pathname}${query ? `?${query}` : ""}`);
  }, [pathname, query]);

  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}
