export async function createSubscriptionCheckout(fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher("/api/subscription/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "starter" }),
  });
  const data = await response.json().catch(() => null) as {
    payment?: { url?: unknown };
    error?: unknown;
  } | null;
  const url = data?.payment?.url;
  if (!response.ok || typeof url !== "string") {
    throw new Error(typeof data?.error === "string" ? data.error : "subscription_checkout_failed");
  }
  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(url);
  } catch {
    throw new Error("invalid_subscription_checkout_url");
  }
  if (checkoutUrl.protocol !== "https:") {
    throw new Error("invalid_subscription_checkout_url");
  }
  return checkoutUrl.toString();
}
