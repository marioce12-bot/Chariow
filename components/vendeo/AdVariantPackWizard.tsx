"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ImagePlus, Loader2, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { LaunchProgress } from "@/components/chat/LaunchProgress";
import { packBudgetCents } from "@/lib/ad-variant-packs";
import { buildGeoTargeting, deriveCountries, type ChariowProductLite, type GeoLocation } from "@/components/vendeo/wizard/types";
import { LocationSearchInput } from "@/components/vendeo/wizard/LocationSearchInput";
import type { MetaGenderTarget, MetaInterestTarget } from "@/lib/ad-campaigns/meta-targeting";
import { DEFAULT_META_CTA, META_CTA_LABELS, META_CTA_TYPES, normalizeMetaCta, type MetaCtaType } from "@/lib/meta/cta";
import { imageCreditCost } from "@/lib/studio/credits";
import { uploadCampaignMedia } from "@/lib/media/direct-upload";
import { useI18n } from "@/lib/i18n/i18n";
import { getConnectedVariantPackStores, getVariantPackDraftStep, hasVariantPackDraftProgress, haveThreeChosenFormats, type AdAngle, type VariantFormat } from "@/lib/ad-variant-pack";

const DRAFT_KEY = "vendeo_ad_variant_pack_draft_v1";
const IMAGE_COST = imageCreditCost("hd", "medium");
type Store = { id: string; store_name: string | null; platform: string; connection_status: string | null; is_active?: boolean };
type Variant = { angleId: string; format: VariantFormat | ""; media: string[]; copy: string; callToAction?: MetaCtaType; generating?: boolean; error?: string };
type UploadPreview = { id: string; urls: string[]; done: number; total: number; percent: number };
type Draft = {
  storeId: string; productId: string; objective: string; locations: GeoLocation[];
  minAge: number; maxAge: number; gender: MetaGenderTarget | null;
  interests: MetaInterestTarget[]; advantageAudience: boolean;
  dailyBudget: number; durationDays: number; angles: AdAngle[]; selected: string[];
  variants: Record<string, Variant>; step: number; packId?: string; metaAdAccountId?: string; metaPageId?: string;
  serverPackId?: string; launchRequested?: boolean; dsaBeneficiary: string; dsaPayor: string;
  campaignIds?: Record<string, string>; launched?: Record<string, boolean>; started?: boolean;
};
const defaultLocation: GeoLocation = { key: "BJ", name: "Bénin", type: "country", countryCode: "BJ" };
const DEFAULT: Draft = {
  storeId: "", productId: "", objective: "sales", locations: [defaultLocation],
  minAge: 18, maxAge: 45, gender: null, interests: [], advantageAudience: false,
  dailyBudget: 5, durationDays: 5, angles: [], selected: [], variants: {}, step: 1, dsaBeneficiary: "", dsaPayor: "",
};
const uid = () => crypto.randomUUID();
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
      return { ...DEFAULT, ...saved, dsaBeneficiary: saved.dsaBeneficiary ?? "", dsaPayor: saved.dsaPayor ?? "", objective: "sales", storeId: saved.storeId || storeId, step: getVariantPackDraftStep(saved.step), started: true };
    }
    catch { return { ...DEFAULT, storeId }; }
  });
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<ChariowProductLite[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name?: string | null }[]>([]);
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState(() => draft.metaAdAccountId ?? "");
  const [pageId, setPageId] = useState(() => draft.metaPageId ?? "");
  const [interestQuery, setInterestQuery] = useState("");
  const [interestResults, setInterestResults] = useState<MetaInterestTarget[]>([]);
  const [interestLoading, setInterestLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchPercent, setLaunchPercent] = useState<number | null>(null);
  const [launchState, setLaunchState] = useState<string | null>(null);
  const localObjectUrls = useRef(new Set<string>());
  const stepContentRef = useRef<HTMLElement | null>(null);
  const launchInFlight = useRef(false);
  const notifiedCompletion = useRef(false);
  const onLaunchedRef = useRef(onLaunched);
  onLaunchedRef.current = onLaunched;
  const product = useMemo(() => products.find((row) => row.id === draft.productId) ?? null, [products, draft.productId]);
  const selectedInterests = draft.interests;
  const legacyPackStarted = Object.keys(draft.campaignIds ?? {}).length > 0 || Object.values(draft.launched ?? {}).some(Boolean);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (stepContentRef.current) stepContentRef.current.scrollTop = 0;
  }, [draft.step]);
  useEffect(() => {
    const urls = localObjectUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);
  useEffect(() => {
    try {
      if (ready || !hasVariantPackDraftProgress(draft)) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, started: true }));
    } catch { /* storage unavailable */ }
  }, [draft, ready]);

  useEffect(() => {
    if (!draft.serverPackId || !draft.launchRequested || ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const response = await fetch(`/api/ad-variant-packs/${encodeURIComponent(draft.serverPackId!)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.pack?.status) throw new Error("status unavailable");
        if (cancelled) return;
        setLaunchState(data.pack.status);
        const completed = data.pack.status === "completed" && data.pack.checkpoints?.activated === true && data.progress === 100;
        if (typeof data.progress === "number" && Number.isFinite(data.progress)) setLaunchPercent(completed ? 100 : Math.max(0, Math.min(99, data.progress)));
        if (completed) {
          setLaunching(false); setReady(true); setError("");
          if (!notifiedCompletion.current) { notifiedCompletion.current = true; onLaunchedRef.current(); }
          return;
        }
        if (data.pack.status === "claimed" || (data.pack.status === "draft" && launchInFlight.current)) {
          setLaunching(true); timer = setTimeout(() => void check(), 2000); return;
        }
        setLaunching(false);
        if (data.pack.status === "blocked") {
          setError(typeof data.pack.last_error === "string" && data.pack.last_error ? data.pack.last_error : (en ? "The checks failed before anything was created in Meta. You can correct your pack." : "Les vérifications ont échoué avant toute création dans Meta. Tu peux corriger ton pack."));
        } else {
          setError(en ? "The launch is not confirmed. Check Meta before any new attempt; Vendeo will not resend it automatically." : "Le lancement n’est pas confirmé. Vérifie Meta avant toute nouvelle tentative ; Vendeo ne le renverra pas automatiquement.");
        }
      } catch {
        if (!cancelled) {
          setLaunching(false);
          setError(en ? "The pack status could not be verified. Check Meta before any new attempt." : "L’état du pack n’a pas pu être vérifié. Consulte Meta avant toute nouvelle tentative.");
        }
      }
    };
    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [draft.serverPackId, draft.launchRequested, en, ready]);

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
          setDraft((d) => ({ ...d, metaAdAccountId: selectedAccount.id, dsaBeneficiary: d.dsaBeneficiary || selectedAccount.name || "", dsaPayor: d.dsaPayor || selectedAccount.name || "" }));
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
    setAccountId(id); setPageId(""); const name = accounts.find((account) => account.id === id)?.name ?? ""; setDraft((d) => ({ ...d, metaAdAccountId: id, metaPageId: "", interests: [], dsaBeneficiary: name, dsaPayor: name, started: true }));
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
      patch({ angles, selected, variants: Object.fromEntries(angles.filter((a) => selected.includes(a.id)).map((a) => [a.id, { angleId: a.id, format: "", media: [], copy: a.copy, callToAction: DEFAULT_META_CTA }])), step: 2 });
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur d’analyse."); }
    finally { setLoading(false); }
  };
  const toggleAngle = (id: string) => {
    const selected = draft.selected.includes(id) ? draft.selected.filter((x) => x !== id) : draft.selected.length < 3 ? [...draft.selected, id] : draft.selected;
    const variants = { ...draft.variants };
    if (selected.includes(id) && !variants[id]) {
      variants[id] = { angleId: id, format: "", media: [], copy: draft.angles.find((a) => a.id === id)?.copy ?? "", callToAction: DEFAULT_META_CTA };
    }
    if (!selected.includes(id)) delete variants[id];
    patch({ selected, variants });
  };
  const updateVariant = (id: string, change: Partial<Variant>) => setDraft((d) => ({ ...d, variants: { ...d.variants, [id]: { ...d.variants[id], ...change } }, started: true }));
  const upload = async (id: string, files: File[]) => {
    if (!files.length || busy) return;
    const variant = draft.variants[id];
    if (!variant?.format) return;
    if (variant.format === "video" && files.length > 1) { setError(en ? "Choose one video." : "Choisis une seule vidéo."); return; }
    const video = variant.format === "video";
    if (files.some((file) => ![...(video ? ["video/mp4", "video/quicktime"] : ["image/jpeg", "image/png"])].includes(file.type) || file.size <= 0 || file.size > (video ? 100 : 8) * 1024 * 1024)) { setError(video ? (en ? "Choose an MP4 or MOV video up to 100 MB." : "Choisis une vidéo MP4 ou MOV de 100 Mo maximum.") : (en ? "Choose JPEG or PNG images up to 8 MB each." : "Choisis des images JPEG ou PNG de 8 Mo maximum chacune.")); return; }
    const slots = variant.format === "carousel" ? 5 - variant.media.length : 1;
    if (slots <= 0) { setError(en ? "A carousel can contain up to 5 images." : "Un carrousel peut contenir jusqu’à 5 images."); return; }
    const selectedFiles = files.slice(0, slots);
    const previews = selectedFiles.map((file) => URL.createObjectURL(file));
    previews.forEach((url) => localObjectUrls.current.add(url));
    setBusy(true); setError("");
    setUploadPreview({ id, urls: previews, done: 0, total: selectedFiles.length, percent: 0 });
    try {
      let nextMedia = variant.format === "carousel" ? [...variant.media] : [];
      for (let index = 0; index < selectedFiles.length; index++) {
        setUploadPreview({ id, urls: previews.slice(index), done: index, total: selectedFiles.length, percent: 0 });
        const uploaded = await uploadCampaignMedia(selectedFiles[index], (percent) => {
          setUploadPreview({ id, urls: previews.slice(index), done: index, total: selectedFiles.length, percent });
        });
        if (uploaded.fingerprinted !== true || typeof uploaded.media_asset_id !== "string") throw new Error(en ? "The file was sent but could not be securely registered. Please try again." : "Le fichier a été envoyé mais son enregistrement sécurisé a échoué. Essaie de nouveau.");
        const url = uploaded.secure_url;
        if (typeof url !== "string" || !isWebUrl(url) || !url.startsWith("https://")) throw new Error(en ? "The uploaded media could not be verified." : "Le visuel envoyé n’a pas pu être vérifié.");
        nextMedia = variant.format === "carousel" ? [...nextMedia, url] : [url];
        updateVariant(id, { media: nextMedia });
        URL.revokeObjectURL(previews[index]);
        localObjectUrls.current.delete(previews[index]);
      }
      if (selectedFiles.length < files.length) setError(en ? `Only ${slots} image(s) fit in this carousel.` : `Il ne restait que ${slots} place(s) dans ce carrousel.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Échec de l’envoi du visuel."); }
    finally {
      previews.forEach((url) => { if (localObjectUrls.current.delete(url)) URL.revokeObjectURL(url); });
      setUploadPreview(null);
      setBusy(false);
    }
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
    if (launchInFlight.current || draft.launchRequested || legacyPackStarted || !product || !isWebUrl(product.url) || !product.url.startsWith("https://") || !accountId || !pageId || draft.selected.length !== 3) return;
    if (!haveThreeChosenFormats(draft.selected.map((id) => draft.variants[id]?.format))) return;
    if (!draft.dsaBeneficiary.trim() || draft.dsaBeneficiary.length > 200 || !draft.dsaPayor.trim() || draft.dsaPayor.length > 200) return;
    if (draft.selected.some((id) => !draft.variants[id]?.copy.trim() || !draft.variants[id]?.media.length || (draft.variants[id].format === "carousel" && draft.variants[id].media.length < 2) || draft.variants[id].media.some((url) => !isWebUrl(url) || !url.startsWith("https://")))) return;
    launchInFlight.current = true;
    setBusy(true); setLaunching(true); setLaunchPercent(0); setError("");
    let nextDraft: Draft = { ...draft, packId: draft.packId ?? uid(), metaPageId: pageId, started: true };
    const persist = (next: Draft) => {
      // Refuse launch if the key cannot survive a refresh: otherwise a retry may duplicate a campaign.
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      setDraft(next);
    };
    try {
      persist(nextDraft);
      const body = {
        client_request_id: nextDraft.packId, store_id: draft.storeId, product_id: product.id, product_name: product.name,
        destination_url: product.url, meta_ad_account_id: accountId, meta_page_id: pageId, dsa_beneficiary: draft.dsaBeneficiary, dsa_payor: draft.dsaPayor,
        countries: deriveCountries(draft.locations), geo_targeting: { ...buildGeoTargeting(draft.locations), countries: [...new Set(draft.locations.filter((location) => location.type === "country").map((location) => location.countryCode).filter(Boolean))] },
        meta_targeting: { gender: draft.gender, interests: draft.interests }, advantage_audience: draft.advantageAudience,
        min_age: draft.minAge, max_age: draft.maxAge, daily_budget: draft.dailyBudget, duration_days: draft.durationDays,
        variants: draft.selected.map((id) => ({ id, angle: draft.angles.find((a) => a.id === id)?.title ?? "", format: draft.variants[id].format, text: draft.variants[id].copy, media: draft.variants[id].media, call_to_action: draft.variants[id].callToAction ?? DEFAULT_META_CTA })),
      };
      const create = await fetch("/api/ad-variant-packs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const created = await create.json().catch(() => ({}));
      if (!create.ok || !created.pack?.id) throw new Error(created.error || (en ? "Could not save the pack." : "Impossible d’enregistrer le pack."));
      nextDraft = { ...nextDraft, serverPackId: created.pack.id };
      if (created.pack.status !== "draft") {
        persist({ ...nextDraft, launchRequested: true });
        throw new Error(en ? "This pack was already submitted. Check its status before taking further action." : "Ce pack a déjà été envoyé. Vérifie son état avant toute autre action.");
      }
      // This durable marker is written before the request. A lost response never triggers an automatic retry.
      nextDraft = { ...nextDraft, launchRequested: true };
      persist(nextDraft);
      const launch = await fetch(`/api/ad-variant-packs/${encodeURIComponent(created.pack.id)}/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await launch.json().catch(() => ({}));
      if (!launch.ok) {
        if (result.code === "PACK_LAUNCH_UNAVAILABLE") persist({ ...nextDraft, packId: undefined, serverPackId: undefined, launchRequested: false });
        throw new Error(result.error || (en ? "The launch could not be confirmed. Check Meta before trying again." : "Le lancement n’a pas pu être confirmé. Vérifie Meta avant toute nouvelle tentative."));
      }
      if (result.pack?.status !== "completed" || result.pack?.checkpoints?.activated !== true || result.progress !== 100) throw new Error(en ? "The launch is not yet confirmed. Check its status before taking further action." : "Le lancement n’est pas encore confirmé. Vérifie son état avant toute autre action.");
      setLaunchPercent(100); setReady(true);
      if (!notifiedCompletion.current) { notifiedCompletion.current = true; onLaunchedRef.current(); }
    } catch (e) { setError(e instanceof Error ? e.message : (en ? "The launch could not be confirmed. Check Meta before retrying." : "Le lancement n’a pas pu être vérifié. Vérifie Meta avant de réessayer.")); }
    finally { launchInFlight.current = false; setLaunching(false); setBusy(false); }
  };

  const close = () => {
    try {
      if (hasVariantPackDraftProgress(draft)) localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, started: true }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
    onClose();
  };
  const editBlockedPack = () => {
    if (launchState !== "blocked" || busy) return;
    const next = { ...draft, serverPackId: undefined, packId: undefined, launchRequested: false };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); }
    catch { setError(en ? "Local storage is unavailable; the pack cannot be safely resumed." : "Le stockage local est indisponible ; impossible de reprendre le pack en sécurité."); return; }
    setDraft(next); setLaunchState(null); setLaunchPercent(null); setError("");
  };
  const selectedCountries = deriveCountries(draft.locations);
  const budgetValid = Number.isFinite(draft.dailyBudget) && draft.dailyBudget >= 3 && draft.dailyBudget <= 1000000 && Math.abs(Math.round(draft.dailyBudget * 100) - draft.dailyBudget * 100) < 0.000001;
  const singleAdSetBudget = budgetValid ? (packBudgetCents(draft.dailyBudget) / 100).toFixed(2) : null;
  const variantsValid = haveThreeChosenFormats(draft.selected.map((id) => draft.variants[id]?.format)) && draft.selected.every((id) => {
    const variant = draft.variants[id];
    return Boolean(variant?.copy.trim() && !variant.generating && variant.media.length && variant.media.every((url) => isWebUrl(url) && url.startsWith("https://")) && (variant.format === "carousel" ? variant.media.length >= 2 && variant.media.length <= 5 : variant.media.length === 1));
  });
  const dsaNamesValid = Boolean(draft.dsaBeneficiary.trim() && draft.dsaBeneficiary.length <= 200 && draft.dsaPayor.trim() && draft.dsaPayor.length <= 200);
  const settingsValid = Boolean(dsaNamesValid && product && isWebUrl(product.url) && product.url.startsWith("https://") && accountId && draft.locations.length && selectedCountries.length && Number.isInteger(draft.minAge) && draft.minAge >= 18 && Number.isInteger(draft.maxAge) && draft.maxAge >= draft.minAge && draft.maxAge <= 65 && budgetValid && Number.isInteger(draft.durationDays) && draft.durationDays >= 1 && draft.durationDays <= 90);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex min-w-0 flex-col bg-black/40 sm:items-center sm:justify-center">
      <div role="dialog" aria-modal="true" aria-labelledby="pack-title" className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-white text-gray-900 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4 sm:px-5"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#6366F1]">VENDEO · META ADS</p><h2 id="pack-title" className="break-words text-lg font-bold">{en ? "Variant pack" : "Pack de variantes"}</h2></div><button type="button" disabled={busy && !draft.launchRequested} aria-label={en ? "Close" : "Fermer"} onClick={close} className="shrink-0 rounded-full p-2 text-gray-500 disabled:opacity-40"><X size={18}/></button></header>
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b px-4 py-3 text-xs sm:grid-cols-4 sm:px-5">{[en ? "Setup" : "Réglages", "Angles", en ? "Creatives" : "Visuels", en ? "Review" : "Récapitulatif"].map((label, i) => <span key={label} aria-current={draft.step === i + 1 ? "step" : undefined} className={`min-w-0 rounded-full px-3 py-1.5 ${draft.step === i + 1 ? "bg-[#EEF2FF] font-bold text-[#3730A3]" : "bg-gray-100 text-gray-500"}`}>{i + 1}. {label}</span>)}</div>
        <main ref={stepContentRef} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {launchState === "blocked" && !busy && <button type="button" onClick={editBlockedPack} className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-800">{en ? "Correct my pack" : "Corriger mon pack"}</button>}
          {legacyPackStarted && !ready && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{en ? "An older version of this pack already created campaign drafts. Check Meta before creating a new pack; this draft cannot be relaunched automatically." : "Une ancienne version de ce pack a déjà créé des brouillons de campagne. Vérifie Meta avant de créer un nouveau pack ; ce brouillon ne sera pas relancé automatiquement."}</p>}
          {ready ? <div className="space-y-3 rounded-2xl bg-emerald-50 p-5 text-emerald-900"><LaunchProgress complete label={en ? "Campaign sent to Meta" : "Campagne envoyée à Meta"}/><h3 className="font-bold">{en ? "Pack launched" : "Pack lancé"}</h3><p className="text-sm">{en ? "One Meta campaign with one ad set and three ads was sent. Check its delivery status in Meta." : "Une campagne Meta avec un seul ensemble de publicités contenant trois publicités a été envoyée. Vérifie son statut de diffusion dans Meta."}</p><button type="button" className="rounded-lg bg-[#6366F1] px-4 py-2 font-semibold text-white" onClick={onClose}>{en ? "Close" : "Fermer"}</button></div> : null}

          {!ready && draft.step === 1 && <>
            <p className="text-sm text-gray-600">{en ? "Choose your connected Shopify or Chariow store, product and Meta campaign settings. Nothing is created until you confirm the final review." : "Choisis une boutique Shopify ou Chariow connectée, un produit et les paramètres Meta. Rien n’est créé avant ta confirmation finale."}</p>
            <label className="grid min-w-0 gap-1 text-sm font-semibold">{en ? "Store" : "Boutique"}<select className="w-full min-w-0 rounded-lg border p-2" value={draft.storeId} onChange={(e) => patch({ storeId: e.target.value, productId: "" })}>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name || store.id} · {store.platform === "shopify" ? "Shopify" : "Chariow"}</option>)}</select></label>
            {!stores.length && <p role="status" className="text-sm text-amber-800">{en ? "Connect a Shopify or Chariow store before continuing." : "Connecte une boutique Shopify ou Chariow avant de continuer."}</p>}
            <label className="grid min-w-0 gap-1 text-sm font-semibold">{en ? "Product" : "Produit"}<select className="w-full min-w-0 rounded-lg border p-2" value={draft.productId} onChange={(e) => patch({ productId: e.target.value })}><option value="">{en ? "Choose a product" : "Choisir un produit"}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            {product && (!isWebUrl(product.url) || !product.url.startsWith("https://")) && <p role="alert" className="text-xs text-amber-800">{en ? "This product needs a valid public HTTPS URL before it can be sent to Meta." : "Ce produit doit avoir une URL publique HTTPS valide avant d’être envoyé à Meta."}</p>}
            <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0 text-sm"><span className="block font-semibold">{en ? "Objective" : "Objectif"}</span><p className="mt-1 rounded-lg bg-gray-50 p-2">{en ? "Sales" : "Ventes"}</p><p className="mt-1 text-xs text-gray-500">{en ? "Traffic is used automatically only if this ad account has no pixel." : "Trafic est utilisé automatiquement uniquement si ce compte publicitaire n’a pas de pixel."}</p></div><label className="grid min-w-0 gap-1 text-sm">{en ? "Meta ad account" : "Compte publicitaire Meta"}<select className="w-full min-w-0 rounded-lg border p-2" value={accountId} onChange={(e) => selectAccount(e.target.value)}><option value="">{en ? "Choose an account" : "Choisir un compte"}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name ?? account.id}</option>)}</select></label></div>
            <div className="space-y-2"><p className="text-sm font-semibold">{en ? "Audience locations" : "Lieux de l’audience"}</p><LocationSearchInput value={draft.locations} onChange={(locations) => patch({ locations })} metaAccountId={accountId} platform="meta"/><p className="text-xs text-gray-500">{en ? "Search countries, regions and cities supported by Meta." : "Recherche des pays, régions et villes proposés par Meta."}</p></div>
            <div className="grid grid-cols-2 gap-3"><label className="grid min-w-0 gap-1 text-sm">{en ? "Age from" : "Âge de"}<input className="w-full min-w-0 rounded-lg border p-2" type="number" min="18" max="65" value={draft.minAge} onChange={(e) => patch({ minAge: Math.min(65, Math.max(18, Number(e.target.value))) })}/></label><label className="grid min-w-0 gap-1 text-sm">{en ? "to" : "à"}<input className="w-full min-w-0 rounded-lg border p-2" type="number" min={draft.minAge} max="65" value={draft.maxAge} onChange={(e) => patch({ maxAge: Math.min(65, Math.max(draft.minAge, Number(e.target.value))) })}/></label></div>
            <fieldset className="space-y-2"><legend className="text-sm font-semibold">{en ? "Gender (optional)" : "Genre (facultatif)"}</legend><div className="flex flex-wrap gap-2">{([{ value: null, label: en ? "All genders" : "Femmes et hommes" }, { value: "female", label: en ? "Women only" : "Femmes uniquement" }, { value: "male", label: en ? "Men only" : "Hommes uniquement" }] as const).map((option) => <label key={option.value ?? "all"} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${draft.gender === option.value ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}><input type="radio" name="variant-pack-gender" checked={draft.gender === option.value} onChange={() => patch({ gender: option.value })}/>{option.label}</label>)}</div><p className="text-xs text-gray-500">{en ? "Meta does not offer sexual-orientation targeting." : "Meta ne propose pas de ciblage publicitaire par orientation sexuelle."}</p></fieldset>
            <div className="space-y-2"><label htmlFor="pack-interest-search" className="block text-sm font-semibold">{en ? "Meta interests (optional, up to 10)" : "Centres d’intérêt Meta (facultatif, jusqu’à 10)"}</label><p className="text-xs text-gray-500">{en ? "Search and select only interests returned by Meta’s catalog." : "Recherche et sélectionne uniquement des intérêts renvoyés par le catalogue Meta."}</p><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input id="pack-interest-search" type="search" autoComplete="off" disabled={!accountId} value={interestQuery} onChange={(e) => setInterestQuery(e.target.value)} placeholder={en ? "Search Meta interests" : "Rechercher dans le catalogue Meta"} className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm disabled:bg-gray-100"/></div>{!accountId && <p className="text-xs text-gray-500">{en ? "Select a Meta account to search its catalog." : "Choisis un compte Meta pour rechercher dans son catalogue."}</p>}{interestQuery.trim().length >= 2 && <div className="max-h-48 overflow-y-auto rounded-lg border">{interestLoading ? <p className="p-2 text-sm text-gray-500">{en ? "Searching Meta…" : "Recherche auprès de Meta…"}</p> : interestResults.filter((item) => !selectedInterests.some((selected) => selected.id === item.id)).map((item) => <button key={item.id} type="button" onClick={() => addInterest(item)} disabled={selectedInterests.length >= 10} className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-indigo-50 disabled:opacity-50">{item.name}</button>)}</div>}{selectedInterests.length > 0 && <div className="flex flex-wrap gap-2">{selectedInterests.map((item) => <span key={item.id} className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800">{item.name}<button type="button" onClick={() => removeInterest(item.id)} aria-label={`${en ? "Remove" : "Retirer"} ${item.name}`} className="font-bold">×</button></span>)}</div>}</div>
            <label className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" checked={draft.advantageAudience} onChange={(e) => patch({ advantageAudience: e.target.checked, ...(e.target.checked ? { maxAge: 65 } : {}) })} className="mt-0.5"/><span><strong className="block text-sm">{en ? "Advantage+ audience" : "Audience Advantage+"}</strong><span className="text-xs text-gray-500">{draft.advantageAudience ? (en ? "Meta may expand beyond selected audience settings; max age is 65." : "Meta peut élargir l’audience au-delà de tes critères; l’âge maximal est fixé à 65 ans.") : (en ? "Off: Meta uses your selected locations, age and interests." : "Désactivée : Meta utilise les lieux, l’âge et les intérêts choisis.")}</span></span></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm">{en ? "Total daily budget for pack (USD)" : "Budget quotidien total du pack (USD)"}<input className="w-full min-w-0 rounded-lg border p-2" type="number" min="3" step="0.01" value={draft.dailyBudget} onChange={(e) => patch({ dailyBudget: Number(e.target.value) })}/></label><label className="grid min-w-0 gap-1 text-sm">{en ? "Duration (days)" : "Durée (jours)"}<input className="w-full min-w-0 rounded-lg border p-2" type="number" min="1" max="90" value={draft.durationDays} onChange={(e) => patch({ durationDays: Number(e.target.value) })}/></label></div>
            {!budgetValid && <p role="alert" className="text-xs text-amber-800">{en ? "Enter a total daily budget of at least USD 3 with at most two decimal places." : "Indique un budget quotidien total d’au moins 3 USD, avec deux décimales au maximum."}</p>}
            <p className="text-xs text-gray-600">{en ? "The beneficiary is the person or business whose offer is promoted; the payer is the person or business financing the ad. Vendeo pre-fills the ad-account name as a suggestion. These names are sent to Meta for ad-transparency information and can be different." : "Le bénéficiaire est la personne ou l’entreprise dont l’offre est mise en avant ; le payeur est celle qui finance la publicité. Vendeo préremplit le nom du compte publicitaire comme suggestion. Ces noms sont transmis à Meta pour ses informations de transparence et peuvent être différents."}</p>
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm font-semibold">{en ? "Ad beneficiary" : "Bénéficiaire de la publicité"}<input required maxLength={200} className="w-full min-w-0 rounded-lg border p-2 font-normal" value={draft.dsaBeneficiary} onChange={(e) => patch({ dsaBeneficiary: e.target.value })}/></label><label className="grid min-w-0 gap-1 text-sm font-semibold">{en ? "Ad payer" : "Personne ou entreprise qui paie"}<input required maxLength={200} className="w-full min-w-0 rounded-lg border p-2 font-normal" value={draft.dsaPayor} onChange={(e) => patch({ dsaPayor: e.target.value })}/></label></div>
            {!dsaNamesValid && <p role="alert" className="text-xs text-amber-800">{en ? "Enter both names (1–200 characters)." : "Saisis les deux noms (1 à 200 caractères)."}</p>}
            {draft.durationDays === 1 && <p className="text-xs text-gray-600">{en ? "For one day, Vendeo schedules 25 hours to satisfy Meta’s minimum duration." : "Pour un jour, Vendeo prévoit 25 heures afin de respecter la durée minimale de Meta."}</p>}
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
              if (!angle || !variant) return null;
              return <section key={id} className="min-w-0 space-y-3 rounded-xl border p-3" aria-busy={uploadPreview?.id === id}>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="min-w-0 break-words font-bold">{angle.title}</h3>
                  <label className="grid min-w-0 gap-1 text-xs sm:w-48">{en ? "Format" : "Format"}
                    <select className="w-full min-w-0 rounded-lg border p-2" disabled={busy || variant.generating} value={variant.format} onChange={(e) => updateVariant(id, { format: e.target.value as Variant["format"], media: [] })}>
                      <option value="" disabled>{en ? "Choose a format" : "Choisir un format"}</option>
                      <option value="image">Image</option>
                      <option value="video">Vidéo</option>
                      <option value="carousel">Carrousel</option>
                    </select>
                  </label>
                </div>
                <label className="grid min-w-0 gap-1 text-xs font-semibold">{en ? "Ad text (editable)" : "Texte publicitaire (modifiable)"}<textarea className="w-full min-w-0 rounded-lg border p-2 text-sm" rows={3} value={variant.copy} onChange={(e) => updateVariant(id, { copy: e.target.value })}/></label>
                <label className="grid min-w-0 gap-1 text-xs font-semibold">{en ? "Call to action button" : "Bouton d’appel à l’action"}<select aria-label={`${en ? "Call to action" : "Bouton d’appel à l’action"} — ${angle.title}`} disabled={busy || draft.launchRequested} className="w-full min-w-0 rounded-lg border p-2 text-sm font-normal" value={variant.callToAction ?? DEFAULT_META_CTA} onChange={(e) => { const cta = normalizeMetaCta(e.target.value); if (cta) updateVariant(id, { callToAction: cta }); }}>{META_CTA_TYPES.map((cta) => <option key={cta} value={cta}>{META_CTA_LABELS[cta][en ? "en" : "fr"]}</option>)}</select><span className="font-normal text-gray-500">{en ? "Shown under this ad and opens your product link." : "Affiché sous cette publicité et ouvre le lien de ton produit."}</span></label>
                {!variant.format ? <p className="text-xs text-gray-500">{en ? "Choose this variant’s format before adding media." : "Choisis le format de cette variante avant d’ajouter un visuel."}</p> : <>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${busy || variant.generating ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><ImagePlus size={14}/>{en ? "Add your media" : "Ajouter tes visuels"}<input className="sr-only" type="file" disabled={busy || variant.generating} accept={variant.format === "video" ? "video/mp4,video/quicktime" : "image/jpeg,image/png"} multiple={variant.format === "carousel"} onChange={(e) => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; void upload(id, files); }}/></label>
                    {variant.format !== "video" && <button type="button" disabled={busy || variant.generating} onClick={() => void generate(id)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-50">{variant.generating ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} {en ? `Generate image · ${IMAGE_COST} credits` : `Générer une image · ${IMAGE_COST} crédits`}</button>}
                  </div>
                  {uploadPreview?.id === id && <div className="rounded-lg bg-indigo-50 p-3"><div className="flex flex-wrap gap-2">{uploadPreview.urls.map((url, index) => variant.format === "video" ? <video key={url} src={url} className="h-20 w-20 rounded object-cover" muted/> : <img key={url} src={url} alt={`${en ? "Selected preview" : "Aperçu sélectionné"} ${uploadPreview.done + index + 1}`} className="h-20 w-20 rounded object-cover"/>)}</div><p role="status" className="mt-2 flex items-center gap-2 text-xs font-medium text-indigo-900"><Loader2 size={14} className="shrink-0 animate-spin"/>{uploadPreview.percent >= 100 ? (en ? "Checking the uploaded file…" : "Vérification du fichier envoyé…") : `${en ? "Uploading" : "Envoi en cours"} ${uploadPreview.done + 1}/${uploadPreview.total}${uploadPreview.percent > 0 ? ` · ${uploadPreview.percent} %` : "…"}`}</p></div>}
                  {variant.media.length > 0 && <div className="flex min-w-0 flex-wrap gap-2">{variant.media.map((url, i) => <div key={`${url}-${i}`} className="flex min-w-0 items-center gap-2 rounded bg-gray-50 p-2 text-xs">{variant.format === "video" ? <video src={url} className="h-16 w-16 rounded object-cover" muted/> : <img src={url} alt={`${en ? "Ad image" : "Visuel publicitaire"} ${i + 1}`} className="h-16 w-16 rounded object-cover"/>}<button type="button" disabled={busy || variant.generating} className="disabled:opacity-50" onClick={() => updateVariant(id, { media: variant.media.filter((_, j) => j !== i) })}>{en ? "Remove" : "Retirer"}</button></div>)}</div>}
                  {variant.format === "carousel" && <p className="text-xs text-gray-500">{variant.media.length}/5 {en ? "images" : "images"}{variant.media.length < 2 ? (en ? " — add at least one more." : " — ajoute au moins une image de plus.") : null}</p>}
                </>}
                {variant.error && <p role="alert" className="text-xs text-red-700">{variant.error}</p>}
              </section>;
            })}
          </>}

          {!ready && draft.step === 4 && <>
            <h3 className="font-bold">{en ? "Review your pack" : "Vérifie ton pack"}</h3><p className="text-sm text-gray-600">{en ? "Nothing is sent to Meta until you explicitly confirm. The platform bills the ad account, separately from Studio credits." : "Rien ne sera envoyé à Meta sans ta confirmation explicite. La plateforme facture le compte publicitaire, séparément des crédits Studio."}</p>
            <section className="rounded-xl border border-gray-200 p-3" aria-labelledby="pack-review-product"><h4 id="pack-review-product" className="text-sm font-bold">{en ? "Product and objective" : "Produit et objectif"}</h4><p className="mt-1 break-words text-sm"><strong>{product?.name}</strong></p><p className="text-xs text-gray-600">{en ? "Sales (Traffic if no pixel)" : "Ventes (Trafic si aucun pixel)"} · {accountId ? (accounts.find((a) => a.id === accountId)?.name ?? "Meta") : (en ? "Meta account required" : "Compte Meta requis")}</p></section>
            <section className="space-y-2" aria-labelledby="pack-review-creatives"><div><h4 id="pack-review-creatives" className="text-sm font-bold">{en ? "Chosen creatives" : "Visuels des variantes"}</h4><p className="text-xs text-gray-500">{en ? "Check each image or video, ad text and call to action." : "Vérifie chaque image ou vidéo, son texte publicitaire et son bouton."}</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{draft.selected.map((id) => { const angle = draft.angles.find((a) => a.id === id); const variant = draft.variants[id]; if (!angle || !variant) return null; return <article key={id} className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white"><div className={`grid gap-1 p-2 ${variant.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{variant.media.map((url, i) => <div key={`${url}-${i}`} className="overflow-hidden rounded-lg bg-gray-50">{variant.format === "video" ? <video src={url} controls preload="metadata" aria-label={`${en ? "Video preview" : "Aperçu vidéo"} — ${angle.title}`} className="aspect-square w-full object-contain"/> : <img src={url} alt={`${en ? "Ad preview" : "Aperçu de la publicité"} — ${angle.title} ${i + 1}`} className="aspect-square w-full object-contain"/>}</div>)}</div><div className="space-y-2 p-3"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><strong className="min-w-0 break-words text-sm">{angle.title}</strong><span className="shrink-0 text-[10px] uppercase text-gray-500">{variant.format}</span></div><p className="whitespace-pre-wrap break-words text-xs text-gray-700">{variant.copy}</p><p className="inline-flex rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800">{META_CTA_LABELS[variant.callToAction ?? DEFAULT_META_CTA][en ? "en" : "fr"]}</p></div></article>; })}</div></section>
            <section className="rounded-xl border border-gray-200 p-3" aria-labelledby="pack-review-audience"><h4 id="pack-review-audience" className="text-sm font-bold">{en ? "Audience" : "Audience ciblée"}</h4><dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div className="min-w-0"><dt className="text-xs font-semibold text-gray-500">{en ? "Locations" : "Pays et zones"}</dt><dd className="mt-1 break-words">{draft.locations.map((location) => location.name).join(" · ")}</dd></div><div><dt className="text-xs font-semibold text-gray-500">{en ? "Age and gender" : "Âge et genre"}</dt><dd className="mt-1">{draft.minAge}–{draft.maxAge} · {draft.gender === "female" ? (en ? "Women only" : "Femmes uniquement") : draft.gender === "male" ? (en ? "Men only" : "Hommes uniquement") : (en ? "All genders" : "Femmes et hommes")}</dd></div><div className="min-w-0"><dt className="text-xs font-semibold text-gray-500">{en ? "Interests" : "Centres d’intérêt"}</dt><dd className="mt-1 break-words">{selectedInterests.length ? selectedInterests.map((interest) => interest.name).join(", ") : (en ? "No interest filter" : "Sans filtre par intérêt")}</dd></div><div><dt className="text-xs font-semibold text-gray-500">{en ? "Audience expansion" : "Audience Advantage+"}</dt><dd className="mt-1">{draft.advantageAudience ? (en ? "On — Meta can expand" : "Activée — Meta peut élargir l’audience") : (en ? "Off — selected criteria" : "Désactivée — critères choisis")}</dd></div></dl></section>
            <section className="rounded-xl border border-gray-200 p-3" aria-labelledby="pack-review-budget"><h4 id="pack-review-budget" className="text-sm font-bold">{en ? "Budget and duration" : "Budget et durée"}</h4><dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-gray-500">{en ? "Total per day" : "Budget quotidien total"}</dt><dd className="mt-1 font-semibold">{Number(draft.dailyBudget).toFixed(2)} USD / {en ? "day" : "jour"}</dd></div><div><dt className="text-xs font-semibold text-gray-500">{en ? "Duration and planned total" : "Durée et total prévu"}</dt><dd className="mt-1">{draft.durationDays} {en ? "days" : "jours"} · {(draft.dailyBudget * draft.durationDays).toFixed(2)} USD {en ? "planned total" : "au total prévu"}</dd></div><div className="sm:col-span-2"><dt className="text-xs font-semibold text-gray-500">{en ? "Daily budget for the single ad set" : "Budget quotidien de l’ensemble unique"}</dt><dd className="mt-1 break-words font-semibold">{singleAdSetBudget ? `${singleAdSetBudget} USD/${en ? "day" : "jour"}` : (en ? "Budget unavailable" : "Budget indisponible")}</dd></div></dl><p className="mt-2 text-xs text-gray-500">{en ? "The one ad set receives the full daily budget." : "L’ensemble unique reçoit le budget quotidien complet."}</p></section>
            <section className="rounded-xl border border-gray-200 p-3" aria-labelledby="pack-review-transparency"><h4 id="pack-review-transparency" className="text-sm font-bold">{en ? "Ad transparency names" : "Informations de transparence"}</h4><dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div className="min-w-0"><dt className="text-xs font-semibold text-gray-500">{en ? "Beneficiary — whose offer is promoted" : "Bénéficiaire — offre mise en avant"}</dt><dd className="mt-1 break-words">{draft.dsaBeneficiary}</dd></div><div className="min-w-0"><dt className="text-xs font-semibold text-gray-500">{en ? "Payer — who funds the ad" : "Payeur — qui finance la publicité"}</dt><dd className="mt-1 break-words">{draft.dsaPayor}</dd></div></dl><p className="mt-2 text-xs text-gray-500">{en ? "These names are sent to Meta and may be the same or different." : "Ces noms sont transmis à Meta ; ils peuvent être identiques ou différents."}</p></section>
            {draft.durationDays === 1 && <p className="text-xs text-gray-600">{en ? "The one-day schedule lasts 25 hours to satisfy Meta’s minimum duration." : "Pour respecter le minimum de Meta, la durée prévue pour un jour est de 25 heures."}</p>}
            {draft.angles.some((a) => a.recommended && !draft.selected.includes(a.id)) && <p className="text-xs text-gray-500">{en ? "You changed Vendeo’s recommended angles." : "Tu as modifié les angles recommandés par Vendeo."}</p>}
            <label className="grid min-w-0 gap-1 text-sm font-semibold">{en ? "Facebook page" : "Page Facebook"}<select disabled={busy || draft.launchRequested} className="w-full min-w-0 rounded-lg border p-2" value={pageId} onChange={(e) => { setPageId(e.target.value); patch({ metaPageId: e.target.value }); }}><option value="">{en ? "Choose a page" : "Choisir une page"}</option>{pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label>
            <p className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900">{en ? "One campaign will contain one ad set with three ads. If this ad account has no pixel, its objective automatically becomes Traffic." : "Une seule campagne contiendra un ensemble de publicités et trois publicités. L’ensemble recevra le budget quotidien complet. Si ce compte publicitaire n’a aucun pixel, l’objectif devient automatiquement Trafic."}</p>
          </>}
        </main>
        {!ready && <footer className="flex shrink-0 items-center justify-between gap-3 border-t bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <button type="button" disabled={busy || loading || draft.launchRequested} className="shrink-0 text-sm text-gray-600 disabled:opacity-40" onClick={() => draft.step === 1 ? close() : patch({ step: draft.step - 1 })}>{en ? "Back" : "Retour"}</button>
          {draft.step < 4 ? <button type="button" disabled={busy || loading || draft.launchRequested || (draft.step === 1 ? !settingsValid : draft.step === 2 ? draft.selected.length !== 3 : !variantsValid)} onClick={() => draft.step === 1 ? (patch({ step: 2 }), void analyze()) : patch({ step: draft.step + 1 })} className="min-w-0 rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{loading ? (en ? "Analyzing…" : "Analyse…") : (en ? "Continue" : "Continuer")}</button> : <button type="button" disabled={busy || Boolean(draft.launchRequested) || legacyPackStarted || !settingsValid || !pageId || draft.selected.length !== 3 || !variantsValid} onClick={() => void saveAndLaunch()} className="min-w-0 rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? (en ? "Launching…" : "Lancement…") : (en ? "Confirm and launch" : "Confirmer et lancer")}</button>}
        </footer>}
        {launching && !ready && <div data-testid="pack-launch-overlay" className="fixed inset-0 z-[11000] pointer-events-none grid place-items-center bg-gray-950/65 px-4 py-6" role="status" aria-live="polite"><div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl sm:p-6"><LaunchProgress label={en ? "Sending your campaign to Meta…" : "Envoi de ta campagne à Meta…"} indeterminate={launchPercent === null} progress={launchPercent ?? undefined} subtitle={en ? "Confirmed creation steps" : "Étapes de création confirmées"}/></div></div>}
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
