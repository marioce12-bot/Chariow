"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { estimatedLaunchProgress } from "@/lib/chat/launch-progress";
import "./launch-progress.css";

/** Shared campaign/Studio indicator. Campaigns estimate until the final response;
 * Studio can supply checkpoint-backed progress without changing this UI. */
export function LaunchProgress({ complete = false, indeterminate = false, label: customLabel, progress, subtitle }: { complete?: boolean; indeterminate?: boolean; label?: string; progress?: number; subtitle?: string }) {
  const { t } = useI18n();
  const [estimate, setEstimate] = useState(0);
  const controlled = typeof progress === "number" && Number.isFinite(progress);
  useEffect(() => {
    if (complete || indeterminate || controlled) return;
    const start = Date.now();
    const timer = window.setInterval(() => setEstimate(estimatedLaunchProgress(Date.now() - start)), 250);
    return () => window.clearInterval(timer);
  }, [complete, indeterminate, controlled]);
  const percent = complete ? 100 : controlled ? Math.max(0, Math.min(99, Math.round(progress!))) : estimate;
  const pending = indeterminate && !complete;
  const label = customLabel ?? t(complete ? "chat.launchSent" : "chat.launchSubmitting");

  return (
    <div className="chat-launch-progress">
      <div className={`chat-launch-progress-ring${complete ? " is-complete" : ""}`}
        role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={pending ? undefined : percent} aria-valuetext={pending ? label : `${percent} % — ${label}`}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle className="chat-launch-progress-track" cx="32" cy="32" r="27" />
          <circle className="chat-launch-progress-value" cx="32" cy="32" r="27" pathLength="100"
            strokeDasharray={`${pending ? 25 : percent} 100`} />
        </svg>
        {!pending && <strong aria-hidden="true">{percent} %</strong>}
      </div>
      <div className="chat-launch-progress-copy">
        <strong role="status">{label}</strong>
        {!pending && <small>{subtitle ?? t(complete ? "chat.launchConfirmed" : "chat.launchProgressEstimated")}</small>}
      </div>
    </div>
  );
}
