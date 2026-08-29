export const ATTRIBUTION_WINDOW_DAYS = 30;
export const TOUCH_RETENTION_DAYS = 90;

export type Touch = { captured_at: string; utm_source?: string | null; utm_medium?: string | null; expires_at?: string | null; [key: string]: unknown };

export function selectLastNonDirectTouch(touches: Touch[], saleAt: string) {
  const saleTime = new Date(saleAt).getTime();
  const windowStart = saleTime - ATTRIBUTION_WINDOW_DAYS * 86400000;
  return touches.filter((touch) => {
    const capturedAt = new Date(touch.captured_at).getTime();
    const source = (touch.utm_source ?? "").toLowerCase();
    const medium = (touch.utm_medium ?? "").toLowerCase();
    const direct = !source || source === "direct" || medium === "direct";
    return capturedAt <= saleTime && capturedAt >= windowStart && !direct && (!touch.expires_at || new Date(touch.expires_at).getTime() >= capturedAt);
  }).sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0] ?? null;
}

export function shouldReplaceTouch(existing: Touch | null, incoming: Touch) {
  const incomingSource = (incoming.utm_source ?? "").toLowerCase();
  const incomingMedium = (incoming.utm_medium ?? "").toLowerCase();
  const incomingDirect = !incomingSource || incomingSource === "direct" || incomingMedium === "direct";
  return !existing || !incomingDirect;
}
