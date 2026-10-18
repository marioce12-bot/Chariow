"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { estimatedLaunchProgress } from "@/lib/chat/launch-progress";

/** The API returns one final response, not intermediate server progress. */
export function LaunchProgress({ complete = false }: { complete?: boolean }) {
  const { t } = useI18n();
  const [estimate, setEstimate] = useState(0);
  useEffect(() => {
    if (complete) return;
    const start = Date.now();
    const timer = window.setInterval(() => setEstimate(estimatedLaunchProgress(Date.now() - start)), 250);
    return () => window.clearInterval(timer);
  }, [complete]);
  const percent = complete ? 100 : estimate;
  const label = t(complete ? "chat.launchSent" : "chat.launchSubmitting");

  return (
    <div className="chat-launch-progress">
      <div className={`chat-launch-progress-ring${complete ? " is-complete" : ""}`}
        role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={percent} aria-valuetext={`${percent} % — ${label}`}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle className="chat-launch-progress-track" cx="32" cy="32" r="27" />
          <circle className="chat-launch-progress-value" cx="32" cy="32" r="27" pathLength="100"
            strokeDasharray={`${percent} 100`} />
        </svg>
        <strong aria-hidden="true">{percent} %</strong>
      </div>
      <div className="chat-launch-progress-copy">
        <strong role="status">{label}</strong>
        <small>{t(complete ? "chat.launchConfirmed" : "chat.launchProgressEstimated")}</small>
      </div>
    </div>
  );
}
