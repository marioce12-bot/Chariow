"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ImagePlus, Loader2, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { buildGeoTargeting, deriveCountries, type ChariowProductLite, type GeoLocation } from "@/components/vendeo/wizard/types";
import { LocationSearchInput } from "@/components/vendeo/wizard/LocationSearchInput";
import type { MetaGenderTarget, MetaInterestTarget } from "@/lib/ad-campaigns/meta-targeting";
import { imageCreditCost } from "@/lib/studio/credits";
import { uploadCampaignMedia } from "@/lib/media/direct-upload";
import { useI18n } from "@/lib/i18n/i18n";
import { getConnectedVariantPackStores, getVariantPackDraftStep, hasVariantPackDraftProgress, haveThreeChosenFormats, type AdAngle, type VariantFormat } from "@/lib/ad-variant-pack";

const DRAFT_KEY = "vendeo_ad_variant_pack_draft_v1";
const PACKS_KEY = "vendeo_ad_variant_packs_v1";
const IMAGE_COST = imageCreditCost("hd", "medium");
type Store = { id: string; store_name: string | null; platform: string; connection_status: string | null; is_active?: boolean };
type Variant = { angleId: string; format: VariantFormat | ""; media: string[]; copy: string; generating?: boolean; error?: string };
type Draft = {
  storeId: string; productId: string; objective: string; locations: GeoLocation[];
  minAge: number; maxAge: number; gender: MetaGenderTarget | null;
  interests: MetaInterestTarget[]; advantageAudience: boolean;
  dailyBudget: number; durationDays: number; angles: AdAngle[]; selected: string[];
  variants: Record<string, Variant>; step: number; packId?: string; metaAdAccountId?: string;
  campaignIds?: Record<string, string>; launched?: Record<string, boolean>; started?: boolean;
};
const defaultLocation: GeoLocation = { key: "BJ", name: "Bénin", type: "country", countryCode: "BJ" };
const DEFAULT: Draft = {
  storeId: "", productId: "", objective: "sales", locations: [defaultLocation],
  minAge: 18, maxAge: 45, gender: null, interests: [], advantageAudience: false,
  dailyBudget: 5, durationDays: 5, angles: [], selected: [], variants: {}, step: 1,
};
const uid = () => `pack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
function isWebUrl(value: unknown): value is string { try { const url = new URL(String(value)); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; } }

export function VariantPackWizard({ storeId, onClose, onLaunched }: { storeId: string; onClose: () => void; onLaunched: () => void }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => {
    if (typeof window === "undefined") return { ...DEFAULT, storeId };
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return { ...DEFAULT, storeId };
      const saved = JSON.parse(raw) as Partial<Draft>;
      if (!hasVariantPackDraftProgress(saved)) {
        localStorage.removeItem(DRAFT_KEY);
        return { ...DEFAULT, storeId };
      }
      return { ...DEFAULT, ...saved, storeId: saved.storeId || storeId, step: getVariantPackDraftStep(saved.step), started: true };
    }
    catch { return { ...DEFAULT, storeId }; }
  });
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<ChariowProductLite[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name?: string | null }[]>([]);
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState(() => draft.metaAdAccountId ?? "");
  const [pageId, setPageId] = useState("");
  const [interestQuery, setInterestQuery] = useState("");
  const [interestResults, setInterestResults] = useState<MetaInterestTarget[]>([]);
  const [interestLoading, setInterestLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const product = useMemo(() => products.find((row) => row.id === draft.productId) ?? null, [products, draft.productId]);
  const selectedInterests = draft.interests;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    try {
      if (ready || !hasVariantPackDraftProgress(draft)) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, started: true }));
    } catch { /* storage unavailable */ }
  }, [draft, ready]);

  useEffect(() => {
    let cancelled = false;
    const loadStores = async () => {
      try {
        const storeResponse = await fetch("/api/stores", { cache: "no-store" });
        const storeData = await storeResponse.json();
        if (!storeResponse.ok) throw new Error(storeData.error || "Boutiques indisponibles");
        if (cancelled) return;
        const connected = getConnectedVariantPackStores<Store>(storeData.stores ?? []);
        setStores(connected);
        setDraft((currentDraft) => {
          const chosen = connected.find((s) => s.id === currentDraft.storeId)
            ?? connected.find((s) => s.id === storeId)
            ?? connected[0];
          if (!chosen || chosen.id === currentDraft.storeId) return currentDraft;
          return { ...currentDraft, storeId: chosen.id, productId: "" };
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : (en ? "Unable to load stores." : "Impossible de charger les boutiques."));
      }
    };
    const loadAccounts = async () => {
      try {
        const accountsResponse = await fetch("/api/integrations/meta/accounts", { cache: "no-store" });
        const accountData = await accountsResponse.json();
        if (cancelled) return;
        const availableAccounts = accountData.accounts ?? [];
        setAccounts(availableAccounts);
        const selectedAccount = availableAccounts.find((a: { id: string }) => a.id === draft.metaAdAccountId)
          ?? (availableAccounts.length === 1 ? availableAccounts[0] : null);
        if (selectedAccount) {
          setAccountId(selectedAccount.id);
          setDraft((d) => ({ ...d, metaAdAccountId: selectedAccount.id }));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : (en ? "Unable to load the Meta account." : "Impossible de charger le compte Meta."));
      }
    };
    void loadStores();
    void loadAccounts();
    const refreshStoresOnReturn = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void loadStores();
    };
    window.addEventListener("focus", refreshStoresOnReturn);
    document.addEventListener("visibilitychange", refreshStoresOnReturn);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshStoresOnReturn);
      document.removeEventListener("visibilitychange", refreshStoresOnReturn);
    };
  }, [draft.metaAdAccountId, en, storeId]);

  useEffect(() => {
    if (!draft.storeId) return;
    let cancelled = false;
    fetch(`/api/analytics?store_id=${encodeURIComponent(draft.storeId)}`, { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) throw new Error(d.error || "Produits indisponibles"); if (!cancelled) setProducts(d.snapshot?.products ?? []); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Impossible de charger les produits."); });
    return () => { cancelled = true; };
  }, [draft.storeId]);

  useEffect(() => {
    if (!accountId) { setPages([]); setPageId(""); return; }
    let cancelled = false;
    fetch(`/api/integrations/meta/resources?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (cancelled) return; const nextPages = d.pages ?? []; setPages(nextPages); if (nextPages.length === 1) setPageId(nextPages[0].id); })
      .catch(() => { if (!cancelled) setPages([]); });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    const query = interestQuery.trim();
    if (query.length < 2 || !accountId) { setInterestResults([]); setInterestLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setInterestLoading(true);
      const params = new URLSearchParams({ q: query, account_id: accountId });
      fetch(`/api/integrations/meta/interest-search?${params}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { results: [] })
        .then((data) => { if (!controller.signal.aborted) setInterestResults(Array.isArray(data.results) ? data.results : []); })
        .catch(() => { if (!controller.signal.aborted) setInterestResults([]); })
        .finally(() => { if (!controller.signal.aborted) setInterestLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [interestQuery, accountId]);

  const patch = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change, started: true }));
  const selectAccount = (id: string) => {
    setAccountId(id); setPageId(""); setDraft((d) => ({ ...d, metaAdAccountId: id, interests: [], started: true }));
  };
  const addInterest = (option: MetaInterestTarget) => {
    if (selectedInterests.some((interest) => interest.id === option.id) || selectedInterests.length >= 10) return;
    patch({ interests: [...selectedInterests, { id: option.id, name: option.name }] });
    setInterestQuery(""); setInterestResults([]);
  };
  const removeInterest = (id: string) => patch({ interests: selectedInterests.filter((interest) => interest.id !== id) });

  const analyze = async () => {
    if (!product) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/ai/ad-angles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productName: product.name, productDescription: product.description, price: product.price, currency: product.currency, locale }) });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.angles) || data.angles.length !== 5) throw new Error(data.error || (en ? "Could not analyze this product." : "Impossible d’analyser ce produit."));
      const angles = data.angles as AdAngle[];
      const selected = angles.filter((a) => a.recommended).slice(0, 3).map((a) => a.id);
      patch({ angles, selected, variants: Object.fromEntries(angles.filter((a) => selected.includes(a.id)).map((a) => [a.id, { angleId: a.id, format: "", media: [], copy: a.copy }])), step: 2 });
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur d’analyse."); }
    finally { setLoading(false); }
  };
  const toggleAngle = (id: string) => {
    const selected = draft.selected.includes(id) ? draft.selected.filter((x) => x !== id) : draft.selected.length < 3 ? [...draft.selected, id] : draft.selected;
    const variants = { ...draft.variants };
    if (selected.includes(id) && !variants[id]) {
      variants[id] = { angleId: id, format: "", media: [], copy: draft.angles.find((a) => a.id === id)?.copy ?? "" };
    }
    if (!selected.includes(id)) delete variants[id];
    patch({ selected, variants });
  };
  const updateVariant = (id: string, change: Partial<Variant>) => setDraft((d) => ({ ...d, variants: { ...d.variants, [id]: { ...d.variants[id], ...change } }, started: true }));
  const upload = async (id: string, files: FileList | null) => {
    if (!files?.length) return;
    const variant = draft.variants[id];
    if (!variant.format) return;
    if (variant.format === "video" && files.length > 1) { setError(en ? "Choose one video." : "Choisis une seule vidéo."); return; }
    setBusy(true); setError("");
    try {
      const urls = await Promise.all(Array.from(files).map((file) => uploadCampaignMedia(file)));
      const nextMedia = variant.format === "carousel" ? [...variant.media, ...urls.map((u) => String(u.secure_url))].slice(0, 5) : [String(urls[0].secure_url)];
      updateVariant(id, { media: nextMedia });
    } catch (e) { setError(e instanceof Error ? e.message : "Échec de l’envoi du visuel."); }
    finally { setBusy(false); }
  };
  const generate = async (id: string) => {
    const angle = draft.angles.find((a) => a.id === id);
    const variant = draft.variants[id];
    if (!product || !angle || !variant?.format || variant.format === "video") return;
    updateVariant(id, { generating: true, error: undefined });
    try {
      const res = await fetch("/api/studio/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: `Publicité Meta ${draft.variants[id].format === "carousel" ? "carrousel" : "image carrée"} pour le produit « ${product.name} ». Angle : ${angle.title}. ${angle.rationale}. Texte strictement fidèle aux informations fournies. Description connue : ${product.description ?? "aucune"}. Aucun fait ni résultat inventé.`, quality: "medium", resolution: "hd", orientation: "square" }) });
      const data = await res.json();
      if (!res.ok || typeof data.imageUrl !== "string") throw new Error(data.error || "Génération impossible.");
      updateVariant(id, { media: [...draft.variants[id].media, data.imageUrl], generating: false });
    } catch (e) { updateVariant(id, { generating: false, error: e instanceof Error ? e.message : "Génération impossible." }); }
  };

  const saveAndLaunch = async () => {
    if (!product || !isWebUrl(product.url) || !accountId || !pageId || draft.selected.length !== 3) return;
    if (!haveThreeChosenFormats(draft.selected.map((id) => draft.variants[id]?.format))) return;
    if (draft.selected.some((id) => !draft.variants[id]?.media.length || (draft.variants[id].format === "carousel" && draft.variants[id].media.length < 2))) return;
    setBusy(true); setError("");
    const packId = draft.packId ?? uid();
    const campaignIds = { ...(draft.campaignIds ?? {}) };
    const launched = { ...(draft.launched ?? {}) };
    try {
      patch({ packId });
      for (const id of draft.selected) {
        const angle = draft.angles.find((a) => a.id === id)!;
        const variant = draft.variants[id];
        if (!campaignIds[id]) {
          const body = {
            store_id: draft.storeId, product_id: product.id, product_name: product.name,
            platform: "meta", objective: draft.objective,
            ad_set_name: `Pack ${packId} · ${angle.title}`, ad_name: angle.title,
            text: variant.copy, title: angle.title, link: product.url,
            media_url: variant.media[0], carousel_urls: variant.format === "carousel" ? variant.media.slice(1) : [],
            countries: deriveCountries(draft.locations).join(","), geo_targeting: buildGeoTargeting(draft.locations),
            meta_targeting: { gender: draft.gender, interests: draft.interests },
            advantage_audience: draft.advantageAudience,
            minAge: draft.minAge, maxAge: draft.maxAge,
            daily_budget: Number((draft.dailyBudget / 3).toFixed(2)), duration_days: draft.durationDays,
            meta_ad_account_id: accountId, meta_page_id: pageId,
            variant_label: angle.title, pack_id: packId,
          };
          const create = await fetch("/api/ad-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const created = await create.json();
          if (!create.ok || !created.campaign?.id) throw new Error(created.error || "Impossible d’enregistrer cette variante.");
          campaignIds[id] = created.campaign.id;
          patch({ campaignIds: { ...campaignIds } });
        }
        if (!launched[id]) {
          const launch = await fetch(`/api/ad-campaigns/${campaignIds[id]}/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meta_ad_account_id: accountId, page_id: pageId }) });
          const result = await launch.json();
          if (!launch.ok) throw new Error(result.error || (en ? `Meta did not launch “${angle.title}”.` : `Meta n’a pas lancé « ${angle.title} ».`));
          launched[id] = true;
          patch({ launched: { ...launched } });
        }
      }
      try {
        const all = JSON.parse(localStorage.getItem(PACKS_KEY) || "[]");
        all.unshift({ id: packId, status: "done", storeId: draft.storeId, accountId, productName: product.name, createdAt: new Date().toISOString(), variants: draft.selected.map((id) => ({ id, angle: draft.angles.find((a) => a.id === id)?.title, format: draft.variants[id]?.format, campaignId: campaignIds[id] })) });
        localStorage.setItem(PACKS_KEY, JSON.stringify(all.slice(0, 30)));
        localStorage.removeItem(DRAFT_KEY);
      } catch { /* keep completed launches */ }
      setReady(true); onLaunched();
    } catch (e) { setError(e instanceof Error ? e.message : "Le lancement n’a pas pu être vérifié. Reprends-le depuis le récapitulatif."); }
    finally { setBusy(false); }
  };

  const close = () => {
    try {
      if (hasVariantPackDraftProgress(draft)) localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, started: true }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
    onClose();
  };
  const selectedCountries = deriveCountries(draft.locations);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col bg-black/40 sm:items-center sm:justify-center">
      <div role="dialog" aria-modal="true" aria-labelledby="pack-title" className="flex h-full w-full flex-col overflow-hidden bg-white text-gray-900 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#6366F1]">VENDEO · META ADS</p><h2 id="pack-title" className="text-lg font-bold">{en ? "Variant pack" : "Pack de variantes"}</h2></div><button type="button" disabled={busy} aria-label={en ? "Close" : "Fermer"} onClick={close} className="rounded-full p-2 text-gray-500 disabled:opacity-40"><X size={18}/></button></header>
        <div className="flex shrink-0 gap-2 border-b px-5 py-3 text-xs">{[en ? "Setup" : "Réglages", "Angles", en ? "Creatives" : "Visuels", en ? "Review" : "Récapitulatif"].map((label, i) => <span key={label} className={`rounded-full px-3 py-1 ${draft.step === i + 1 ? "bg-[#EEF2FF] font-bold text-[#3730A3]" : "bg-gray-100 text-gray-500"}`}>{i + 1}. {label}</span>)}</div>
        <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {ready ? <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900"><h3 className="font-bold">{en ? "Pack launched" : "Pack lancé"}</h3><p className="mt-1 text-sm">{en ? "The three Meta variants were sent. Their individual status and results are visible in Ads." : "Les trois variantes Meta ont été envoyées. Leur statut et leurs résultats individuels sont visibles dans Pub."}</p><button type="button" className="mt-4 rounded-lg bg-[#6366F1] px-4 py-2 font-semibold text-white" onClick={onClose}>{en ? "Close" : "Fermer"}</button></div> : null}

          {!ready && draft.step === 1 && <>
            <p className="text-sm text-gray-600">{en ? "Choose your connected Shopify or Chariow store, product and Meta campaign settings. Nothing is created until you confirm the final review." : "Choisis une boutique Shopify ou Chariow connectée, un produit et les paramètres Meta. Rien n’est créé avant ta confirmation finale."}</p>
            <label className="grid gap-1 text-sm font-semibold">{en ? "Store" : "Boutique"}<select className="rounded-lg border p-2" value={draft.storeId} onChange={(e) => patch({ storeId: e.target.value, productId: "" })}>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name || store.id} · {store.platform === "shopify" ? "Shopify" : "Chariow"}</option>)}</select></label>
            {!stores.length && <p role="status" className="text-sm text-amber-800">{en ? "Connect a Shopify or Chariow store before continuing." : "Connecte une boutique Shopify ou Chariow avant de continuer."}</p>}
            <label className="grid gap-1 text-sm font-semibold">{en ? "Product" : "Produit"}<select className="rounded-lg border p-2" value={draft.productId} onChange={(e) => patch({ productId: e.target.value })}><option value="">{en ? "Choose a product" : "Choisir un produit"}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            {product && !isWebUrl(product.url) && <p role="alert" className="text-xs text-amber-800">{en ? "This product has no valid public URL and cannot be sent to Meta." : "Ce produit n’a pas d’URL publique valide et ne peut pas être envoyé à Meta."}</p>}
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">{en ? "Objective" : "Objectif"}<select className="rounded-lg border p-2" value={draft.objective} onChange={(e) => patch({ objective: e.target.value })}><option value="sales">{en ? "Sales" : "Ventes"}</option><option value="traffic">{en ? "Traffic" : "Trafic"}</option><option value="engagement">{en ? "Engagement" : "Interactions"}</option><option value="leads">{en ? "Leads" : "Prospects"}</option></select></label><label className="grid gap-1 text-sm">{en ? "Meta ad account" : "Compte publicitaire Meta"}<select className="rounded-lg border p-2" value={accountId} onChange={(e) => selectAccount(e.target.value)}><option value="">{en ? "Choose an account" : "Choisir un compte"}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name ?? account.id}</option>)}</select></label></div>
            <div className="space-y-2"><p className="text-sm font-semibold">{en ? "Audience locations" : "Lieux de l’audience"}</p><LocationSearchInput value={draft.locations} onChange={(locations) => patch({ locations })} metaAccountId={accountId} platform="meta"/><p className="text-xs text-gray-500">{en ? "Search countries, regions and cities supported by Meta." : "Recherche des pays, régions et villes proposés par Meta."}</p></div>
            <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">{en ? "Age from" : "Âge de"}<input className="rounded-lg border p-2" type="number" min="18" max="65" value={draft.minAge} onChange={(e) => patch({ minAge: Math.min(65, Math.max(18, Number(e.target.value))) })}/></label><label className="grid gap-1 text-sm">{en ? "to" : "à"}<input className="rounded-lg border p-2" type="number" min={draft.minAge} max="65" value={draft.maxAge} onChange={(e) => patch({ maxAge: Math.min(65, Math.max(draft.minAge, Number(e.target.value))) })}/></label></div>
            <fieldset className="space-y-2"><legend className="text-sm font-semibold">{en ? "Gender (optional)" : "Genre (facultatif)"}</legend><div className="flex flex-wrap gap-2">{([{ value: null, label: en ? "All genders" : "Femmes et hommes" }, { value: "female", label: en ? "Women only" : "Femmes uniquement" }, { value: "male", label: en ? "Men only" : "Hommes uniquement" }] as const).map((option) => <label key={option.value ?? "all"} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${draft.gender === option.value ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}><input type="radio" name="variant-pack-gender" checked={draft.gender === option.value} onChange={() => patch({ gender: option.value })}/>{option.label}</label>)}</div><p className="text-xs text-gray-500">{en ? "Meta does not offer sexual-orientation targeting." : "Meta ne propose pas de ciblage publicitaire par orientation sexuelle."}</p></fieldset>
            <div className="space-y-2"><label htmlFor="pack-interest-search" className="block text-sm font-semibold">{en ? "Meta interests (optional, up to 10)" : "Centres d’intérêt Meta (facultatif, jusqu’à 10)"}</label><p className="text-xs text-gray-500">{en ? "Search and select only interests returned by Meta’s catalog." : "Recherche et sélectionne uniquement des intérêts renvoyés par le catalogue Meta."}</p><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input id="pack-interest-search" type="search" autoComplete="off" disabled={!accountId} value={interestQuery} onChange={(e) => setInterestQuery(e.target.value)} placeholder={en ? "Search Meta interests" : "Rechercher dans le catalogue Meta"} className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm disabled:bg-gray-100"/></div>{!accountId && <p className="text-xs text-gray-500">{en ? "Select a Meta account to search its catalog." : "Choisis un compte Meta pour rechercher dans son catalogue."}</p>}{interestQuery.trim().length >= 2 && <div className="max-h-48 overflow-y-auto rounded-lg border">{interestLoading ? <p className="p-2 text-sm text-gray-500">{en ? "Searching Meta…" : "Recherche auprès de Meta…"}</p> : interestResults.filter((item) => !selectedInterests.some((selected) => selected.id === item.id)).map((item) => <button key={item.id} type="button" onClick={() => addInterest(item)} disabled={selectedInterests.length >= 10} className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-indigo-50 disabled:opacity-50">{item.name}</button>)}</div>}{selectedInterests.length > 0 && <div className="flex flex-wrap gap-2">{selectedInterests.map((item) => <span key={item.id} className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800">{item.name}<button type="button" onClick={() => removeInterest(item.id)} aria-label={`${en ? "Remove" : "Retirer"} ${item.name}`} className="font-bold">×</button></span>)}</div>}</div>
            <label className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" checked={draft.advantageAudience} onChange={(e) => patch({ advantageAudience: e.target.checked, ...(e.target.checked ? { maxAge: 65 } : {}) })} className="mt-0.5"/><span><strong className="block text-sm">{en ? "Advantage+ audience" : "Audience Advantage+"}</strong><span className="text-xs text-gray-500">{draft.advantageAudience ? (en ? "Meta may expand beyond selected audience settings; max age is 65." : "Meta peut élargir l’audience au-delà de tes critères; l’âge maximal est fixé à 65 ans.") : (en ? "Off: Meta uses your selected locations, age and interests." : "Désactivée : Meta utilise les lieux, l’âge et les intérêts choisis.")}</span></span></label>
            <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">{en ? "Total daily budget for pack (USD)" : "Budget quotidien total du pack (USD)"}<input className="rounded-lg border p-2" type="number" min="3" value={draft.dailyBudget} onChange={(e) => patch({ dailyBudget: Number(e.target.value) })}/></label><label className="grid gap-1 text-sm">{en ? "Duration (days)" : "Durée (jours)"}<input className="rounded-lg border p-2" type="number" min="1" max="90" value={draft.durationDays} onChange={(e) => patch({ durationDays: Number(e.target.value) })}/></label></div>
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><strong>{en ? "Placements: automatic" : "Placements : automatiques"}</strong><p className="mt-1">{en ? "The existing Meta campaign API omits publisher_platforms and placement positions, so Meta chooses eligible placements automatically. Manual placement selection is not available in Vendeo yet." : "L’API de campagne Meta existante n’envoie ni publisher_platforms ni positions; Meta choisit automatiquement les placements admissibles. Le choix manuel des placements n’est pas encore disponible dans Vendeo."}</p></div>
            {draft.objective === "sales" && stores.find((s) => s.id === draft.storeId)?.platform === "shopify" && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">{en ? "Shopify products are supported. A Meta pixel is still required for Sales; if Meta reports no pixel, the launch flow will ask before any Traffic fallback." : "Les produits Shopify sont pris en charge. Un pixel Meta reste requis pour l’objectif Ventes; s’il manque, le parcours demandera confirmation avant tout repli vers Trafic."}</p>}
          </>}

          {!ready && draft.step === 2 && <>
            <p className="text-sm text-gray-600">{en ? "Vendeo proposes five distinct angles grounded in the product. Three are recommended; choose exactly three." : "Vendeo propose cinq angles distincts, fondés sur le produit. Trois sont recommandés; choisis-en exactement trois."}</p>
            <button type="button" disabled={loading || !product} onClick={() => void analyze()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><Sparkles size={16}/>{loading ? (en ? "Analyzing…" : "Analyse en cours…") : (en ? "Analyze product" : "Analyser le produit")}</button>
            <div className="grid gap-3 sm:grid-cols-2">{draft.angles.map((angle) => <button key={angle.id} type="button" onClick={() => toggleAngle(angle.id)} aria-pressed={draft.selected.includes(angle.id)} className={`rounded-xl border p-3 text-left ${draft.selected.includes(angle.id) ? "border-[#6366F1] bg-indigo-50" : "border-gray-200"}`}><div className="flex items-center justify-between gap-2"><strong>{angle.title}</strong>{angle.recommended && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">{en ? "Recommended" : "Recommandé"}</span>}</div><p className="mt-2 text-xs text-gray-600">{angle.rationale}</p><p className="mt-2 text-xs text-gray-500">{angle.copy}</p></button>)}</div><p className="text-xs text-gray-500">{draft.selected.length}/3 {en ? "selected" : "sélectionnés"}</p>
          </>}

          {!ready && draft.step === 3 && <>
            <p className="text-sm text-gray-600">{en ? "Choose a format for each variant; they can all be the same (for example, 3 images). Vendeo generates images, not videos, so upload videos yourself. A carousel is swipeable image cards and needs at least 2 images. A slideshow exported as MP4 is selected as Video. Each generated HD image costs 20 Studio credits; nothing is charged until you press Generate." : "Choisis librement le format de chaque variante; ils peuvent être identiques (par exemple, 3 images). Vendeo génère des images, pas des vidéos : importe tes vidéos toi-même. Un carrousel est un ensemble d’images à faire défiler et exige au moins 2 images. Un diaporama exporté en MP4 se choisit sous Vidéo. Chaque image HD générée coûte 20 crédits Studio; rien n’est débité avant le clic sur Générer."}</p>
            {draft.selected.map((id) => {
              const angle = draft.angles.find((a) => a.id === id)!;
              const variant = draft.variants[id];
              return <section key={id} className="space-y-3 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">{angle.title}</h3>
                  <label className="text-xs">{en ? "Format" : "Format"}
                    <select className="ml-2 rounded-lg border p-2" value={variant.format} onChange={(e) => updateVariant(id, { format: e.target.value as Variant["format"], media: [] })}>
                      <option value="" disabled>{en ? "Choose a format" : "Choisir un format"}</option>
                      <option value="image">Image</option>
                      <option value="video">Vidéo</option>
                      <option value="carousel">Carrousel</option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-xs font-semibold">{en ? "Ad text (editable)" : "Texte publicitaire (modifiable)"}<textarea className="rounded-lg border p-2 text-sm" rows={3} value={variant.copy} onChange={(e) => updateVariant(id, { copy: e.target.value })}/></label>
                {!variant.format ? <p className="text-xs text-gray-500">{en ? "Choose this variant’s format before adding media." : "Choisis le format de cette variante avant d’ajouter un visuel."}</p> : <>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><ImagePlus size={14}/>{en ? "Add your media" : "Ajouter tes visuels"}<input className="sr-only" type="file" accept={variant.format === "video" ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp"} multiple={variant.format === "carousel"} onChange={(e) => void upload(id, e.target.files)}/></label>
                    {variant.format !== "video" && <button type="button" disabled={variant.generating} onClick={() => void generate(id)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-50">{variant.generating ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} {en ? `Generate image · ${IMAGE_COST} credits` : `Générer une image · ${IMAGE_COST} crédits`}</button>}
                  </div>
                  {variant.media.length > 0 && <div className="flex gap-2 overflow-auto">{variant.media.map((url, i) => <div key={`${url}-${i}`} className="flex min-w-[110px] items-center gap-2 rounded bg-gray-50 p-2 text-xs">{variant.format === "video" ? <video src={url} className="h-14 w-14 object-cover"/> : <img src={url} alt="" className="h-14 w-14 object-cover"/>}<button type="button" onClick={() => updateVariant(id, { media: variant.media.filter((_, j) => j !== i) })}>{en ? "Remove" : "Retirer"}</button></div>)}</div>}
                  {variant.format === "carousel" && <p className="text-xs text-gray-500">{variant.media.length}/5 {en ? "images" : "images"}{variant.media.length < 2 ? (en ? " — add at least one more." : " — ajoute au moins une image de plus.") : null}</p>}
                </>}
                {variant.error && <p role="alert" className="text-xs text-red-700">{variant.error}</p>}
              </section>;
            })}
          </>}

          {!ready && draft.step === 4 && <>
            <h3 className="font-bold">{en ? "Review your pack" : "Vérifie ton pack"}</h3><p className="text-sm text-gray-600">{en ? "Nothing is sent to Meta until you explicitly confirm. The platform bills the ad account, separately from Studio credits." : "Rien ne sera envoyé à Meta sans ta confirmation explicite. La plateforme facture le compte publicitaire, séparément des crédits Studio."}</p>
            <div className="rounded-xl bg-gray-50 p-3 text-sm"><p><strong>{product?.name}</strong> · {draft.objective}</p><p>{draft.locations.map((l) => l.name).join(", ")} · {draft.minAge}–{draft.maxAge}{draft.gender ? ` · ${draft.gender}` : ""}</p><p>{selectedInterests.length ? selectedInterests.map((i) => i.name).join(", ") : (en ? "No interest filter" : "Sans filtre par intérêt")} · {draft.advantageAudience ? "Advantage+" : (en ? "Audience fixed" : "Audience définie")}</p><p>{draft.dailyBudget} USD/jour total ({(draft.dailyBudget / 3).toFixed(2)} USD/variante) × {draft.durationDays} jours · {accountId ? (accounts.find((a) => a.id === accountId)?.name ?? "Meta") : (en ? "Meta account required" : "Compte Meta requis")}</p><p className="text-xs text-amber-800">{en ? "Placements: automatic (Meta chooses)." : "Placements : automatiques (choisis par Meta)."}</p></div>
            {draft.selected.map((id) => { const angle = draft.angles.find((a) => a.id === id)!; const variant = draft.variants[id]; return <article key={id} className="rounded-xl border p-3"><div className="flex justify-between"><strong>{angle.title}</strong><span className="text-xs uppercase">{variant.format}</span></div><p className="mt-2 text-sm">{variant.copy}</p><p className="mt-2 text-xs text-gray-500">{variant.media.length} {en ? "media item(s)" : "visuel(s)"}</p></article>; })}
            {draft.angles.some((a) => a.recommended && !draft.selected.includes(a.id)) && <p className="text-xs text-gray-500">{en ? "You changed Vendeo’s recommended angles." : "Tu as modifié les angles recommandés par Vendeo."}</p>}
            <label className="grid gap-1 text-sm font-semibold">{en ? "Facebook page" : "Page Facebook"}<select className="rounded-lg border p-2" value={pageId} onChange={(e) => setPageId(e.target.value)}><option value="">{en ? "Choose a page" : "Choisir une page"}</option>{pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label>
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{en ? "If the Meta pixel is missing for Sales, launch stops and asks before switching to Traffic. Underperforming ads can only be paused after a separate confirmation; none are deleted." : "Si le pixel Meta manque pour Ventes, le lancement s’arrête et demande confirmation avant de passer en Trafic. Les publicités moins performantes peuvent seulement être mises en pause après confirmation séparée; aucune n’est supprimée."}</p>
          </>}
        </main>
        {!ready && <footer className="flex shrink-0 items-center justify-between border-t bg-white px-5 py-3">
          <button type="button" className="text-sm text-gray-600" onClick={() => draft.step === 1 ? close() : patch({ step: draft.step - 1 })}>{en ? "Back" : "Retour"}</button>
          {draft.step < 4 ? <button type="button" disabled={busy || loading || (draft.step === 1 ? (!product || !isWebUrl(product.url) || !accountId || draft.minAge < 18 || draft.maxAge < draft.minAge || draft.dailyBudget < 3 || draft.durationDays < 1) : draft.step === 2 ? draft.selected.length !== 3 : (!haveThreeChosenFormats(draft.selected.map((id) => draft.variants[id]?.format)) || draft.selected.some((id) => !draft.variants[id]?.media.length || (draft.variants[id].format === "carousel" && draft.variants[id].media.length < 2))))} onClick={() => draft.step === 1 ? (patch({ step: 2 }), void analyze()) : patch({ step: draft.step + 1 })} className="rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{loading ? (en ? "Analyzing…" : "Analyse…") : (en ? "Continue" : "Continuer")}</button> : <button type="button" disabled={busy || !product || !accountId || !pageId || draft.selected.length !== 3 || !haveThreeChosenFormats(draft.selected.map((id) => draft.variants[id]?.format)) || draft.selected.some((id) => !draft.variants[id]?.media.length || (draft.variants[id].format === "carousel" && draft.variants[id].media.length < 2))} onClick={() => void saveAndLaunch()} className="rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? (en ? "Launching…" : "Lancement…") : (en ? "Confirm and launch" : "Confirmer et lancer")}</button>}
        </footer>}
      </div>
    </div>, document.body,
  );
}

export function CampaignModeDialog({ onClose, onSimple, onPack, onResume }: { onClose: () => void; onSimple: () => void; onPack: () => void; onResume: () => void }) {
  const { locale } = useI18n(); const en = locale === "en";
  const [resumeStep, setResumeStep] = useState<number | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { step?: unknown };
      if (!hasVariantPackDraftProgress(saved)) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      setResumeStep(getVariantPackDraftStep(saved.step));
    } catch { /* storage unavailable or invalid JSON */ }
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="campaign-mode-title" className="w-full max-w-lg rounded-2xl bg-white p-5 text-gray-900 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><p className="text-xs font-bold uppercase tracking-wide text-[#6366F1]">VENDEO · PUB</p><h2 id="campaign-mode-title" className="mt-1 text-xl font-bold">{en ? "Create an ad" : "Créer une publicité"}</h2></div>
          <button type="button" onClick={onClose} aria-label={en ? "Close" : "Fermer"}><X size={18}/></button>
        </div>
        <div className="mt-4 grid gap-3">
          <button type="button" onClick={onSimple} className="rounded-xl border p-4 text-left hover:border-[#6366F1]"><strong>{en ? "Simple campaign" : "Campagne simple"}</strong><p className="mt-1 text-sm text-gray-600">{en ? "Prepare one ad for one product." : "Prépare une publicité pour un produit."}</p></button>
          <button type="button" onClick={onPack} className="rounded-xl border p-4 text-left hover:border-[#6366F1]"><strong>{en ? "Variant pack" : "Pack de variantes"}</strong><p className="mt-1 text-sm text-gray-600">{en ? "Compare three distinct creative angles for one product." : "Compare trois angles créatifs distincts pour un même produit."}</p></button>
          {resumeStep !== null && <button type="button" onClick={onResume} className="group relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <span className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100"><RotateCcw size={18}/></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-indigo-950">{en ? "Resume my draft" : "Reprendre mon brouillon"}</span><span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100">{en ? `Step ${resumeStep} / 4` : `Étape ${resumeStep} / 4`}</span></span>
                <span className="mt-1 block text-sm leading-relaxed text-indigo-950/75">{en ? "Pick up where you left off. Nothing is sent to Meta before you confirm." : "Retrouve tes réglages à l’étape enregistrée. Rien n’est envoyé à Meta avant ta confirmation."}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700">{en ? "Continue setup" : "Continuer la configuration"}<ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5"/></span>
              </span>
            </span>
          </button>}
        </div>
      </section>
    </div>, document.body,
  );
}
