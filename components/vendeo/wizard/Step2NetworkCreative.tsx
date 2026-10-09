"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, ImagePlus, Loader2, Pencil, Sparkles, X } from "lucide-react";
import type { Placement, Platform, WizardState } from "./types";
import { isAdPlatformAllowed, type PlanId } from "@/lib/plans";
import { useI18n } from "@/lib/i18n/i18n";

export interface Step2FooterState {
  backLabel: string;
  onBack: () => void;
  nextLabel?: string;
  onNext?: () => void;
  nextDisabled?: boolean;
}

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onFooterChange: (footer: Step2FooterState) => void;
  onBackToStep1: () => void;
  onAdvanceToStep3: () => void;
  plan: PlanId;
}

type FieldId = "adSetName" | "network" | "account" | "placement" | "adName" | "media" | "content" | "identity";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type MetaAccountOption = { id: string; name: string | null; currency: string };
type MetaPageOption = { id: string; name: string };
type TikTokAccountOption = { id: string; name: string | null };
type PinterestAccountOption = { id: string; name: string | null };

/**
 * Étape 2/5 — "Ensemble de publicités" + "Publicité", façon Meta Ads Manager :
 * deux écrans résumés (lignes + crayon) avec un breadcrumb en haut, chaque
 * crayon ouvrant un vrai sous-écran plein cadre pour éditer un seul champ.
 *
 * Volontairement absents (vs. Meta Ads Manager) :
 * - l'écran "Campagne" (nom / budget / catégorie publicitaire spéciale) :
 *   le budget est réglé à l'Étape 4 (Estimation), et Vendeo n'a pas besoin
 *   d'un nom de campagne distinct du produit choisi à l'Étape 1.
 * - le choix d'objectif (Notoriété / Trafic / Ventes / …) : figé sur "Ventes"
 *   (state.objective reste "sales", cf. DEFAULT_WIZARD_STATE dans types.ts),
 *   Vendeo n'a qu'un seul entonnoir (produit → achat sur la boutique).
 * - la ligne "Programmation" (durée) : réglée à l'Étape 4 (Budget), qui est
 *   son seul et unique endroit d'édition — l'afficher ici en lecture seule
 *   n'apportait rien et créait de la confusion ("pourquoi c'est affiché mais
 *   pas modifiable ici ?").
 */
