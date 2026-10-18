"use client";
import { Store } from "lucide-react";
export function DashboardStoreSelector({ stores, selectedStoreId, onChange, mobile = false, loading = false }: {
  stores: Array<{ id: string; store_name: string }>;
  selectedStoreId: string | null;
  onChange: (id: string | null) => void;
  mobile?: boolean;
  loading?: boolean;
}) {
  const id = mobile ? "mobile-dashboard-store" : "desktop-dashboard-store";
  return <div className={mobile ? "dashboard-mobile-store-switcher" : "dashboard-desktop-store-switcher"} data-testid={mobile ? "mobile-store-selector" : "desktop-store-selector"}>
    <label className="store-selector" htmlFor={id}>
      <span>{mobile && <Store size={14} aria-hidden="true" />}Boutique affichée</span>
      <select id={id} value={selectedStoreId ?? ""} disabled={loading || !stores.length} onChange={e => onChange(e.target.value || null)}>
        {!stores.length && <option value="">{loading ? "Chargement des boutiques…" : "Aucune boutique"}</option>}
        {stores.map(store => <option key={store.id} value={store.id}>{store.store_name}</option>)}
      </select>
    </label>
  </div>;
}
