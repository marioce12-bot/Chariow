"use client";

import { useRef, useState, type ReactNode } from "react";

type VideoDownloadButtonProps = {
  url: string;
  filename?: string;
  locale?: string;
  className?: string;
  children?: ReactNode;
};

export function VideoDownloadButton({
  url,
  filename,
  locale = "fr",
  className = "btn btn-ghost",
  children,
}: VideoDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const busyRef = useRef(false);
  const french = locale.toLowerCase().startsWith("fr");
  const defaultName = (filename?.trim() || "video").replace(/(?:\.mp4)+$/i, "");
  const downloadName = `${defaultName}.mp4`;

  async function download() {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(false);
    let objectUrl: string | undefined;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], downloadName, { type: blob.type || "video/mp4" });
      const share = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (isIos && typeof share.share === "function" && typeof share.canShare === "function" && share.canShare({ files: [file] })) {
        try {
          await share.share({ files: [file], title: downloadName });
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") return;
          throw shareError;
        }
      }
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadName;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError(true);
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 30_000);
      busyRef.current = false;
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} disabled={loading} onClick={download}>
        {loading ? (french ? "Téléchargement…" : "Downloading…") : (children ?? (french ? "Télécharger la vidéo" : "Download video"))}
      </button>
      {error && <span role="alert" className="text-sm text-red-600">{french ? "Impossible de télécharger la vidéo. Réessayez." : "Could not download the video. Please try again."}</span>}
    </span>
  );
}

export default VideoDownloadButton;
