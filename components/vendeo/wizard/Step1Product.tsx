"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { ChariowProductLite, WizardState } from "./types";
import { useI18n } from "@/lib/i18n/i18n";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onNext: () => void;
}

type ChariowStore = { id: string; store_name: string | null; platform: string; connection_status: string | null };

/**
 * Étape 1/5 — Récupère les produits de la boutique Chariow connectée
 * via GET /api/analytics?store_id=... (route déjà existante).
 */
export function Step1Product({ state, patch, onNext }: StepProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [products, setProducts] = useState<ChariowProductLite[]>([]);
  const [stores, setStores] = useState<ChariowStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadStores() {
      setStoresLoading(true);
      try {
        const response = await fetch("/api/stores", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || (en ? "Unable to load stores" : "Impossible de charger les boutiques"));
        const connected = (Array.isArray(data?.stores) ? data.stores : []).filter((store: ChariowStore) => store.platform === "chariow" && store.connection_status === "connected");
        if (!cancelled) {
          setStores(connected);
          if (!connected.some((store: ChariowStore) => store.id === state.storeId)) {
            patch({ storeId: connected[0]?.id ?? null, product: null });
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur inconnue");
      } finally {
        if (!cancelled) setStoresLoading(false);
      }
    }
    void loadStores();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = state.storeId
          ? `/api/analytics?store_id=${encodeURIComponent(state.storeId)}`
          : "/api/analytics";
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || (en ? "Unable to load products" : "Impossible de charger les produits"));
        if (!cancelled) setProducts(data?.snapshot?.products ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [state.storeId]);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {en ? "Choose the Chariow product to promote. Its image, price and description are retrieved automatically." : "Choisis le produit Chariow à promouvoir. Visuel, prix et descriptif sont récupérés automatiquement."}
      </p>

      <div>
        <label htmlFor="campaign-store" className="mb-1.5 block text-sm font-semibold text-gray-700">
          {en ? "Chariow store" : "Boutique Chariow"}
        </label>
        <select
          id="campaign-store"
          value={state.storeId ?? ""}
          disabled={storesLoading || stores.length === 0}
          onChange={(event) => patch({ storeId: event.target.value, product: null })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-60"
        >
          {stores.length === 0 && <option value="">{storesLoading ? (en ? "Loading stores…" : "Chargement des boutiques…") : (en ? "No connected store" : "Aucune boutique connectée")}</option>}
          {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name || (en ? "Chariow store" : "Boutique Chariow")}</option>)}
        </select>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={en ? "Search for a product…" : "Rechercher un produit…"}
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {loading && <p className="text-sm text-gray-400">{en ? "Loading products…" : "Chargement des produits…"}</p>}
      {error && <p className="text-sm text-[#991B1B]">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {filtered.map((product) => {
          const selected = state.product?.id === product.id;
          return (
            <button
              key={product.id}
              onClick={() => patch({ product })}
              className={`rounded-xl border p-2 text-left transition ${
                selected ? "border-[#6366F1] ring-2 ring-[#6366F1]/30" : "border-gray-100"
              }`}
            >
              <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-50">
                {product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-gray-300">
                    {en ? "No image" : "Pas d'image"}
                  </div>
                )}
              </div>
              <p className="mt-1.5 truncate text-xs font-semibold text-gray-900">{product.name}</p>
              {product.price != null && (
                <p className="text-xs text-gray-400">
                  {product.price} {product.currency ?? "XOF"}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && !error && (
        <p className="text-sm text-gray-400">{en ? "No products found in this store." : "Aucun produit trouvé sur cette boutique."}</p>
      )}

      <div className="sticky bottom-0 -mx-5 mt-4 flex justify-end border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          disabled={!state.product}
          onClick={onNext}
          className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {en ? "Continue" : "Continuer"}
        </button>
      </div>
    </div>
  );
}
