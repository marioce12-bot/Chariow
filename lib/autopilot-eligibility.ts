// A cached local campaign status is never proof that a platform is live.
export type AutopilotLiveStatus = {
  state: "active" | "inactive" | "unknown";
  checked_at: string | null;
  reason: string;
};
export const AUTOPILOT_STATUS_MAX_AGE_MS = 60_000;
export function isAutopilotLive(status?: AutopilotLiveStatus | null, now = Date.now()): boolean {
  if (status?.state !== "active" || !status.checked_at) return false;
  const checked = Date.parse(status.checked_at);
  return Number.isFinite(checked) && checked <= now && now - checked < AUTOPILOT_STATUS_MAX_AGE_MS;
}
export function selectLiveAutopilotCampaigns<T extends { status?: string | null; autopilot_live_status?: AutopilotLiveStatus | null }>(campaigns: T[], now = Date.now()): T[] {
  return campaigns.filter((campaign) => campaign.status === "active" && isAutopilotLive(campaign.autopilot_live_status, now));
}
