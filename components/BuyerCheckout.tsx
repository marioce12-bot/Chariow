"use client";

import { useState } from "react";

function visitorId() {
  const key = "vendeo_visitor_id";
  const existing = document.cookie.split("; ").find((part) => part.trim().startsWith(`${key}=`))?.split("=")[1];
  if (existing) return existing;
  const value = crypto.randomUUID();
  document.cookie = `${key}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
  return value;
}

export function BuyerCheckout({ storeSlug, productSlug, productId }: { storeSlug: string; productSlug: string; productId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", phone: "", country_code: "BJ" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch("/api/chariow/checkout/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ store_slug: storeSlug, product_slug: productSlug, visitor_id: visitorId(), email: form.email, first_name: form.first_name, last_name: form.last_name, phone: { number: form.phone.replace(/\D/g, ""), country_code: form.country_code } }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.checkout_url) window.location.assign(data.checkout_url);
    else if (response.ok && data.completed) setError("Commande confirmée.");
    else if (response.ok && data.already_purchased) setError("Ce produit a déjà été acheté avec cet email.");
    else setError(data.error ?? "Impossible de lancer le paiement.");
    setLoading(false);
  }
  return <>{!open ? <button className="btn btn-dark" onClick={() => setOpen(true)}>Acheter</button> : <form onSubmit={submit} className="buyer-checkout-form"><input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><input required placeholder="Prénom" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /><input required placeholder="Nom" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /><div className="buyer-phone"><select value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })}><option value="BJ">BJ</option><option value="CI">CI</option><option value="SN">SN</option><option value="TG">TG</option></select><input required inputMode="numeric" pattern="[0-9]+" placeholder="97000000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} /></div><button className="btn btn-dark" disabled={loading}>{loading ? "Redirection…" : "Continuer vers Chariow"}</button>{error ? <p role="status">{error}</p> : null}</form>}</>;
}
