"use client";
import { Store } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { dashboardCopy } from "@/lib/i18n/dashboard-copy";
export function DashboardStoreSelector({ stores, selectedStoreId, onChange, mobile = false, loading = false }: {
  stores: Array<{ id: string; store_name: string }>;
  selectedStoreId: string | null;
  onChange: (id: string | null) => void;
  mobile?: boolean;
  loading?: boolean;
}) {
  const { locale, t } = useI18n();
  const copy = dashboardCopy[locale];
  const id = mobile ? "mobile-dashboard-store" : "desktop-dashboard-store";
  return <div className={mobile ? "dashboard-mobile-store-switcher" : "dashboard-desktop-store-switcher"} data-testid={mobile ? "mobile-store-selector" : "desktop-store-selector"}>
    <label className="store-selector" htmlFor={id}>
      {mobile && <span><Store size={14} aria-hidden="true" />{t("interfaceExtra.displayedStore")}</span>}
      <select id={id} aria-label={mobile ? undefined : t("interfaceExtra.displayedStore")} value={selectedStoreId ?? ""} disabled={loading || !stores.length} onChange={e => onChange(e.target.value || null)}>
        {!stores.length && <option value="">{loading ? copy["dashboardExtra.storesLoading"] : copy["dashboardExtra.noStore"]}</option>}
        {stores.map(store => <option key={store.id} value={store.id}>{store.store_name}</option>)}
      </select>
    </label>
  </div>;
}
