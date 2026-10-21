"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ImageOff, Play } from "lucide-react";
import { isVideoMediaUrl } from "@/lib/meta/ad-video";

type Props = {
  src: string;
  alt: string;
  unavailableLabel: string;
  className?: string;
  style?: CSSProperties;
  controls?: boolean;
  onUnavailable?: () => void | Promise<void>;
};

/** Reset failure/retry state only when the source really changes. */
export function CampaignMedia(props: Props) {
  return <CampaignMediaSource key={props.src} {...props} />;
}

function CampaignMediaSource({ src, alt, unavailableLabel, className, style, controls = false, onUnavailable }: Props) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const recover = useRef(onUnavailable);
  recover.current = onUnavailable;
  const video = isVideoMediaUrl(src);

  useEffect(() => {
    if (!failed || attempt !== 0) return;
    // Refresh Vendeo's read-only media snapshot once, and retry the original
    // source once too: a failed <img> is not retried when React receives the
    // same URL again. Never append cache-busters to signed CDN URLs.
    void Promise.resolve().then(() => recover.current?.()).catch(() => {});
    const timer = window.setTimeout(() => { setAttempt(1); setFailed(false); }, 1500);
    return () => window.clearTimeout(timer);
  }, [failed, attempt]);

  const mediaStyle: CSSProperties = { width: "100%", height: "100%", maxHeight: style?.maxHeight, objectFit: "cover", display: "block" };
  return (
    <span className={className} style={{ display: "inline-flex", position: "relative", alignItems: "center", justifyContent: "center", background: "var(--surface-soft, #f3f4f6)", color: "#6b7280", ...style }}>
      {failed ? (
        <span role="img" aria-label={unavailableLabel} title={unavailableLabel} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: controls ? 80 : undefined }}>
          <ImageOff size={20} aria-hidden="true" />
          {controls ? <span>{unavailableLabel}</span> : null}
        </span>
      ) : video ? (
        <>
          <video key={attempt} src={src} aria-label={alt} controls={controls} muted={!controls} playsInline preload="metadata" style={mediaStyle} onError={() => setFailed(true)} />
          {!controls ? <Play size={18} aria-hidden="true" style={{ position: "absolute", pointerEvents: "none", color: "white", filter: "drop-shadow(0 1px 2px #000)" }} /> : null}
        </>
      ) : <img key={attempt} src={src} alt={alt} style={mediaStyle} onError={() => setFailed(true)} />}
    </span>
  );
}
