import { decryptSecret } from "@/lib/crypto";

type CheckoutInput = {
  productId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: { number: string; countryCode: string };
  redirectUrl?: string;
  customerIp?: string;
  customMetadata: Record<string, string>;
  apiKey: string;
};

export async function createChariowCheckout(input: CheckoutInput) {
  const response = await fetch("https://api.chariow.com/v1/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: input.productId, email: input.email, first_name: input.firstName, last_name: input.lastName, phone: { number: input.phone.number, country_code: input.phone.countryCode }, redirect_url: input.redirectUrl, customer_ip: input.customerIp, custom_metadata: input.customMetadata }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as { data?: { step?: string; payment?: { checkout_url?: string }; [key: string]: unknown }; error?: unknown } | null;
  if (!response.ok || !payload?.data) throw new Error(`Chariow checkout returned ${response.status}`);
  return payload.data;
}
