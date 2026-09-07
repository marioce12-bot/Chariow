"use client";
import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  meta_campaign_id: string;
  name: string;
  status: string | null;
  objective: string | null;
  spend_30d: number;
  link: { product_id: string; product_name: string; confidence: string } | null;
};
type Product = { id: string; name: string; url: string | null };

export function AttributionPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const response = await fetch("/api/attribution/campaigns");
    if (response.ok) {
      const data = await response.json();
      setCampaigns(data.campaigns ?? []);
      setProducts(data.products ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function link(campaignId: string) {
    const productId = selection[campaignId];
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setSaving(campaignId);
    try {
      const response = await fetch(`/api/attribution/campaigns/${campaignId}/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: product.id, product_name: product.name, product_url: product.url }) });
      if (response.ok) await load();
    } finally {
      setSaving(null);
    }
  }

  async function unlink(campaignId: string) {
    setSaving(campaignId);
    try {
      const response = await fetch(`/api/attribution/campaigns/${campaignId}/link`, { method: "DELETE" });
      if (response.ok) await load();
    } finally {
      setSaving(null);
    }
  }

  if (loading) return null;
  if (!campaigns.length) return null;

  const resolved = campaigns.filter((c) => c.link);
  const unresolved = campaigns.filter((c) => !c.link);

  return (
    <section className="app-card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <div>
          <span className="eyebrow">Attribution</span>
          <h2>Quelle campagne fait vendre quoi ?</h2>
          <p>{campaigns.length} campagne{campaigns.length > 1 ? "s" : ""} analysée{campaigns.length > 1 ? "s" : ""} — {resolved.length} identifiée{resolved.length > 1 ? "s" : ""}, {unresolved.length} à résoudre.</p>
        </div>
      </div>
      {unresolved.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {unresolved.map((campaign) => (
            <div key={campaign.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <strong>{campaign.name}</strong>
                <div style={{ fontSize: 12, color: "#64748b" }}>{campaign.spend_30d.toLocaleString("fr-FR")} dépensés (30j) — produit non identifié</div>
              </div>
              <select value={selection[campaign.id] ?? ""} onChange={(e) => setSelection((s) => ({ ...s, [campaign.id]: e.target.value }))} disabled={!products.length}>
                <option value="">Choisir un produit</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
              <button type="button" className="btn btn-dark" disabled={!selection[campaign.id] || saving === campaign.id} onClick={() => void link(campaign.id)} style={{ fontSize: 12, padding: "8px 12px" }}>
                {saving === campaign.id ? "…" : "Lier"}
              </button>
            </div>
          ))}
          {!products.length && <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 8 }}>Connecte ta boutique Chariow pour pouvoir lier tes campagnes à un produit.</p>}
        </div>
      )}
      {resolved.length > 0 && (
        <div style={{ marginTop: unresolved.length ? 18 : 14 }}>
          {resolved.map((campaign) => (
            <div key={campaign.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
              <span>🟢 <strong>{campaign.name}</strong> → {campaign.link?.product_name}</span>
              <button type="button" className="btn btn-ghost" onClick={() => void unlink(campaign.id)} disabled={saving === campaign.id} style={{ fontSize: 11, padding: "5px 9px" }}>Délier</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
