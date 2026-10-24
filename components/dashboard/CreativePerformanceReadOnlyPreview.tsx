"use client";

import { useEffect, useState } from "react";
import { Auth } from "@/components/Auth";
import { PerformanceVisuelView } from "@/components/dashboard/PerformanceVisuelView";
import { createClient } from "@/lib/supabase/browser";

type Store = { id: string; store_name: string | null };

type SessionState = "checking" | "signed-out" | "signed-in";

export default function CreativePerformanceReadOnlyPreview() {
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function initialize() {
      const { data, error: authError } = await createClient().auth.getUser();
      if (!active) return;
      if (authError || !data.user) {
        setSessionState("signed-out");
        return;
      }
      setSessionState("signed-in");
      try {
        const response = await fetch("/api/stores", { method: "GET", cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Impossible de charger les boutiques.");
        const availableStores = Array.isArray(body.stores) ? body.stores as Store[] : [];
        if (active) {
          setStores(availableStores);
          setStoreId(availableStores[0]?.id ?? "");
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger les boutiques.");
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  if (sessionState === "checking") return <p className="text-sm text-gray-600">Vérification de la session…</p>;
  if (sessionState === "signed-out") return <Auth mode="login" successRedirect="/preview/creative-performance" />;

  return (
    <section className="space-y-5">
      <div className="max-w-sm">
        <label htmlFor="preview-store" className="mb-1 block text-sm font-medium">Boutique</label>
        <select
          id="preview-store"
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
          disabled={stores.length === 0}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
        >
          {stores.length === 0 && <option value="">Aucune boutique disponible</option>}
          {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name || "Boutique Chariow"}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <PerformanceVisuelView storeId={storeId || null} onOpenStudio={() => {}} readOnly={true} />
    </section>
  );
}