export function Step2NetworkCreative({ state, patch, onFooterChange, onBackToStep1, onAdvanceToStep3, plan }: StepProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "video" | null>(null);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const [subStep, setSubStep] = useState<"adset" | "ad">("adset");
  const [editingField, setEditingField] = useState<FieldId | null>(null);

  // Compte publicitaire Meta (Ensemble de publicités) et page Facebook
  // (Publicité → Identité), nécessaires pour que Meta accepte la campagne.
  const [metaAccounts, setMetaAccounts] = useState<MetaAccountOption[]>([]);
  const [loadingMetaAccounts, setLoadingMetaAccounts] = useState(false);
  const [metaAccountsError, setMetaAccountsError] = useState<string | null>(null);
  const [metaPages, setMetaPages] = useState<MetaPageOption[]>([]);
  const [loadingMetaPages, setLoadingMetaPages] = useState(false);
  const [metaPagesError, setMetaPagesError] = useState<string | null>(null);
  const [tiktokAccounts, setTikTokAccounts] = useState<TikTokAccountOption[]>([]);
  const [loadingTikTokAccounts, setLoadingTikTokAccounts] = useState(false);
  const [tiktokAccountsError, setTikTokAccountsError] = useState<string | null>(null);
  const [pinterestAccounts, setPinterestAccounts] = useState<PinterestAccountOption[]>([]);
  const [loadingPinterestAccounts, setLoadingPinterestAccounts] = useState(false);
  const [pinterestAccountsError, setPinterestAccountsError] = useState<string | null>(null);

  // Pré-remplissage depuis le produit choisi à l'Étape 1 (nom d'ensemble,
  // nom de pub, texte d'annonce, titre, lien de destination).
  useEffect(() => {
    if (!state.product) return;
    const patchIfEmpty: Partial<WizardState> = {};
    if (!state.adSetName) patchIfEmpty.adSetName = `Ensemble pub — ${state.product.name}`;
    if (!state.adName) patchIfEmpty.adName = `Publicité — ${state.product.name}`;
    if (!state.adText) {
      patchIfEmpty.adText = state.product.description
        ? stripHtml(state.product.description).slice(0, 200)
        : `Découvre ${state.product.name} 🔥`;
    }
    if (!state.title) patchIfEmpty.title = state.product.name;
    if (!state.destinationUrl && state.product.url) patchIfEmpty.destinationUrl = state.product.url;
    if (Object.keys(patchIfEmpty).length > 0) patch(patchIfEmpty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.product]);

  useEffect(() => {
    if (state.platform !== "meta" || metaAccounts.length > 0 || loadingMetaAccounts) return;
    setLoadingMetaAccounts(true);
    setMetaAccountsError(null);
    fetch("/api/integrations/meta/accounts")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(en ? "Unable to load your Meta Ads accounts" : "Impossible de charger tes comptes Meta Ads"))))
      .then((data) => {
        const accounts: MetaAccountOption[] = data.accounts ?? [];
        setMetaAccounts(accounts);
        if (accounts.length === 1 && !state.metaAdAccountId) patch({ metaAdAccountId: accounts[0].id });
        if (accounts.length === 0) setMetaAccountsError(en ? "No Meta Ads account connected. Connect one from Settings before launching an ad." : "Aucun compte Meta Ads connecté. Connecte-en un depuis Paramètres avant de lancer une pub.");
      })
      .catch((err) => setMetaAccountsError(err instanceof Error ? err.message : en ? "Unable to load your Meta Ads accounts" : "Impossible de charger tes comptes Meta Ads"))
      .finally(() => setLoadingMetaAccounts(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.platform]);

  useEffect(() => {
    if (state.platform !== "meta" || !state.metaAdAccountId) return;
    setLoadingMetaPages(true);
    setMetaPagesError(null);
    setMetaPages([]);
    fetch(`/api/integrations/meta/resources?account_id=${encodeURIComponent(state.metaAdAccountId)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || (en ? "Unable to load the Facebook pages for this account" : "Impossible de charger les pages Facebook de ce compte"));
        const pages: MetaPageOption[] = data.pages ?? [];
        setMetaPages(pages);
        if (pages.length === 1) patch({ metaPageId: pages[0].id });
        else if (state.metaPageId && !pages.some((page) => page.id === state.metaPageId)) patch({ metaPageId: undefined });
        if (pages.length === 0) {
          setMetaPagesError(data.pages_error || (en ? "No Facebook page found for this ad account." : "Aucune page Facebook trouvée sur ce compte publicitaire."));
        }
      })
      .catch((err) => setMetaPagesError(err instanceof Error ? err.message : en ? "Unable to load Facebook pages" : "Impossible de charger les pages Facebook"))
      .finally(() => setLoadingMetaPages(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.platform, state.metaAdAccountId]);

  useEffect(() => {
    if (state.platform !== "tiktok" || tiktokAccounts.length > 0 || loadingTikTokAccounts) return;
    setLoadingTikTokAccounts(true);
    setTikTokAccountsError(null);
    fetch("/api/integrations/tiktok/accounts")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(en ? "Unable to load your TikTok Ads accounts" : "Impossible de charger tes comptes TikTok Ads"))))
      .then((data) => {
        const accounts: TikTokAccountOption[] = data.accounts ?? [];
        setTikTokAccounts(accounts);
        if (accounts.length === 1 && !state.tiktokAdAccountId) patch({ tiktokAdAccountId: accounts[0].id });
        if (accounts.length === 0) setTikTokAccountsError(en ? "No TikTok Ads account connected. Connect one from Settings before launching an ad." : "Aucun compte TikTok Ads connecté. Connecte-en un depuis Paramètres avant de lancer une pub.");
      })
      .catch((err) => setTikTokAccountsError(err instanceof Error ? err.message : en ? "Unable to load your TikTok Ads accounts" : "Impossible de charger tes comptes TikTok Ads"))
      .finally(() => setLoadingTikTokAccounts(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.platform]);

  useEffect(() => {
    if (state.platform !== "pinterest" || pinterestAccounts.length > 0 || loadingPinterestAccounts) return;
    setLoadingPinterestAccounts(true);
    setPinterestAccountsError(null);
    fetch("/api/integrations/pinterest/accounts")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(en ? "Unable to load your Pinterest Ads accounts" : "Impossible de charger tes comptes Pinterest Ads"))))
      .then((data) => {
        const accounts: PinterestAccountOption[] = data.accounts ?? [];
        setPinterestAccounts(accounts);
        if (accounts.length === 1 && state.pinterestAdAccountId !== accounts[0].id) patch({ pinterestAdAccountId: accounts[0].id });
        if (accounts.length === 0) setPinterestAccountsError(en ? "No Pinterest Ads account connected. Connect one from Settings before launching an ad." : "Aucun compte Pinterest Ads connecté. Connecte-en un depuis Paramètres avant de lancer une pub.");
      })
      .catch((err) => setPinterestAccountsError(err instanceof Error ? err.message : en ? "Unable to load your Pinterest Ads accounts" : "Impossible de charger tes comptes Pinterest Ads"))
      .finally(() => setLoadingPinterestAccounts(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.platform]);
  const adSetValid = state.platform === "meta" ? Boolean(state.metaAdAccountId) : state.platform === "tiktok" ? Boolean(state.tiktokAdAccountId) : Boolean(state.pinterestAdAccountId);
  const adValid =
    state.adName.trim().length > 0 &&
    state.mediaUrl.trim().length > 0 &&
    !uploading &&
    state.adText.trim().length > 0 &&
    state.destinationUrl.trim().length > 0 &&
    (state.platform !== "meta" || Boolean(state.metaPageId));

  // Communique le pied de page au parent (LaunchAdWizard le rend hors de la
  // zone qui défile, pour ne jamais être masqué par le clavier mobile —
  // important ici pour l'éditeur "Contenu publicitaire", qui a des champs texte).
  useEffect(() => {
    if (editingField) {
      onFooterChange({
        backLabel: en ? "Cancel" : "Annuler",
        onBack: () => setEditingField(null),
        nextLabel: en ? "Save" : "Enregistrer",
        onNext: () => setEditingField(null),
      });
      return;
    }
    if (subStep === "adset") {
      onFooterChange({
        backLabel: en ? "Back" : "Retour",
        onBack: onBackToStep1,
        nextLabel: en ? "Continue" : "Continuer",
        onNext: () => setSubStep("ad"),
        nextDisabled: !adSetValid,
      });
      return;
    }
    onFooterChange({
      backLabel: en ? "Back" : "Précédent",
        onBack: () => setSubStep("adset"),
      nextLabel: en ? "Next" : "Suivant",
      onNext: onAdvanceToStep3,
      nextDisabled: !adValid,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingField, subStep, adSetValid, adValid]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setMediaKind(file.type.startsWith("video/") ? "video" : "image");
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    patch({ mediaUrl: "" });

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/campaign-media", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Échec de l'envoi du fichier");

      const url: string | null = typeof data?.secure_url === "string" ? data.secure_url : null;
      if (!url) throw new Error("Le fichier a été envoyé mais aucune URL n'a été renvoyée");

      patch({ mediaUrl: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erreur d'envoi inconnue");
    } finally {
      setUploading(false);
    }
  }

  function clearMedia() {
    setPreviewUrl(null);
    setMediaKind(null);
    setUploadError(null);
    patch({ mediaUrl: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function generateAdCopy() {
    if (!state.product?.name) {
      setCopyError(locale === "en" ? "Choose a product first." : "Sélectionne d'abord un produit.");
      return;
    }
    setGeneratingCopy(true);
    setCopyError(null);
    try {
      const response = await fetch("/api/ai/ad-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: state.product.name, productDescription: state.product.description, price: state.product.price, currency: state.product.currency, platform: state.platform, objective: state.objective, locale }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.text !== "string") throw new Error(data.error || "Generation failed");
      patch({ adText: data.text });
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : locale === "en" ? "Unable to generate the ad text." : "Impossible de générer le texte publicitaire.");
    } finally {
      setGeneratingCopy(false);
    }
  }

  // ---- Petits composants d'affichage ----------------------------------

  function Breadcrumb() {
    return (
      <div className="mb-3 flex items-center gap-1 overflow-x-auto rounded-lg bg-gray-50 px-2 py-2 text-xs font-medium">
        <button
          type="button"
          onClick={() => setSubStep("adset")}
          className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 ${
            subStep === "adset" ? "bg-white text-[#3730A3] shadow-sm" : "text-gray-500"
          }`}
        >
          {en ? "Ad set" : "Ensemble de publicités"}
          {!adSetValid && <AlertTriangle className="h-3 w-3 text-[#DC2626]" />}
        </button>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
        <button
          type="button"
          disabled={!adSetValid}
          onClick={() => adSetValid && setSubStep("ad")}
          className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 disabled:opacity-40 ${
            subStep === "ad" ? "bg-white text-[#3730A3] shadow-sm" : "text-gray-500"
          }`}
        >
          {en ? "Ad" : "Publicité"}
          {!adValid && <AlertTriangle className="h-3 w-3 text-[#DC2626]" />}
        </button>
      </div>
    );
  }

  function WarningBanner({ children }: { children: React.ReactNode }) {
    return (
      <div className="mb-3 flex gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[#DC2626]" />
        <div>{children}</div>
      </div>
    );
  }

  function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
    const content = (
      <>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">{label}</span>
          <span className="block truncate text-xs text-gray-500">{value}</span>
        </span>
        {onEdit && <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-300" />}
      </>
    );
    if (!onEdit) {
      return <div className="flex items-center gap-3 border-b border-gray-100 py-3 last:border-0">{content}</div>;
    }
    return (
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 border-b border-gray-100 py-3 text-left last:border-0"
      >
        {content}
      </button>
    );
  }

  function EditorHeader({ label }: { label: string }) {
    return <p className="mb-3 text-sm font-bold text-gray-900">{label}</p>;
  }

  // ---- Écran : Ensemble de publicités ----------------------------------

  if (!editingField && subStep === "adset") {
    return (
      <div>
        <Breadcrumb />
        {state.platform === "meta" && !state.metaAdAccountId && (
          <WarningBanner>
            {metaAccounts.length === 0 && !loadingMetaAccounts
              ? metaAccountsError ?? (en ? "No Meta Ads account connected. Connect one to fund this ad." : "Aucun compte Meta Ads connecté. Connecte-en un pour financer cette publicité.")
              : (en ? "No ad account selected: choose the Meta Ads account that will fund this ad." : "Aucun compte publicitaire indiqué : sélectionne le compte Meta Ads qui financera cette publicité.")}
            {metaAccounts.length === 0 && !loadingMetaAccounts && (
              <a
                href="/api/integrations/meta/connect"
                className="mt-2 block font-semibold text-[#3730A3] underline underline-offset-2"
              >
                {en ? "Connect a Meta Ads account" : "Connecter un compte Meta Ads"}
              </a>
            )}
          </WarningBanner>
        )}
        {state.platform === "tiktok" && !state.tiktokAdAccountId && (
          <WarningBanner>
            {tiktokAccounts.length === 0 && !loadingTikTokAccounts
              ? tiktokAccountsError ?? (en ? "No TikTok Ads account connected. Connect one to fund this ad." : "Aucun compte TikTok Ads connecté. Connecte-en un pour financer cette publicité.")
              : (en ? "No ad account selected: choose the TikTok Ads account that will fund this ad." : "Aucun compte publicitaire indiqué : sélectionne le compte TikTok Ads qui financera cette publicité.")}
            {tiktokAccounts.length === 0 && !loadingTikTokAccounts && (
              <a
                href="/api/integrations/tiktok/connect"
                className="mt-2 block font-semibold text-[#3730A3] underline underline-offset-2"
              >
                {en ? "Connect a TikTok Ads account" : "Connecter un compte TikTok Ads"}
              </a>
            )}
          </WarningBanner>
        )}
        {state.platform === "pinterest" && !state.pinterestAdAccountId && (
          <WarningBanner>
            {pinterestAccounts.length === 0 && !loadingPinterestAccounts
              ? pinterestAccountsError ?? (en ? "No Pinterest Ads account connected. Connect one to fund this ad." : "Aucun compte Pinterest Ads connecté. Connecte-en un pour financer cette publicité.")
              : (en ? "No ad account selected: choose the Pinterest Ads account that will fund this ad." : "Aucun compte publicitaire indiqué : sélectionne le compte Pinterest Ads qui financera cette publicité.")}
            {pinterestAccounts.length === 0 && !loadingPinterestAccounts && <a href="/api/integrations/pinterest/connect" className="mt-2 block font-semibold text-[#3730A3] underline underline-offset-2">{en ? "Connect a Pinterest Ads account" : "Connecter un compte Pinterest Ads"}</a>}
          </WarningBanner>
        )}
        <div>
          <Row label={en ? "Ad set name" : "Nom de l'ensemble de publicités"} value={state.adSetName || (en ? "New ad set" : "Nouvel ensemble de publicités")} onEdit={() => setEditingField("adSetName")} />
          <Row label={en ? "Network" : "Réseau"} value={state.platform === "meta" ? "Meta Ads" : state.platform === "tiktok" ? "TikTok Ads" : "Pinterest Ads"} onEdit={() => setEditingField("network")} />
          <Row
            label={en ? "Ad account" : "Compte publicitaire"}
            value={
              state.platform === "meta"
                ? loadingMetaAccounts
                  ? (en ? "Loading…" : "Chargement…")
                  : metaAccounts.find((a) => a.id === state.metaAdAccountId)?.name ?? state.metaAdAccountId ?? (en ? "Not selected" : "Non sélectionné")
                : state.platform === "tiktok"
                  ? loadingTikTokAccounts
                    ? (en ? "Loading…" : "Chargement…")
                    : tiktokAccounts.find((a) => a.id === state.tiktokAdAccountId)?.name ?? state.tiktokAdAccountId ?? (en ? "Not selected" : "Non sélectionné")
                  : loadingPinterestAccounts
                    ? (en ? "Loading…" : "Chargement…")
                    : pinterestAccounts.find((a) => a.id === state.pinterestAdAccountId)?.name ?? state.pinterestAdAccountId ?? (en ? "Not selected" : "Non sélectionné")
            }
            onEdit={() => setEditingField("account")}
          />
          <Row label={en ? "Conversion" : "Conversion"} value={en ? "Sales on your store (fixed)" : "Ventes sur ta boutique (fixé)"} />
          {state.platform === "meta" && (
            <Row
              label={en ? "Placements" : "Placements"}
              value={state.placement === "auto" ? (en ? "Automatic" : "Automatique") : (en ? "WhatsApp Status" : "Statut WhatsApp")}
              onEdit={() => setEditingField("placement")}
            />
          )}
        </div>
      </div>
    );
  }

  // ---- Écran : Publicité ------------------------------------------------

  if (!editingField && subStep === "ad") {
    return (
      <div>
        <Breadcrumb />
        {state.platform === "meta" && !state.metaPageId && (
          <WarningBanner>
            {en ? "No page selected: choose the Facebook page that will represent this ad." : "Aucune page indiquée : sélectionne la page Facebook qui représentera cette publicité."}
          </WarningBanner>
        )}
        <div>
          <Row label={en ? "Ad name" : "Nom de la publicité"} value={state.adName || (en ? "New ad" : "Nouvelle publicité")} onEdit={() => setEditingField("adName")} />
          <Row
            label={en ? "Ad setup" : "Configuration de la publicité"}
            value={state.mediaUrl ? (en ? "Single image/video — creative added" : "Image/Vidéo unique — visuel ajouté") : (en ? "Single image/video — no creative" : "Image/Vidéo unique — aucun visuel")}
            onEdit={() => setEditingField("media")}
          />
          <Row
            label={en ? "Ad copy" : "Contenu publicitaire"}
            value={state.adText ? state.adText.slice(0, 60) + (state.adText.length > 60 ? "…" : "") : (en ? "Not provided" : "Non renseigné")}
            onEdit={() => setEditingField("content")}
          />
          {state.platform === "meta" ? (
            <Row
              label={en ? "Identity" : "Identité"}
              value={loadingMetaPages ? (en ? "Loading…" : "Chargement…") : metaPages.find((p) => p.id === state.metaPageId)?.name ?? (en ? "Not selected" : "Non sélectionnée")}
              onEdit={() => setEditingField("identity")}
            />
          ) : (
            <Row label={en ? "Identity" : "Identité"} value={state.platform === "tiktok" ? (en ? "TikTok identity — configured automatically" : "Identité TikTok — configurée automatiquement") : (en ? "Pinterest Pin — created at launch" : "Pin Pinterest — créé au lancement")} />
          )}
        </div>
      </div>
    );
  }

  // ---- Sous-écrans d'édition d'un champ ---------------------------------

  if (editingField === "adSetName") {
    return (
      <div>
        <EditorHeader label={en ? "Ad set name" : "Nom de l'ensemble de publicités"} />
        <input
          autoFocus
          value={state.adSetName}
          onChange={(e) => patch({ adSetName: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
        />
      </div>
    );
  }

  if (editingField === "network") {
    return (
      <div>
        <EditorHeader label={en ? "Network" : "Réseau"} />
        <div className="flex gap-2">
          {(["meta", "tiktok", "pinterest"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => patch({ platform: p, placement: p === "meta" ? state.placement : "auto" })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                state.platform === p ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]" : "border-gray-200 text-gray-600"
              }`}
            >
              {p === "meta" ? "Meta Ads" : p === "tiktok" ? "TikTok Ads" : "Pinterest Ads"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (editingField === "account") {
    const isMeta = state.platform === "meta";
    const isTikTok = state.platform === "tiktok";
    const accounts = isMeta ? metaAccounts : isTikTok ? tiktokAccounts : pinterestAccounts;
    const loading = isMeta ? loadingMetaAccounts : isTikTok ? loadingTikTokAccounts : loadingPinterestAccounts;
    const accountsError = isMeta ? metaAccountsError : isTikTok ? tiktokAccountsError : pinterestAccountsError;
    const selectedId = isMeta ? state.metaAdAccountId : isTikTok ? state.tiktokAdAccountId : state.pinterestAdAccountId;
    const connectUrl = isMeta ? "/api/integrations/meta/connect" : isTikTok ? "/api/integrations/tiktok/connect" : "/api/integrations/pinterest/connect";
    return (
      <div>
        <EditorHeader label={isMeta ? (en ? "Meta ad account" : "Compte publicitaire Meta") : isTikTok ? (en ? "TikTok ad account" : "Compte publicitaire TikTok") : (en ? "Pinterest ad account" : "Compte publicitaire Pinterest")} />
        {loading ? (
            <p className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {en ? `Loading your ${isMeta ? "Meta Ads" : isTikTok ? "TikTok Ads" : "Pinterest Ads"} accounts…` : `Chargement de tes comptes ${isMeta ? "Meta Ads" : isTikTok ? "TikTok Ads" : "Pinterest Ads"}…`}
          </p>
        ) : accounts.length > 0 ? (
          <select
            value={selectedId ?? ""}
            onChange={(e) =>
              isMeta
                ? patch({ metaAdAccountId: e.target.value || undefined, metaPageId: undefined })
                : isTikTok
                  ? patch({ tiktokAdAccountId: e.target.value || undefined })
                  : patch({ pinterestAdAccountId: e.target.value || undefined })
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="">{en ? "Choose an account…" : "Choisir un compte…"}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name ?? account.id}
              </option>
            ))}
          </select>
        ) : null}
        {accountsError && (
          <div className="mt-2 rounded-lg bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
            <p>{accountsError}</p>
            <a href={connectUrl} className="mt-1 block font-semibold underline underline-offset-2">
              {isMeta ? (en ? "Connect a Meta Ads account" : "Connecter un compte Meta Ads") : isTikTok ? (en ? "Connect a TikTok Ads account" : "Connecter un compte TikTok Ads") : (en ? "Connect a Pinterest Ads account" : "Connecter un compte Pinterest Ads")}
            </a>
          </div>
        )}
      </div>
    );
  }

  if (editingField === "placement") {
    return (
      <div>
        <EditorHeader label={en ? "Placements" : "Placements"} />
        <div className="flex gap-2">
          {(["auto", "whatsapp_status"] as Placement[]).map((p) => {
            const allowed = p === "auto" || isAdPlatformAllowed(plan, "whatsapp");
            const active = state.placement === p;
            return (
              <button
                key={p}
                type="button"
                disabled={!allowed}
                onClick={() => allowed && patch({ placement: p })}
                className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                  active ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]" : allowed ? "border-gray-200 text-gray-600" : "border-gray-100 text-gray-300"
                }`}
              >
                {p === "auto" ? (en ? "Automatic" : "Automatique") : (en ? "WhatsApp Status" : "Statut WhatsApp")}
                {p === "whatsapp_status" && !allowed && <span className="ml-1 text-[10px] font-normal text-gray-400">{en ? "(not included in your plan)" : "(non inclus dans ton plan)"}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {state.placement === "whatsapp_status"
            ? (en ? "Delivered in WhatsApp Status, in addition to Instagram Stories — Meta requires this pair. Clicks open your destination link, not a WhatsApp conversation." : "Diffusée dans l'onglet Actualités de WhatsApp (Statuts), en plus des Stories Instagram — Meta impose ce duo. Le clic ouvre ton lien de destination, pas une conversation WhatsApp.")
            : (en ? "Meta automatically chooses the best placements (Facebook, Instagram)." : "Meta choisit automatiquement les meilleurs emplacements (Facebook, Instagram).")}
        </p>
      </div>
    );
  }

  if (editingField === "adName") {
    return (
      <div>
        <EditorHeader label={en ? "Ad name" : "Nom de la publicité"} />
        <input
          autoFocus
          value={state.adName}
          onChange={(e) => patch({ adName: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
        />
      </div>
    );
  }

  if (editingField === "media") {
    return (
      <div>
        <EditorHeader label={en ? "Ad setup" : "Configuration de la publicité"} />
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">{en ? "Creative (image or video)" : "Visuel (image ou vidéo)"}</label>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelected} className="hidden" />
        {!previewUrl && !state.mediaUrl ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-8 text-sm text-gray-500 transition hover:border-[#6366F1] hover:text-[#6366F1]"
          >
            <ImagePlus className="h-6 w-6" />
            {en ? "Choose an image or video from your device" : "Choisir une image ou vidéo depuis l'appareil"}
          </button>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {mediaKind === "video" ? (
              <video src={previewUrl ?? undefined} className="h-40 w-full object-cover" muted />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl ?? state.mediaUrl} alt="Aperçu du visuel" className="h-40 w-full object-cover" />
            )}
            <button
              type="button"
              onClick={clearMedia}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
              aria-label={en ? "Remove creative" : "Retirer le visuel"}
            >
              <X className="h-4 w-4" />
            </button>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-sm font-medium text-[#3730A3]">
                <Loader2 className="h-4 w-4 animate-spin" />
                {en ? "Uploading…" : "Envoi en cours…"}
              </div>
            )}
          </div>
        )}
        {uploadError ? (
          <p className="mt-1 text-xs text-[#991B1B]">{uploadError}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">{en ? "JPG, PNG or short video. Upload starts automatically after selection." : "JPG, PNG ou courte vidéo. L'envoi démarre automatiquement dès la sélection."}</p>
        )}
      </div>
    );
  }

  if (editingField === "content") {
    return (
      <div className="space-y-4">
        <EditorHeader label={en ? "Ad copy" : "Contenu publicitaire"} />
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">{en ? "Headline" : "Titre"}</label>
          <input
            value={state.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold text-gray-700">{locale === "en" ? "Ad description" : "Description de la publicité"}</label>
            <button
              type="button"
              onClick={() => void generateAdCopy()}
              disabled={generatingCopy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-2.5 py-1.5 text-xs font-semibold text-[#3730A3] transition hover:bg-[#E0E7FF] disabled:cursor-wait disabled:opacity-60"
            >
              {generatingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generatingCopy ? (locale === "en" ? "Generating…" : "Génération…") : (locale === "en" ? "Generate with AI" : "Générer avec l'IA")}
            </button>
          </div>
          <textarea
            value={state.adText}
            onChange={(e) => patch({ adText: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
          <p className="mt-1 text-xs text-gray-400">{locale === "en" ? "Creates a hook, benefits and a clear call to action from your product." : "Crée un hook, des bénéfices et un appel à l'action à partir de ton produit."}</p>
          {copyError ? <p className="mt-1 text-xs text-[#991B1B]">{copyError}</p> : null}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">{en ? "Destination link" : "Lien de destination"}</label>
          <input
            value={state.destinationUrl}
            onChange={(e) => patch({ destinationUrl: e.target.value })}
            placeholder={en ? "https://your-store.chariow.com/product/…" : "https://ta-boutique.chariow.com/produit/…"}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
          {state.product?.url && <p className="mt-1 text-xs text-gray-400">{en ? "Pre-filled from the selected product page." : "Pré-rempli depuis la page du produit choisi."}</p>}
        </div>
      </div>
    );
  }

  if (editingField === "identity") {
    return (
      <div>
        <EditorHeader label={en ? "Identity" : "Identité"} />
        {state.platform === "meta" ? (
          <>
            {loadingMetaPages ? (
              <p className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement de tes pages Facebook…
              </p>
            ) : metaPages.length > 1 ? (
              <select
                value={state.metaPageId ?? ""}
                onChange={(e) => patch({ metaPageId: e.target.value || undefined })}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">{en ? "Choose a page…" : "Choisir une page…"}</option>
                {metaPages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            ) : metaPages.length === 1 ? (
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{metaPages[0].name}</p>
            ) : null}
            {metaPagesError && <p className="mt-1 text-xs text-[#991B1B]">{metaPagesError}</p>}
          </>
        ) : (
          <p className="text-sm text-gray-500">{en ? "TikTok identity (creator/business account) is configured automatically at launch." : "L'identité TikTok (compte créateur/entreprise) est configurée automatiquement lors du lancement."}</p>
        )}
      </div>
    );
  }

  return null;
}
