"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, ImagePlus, Loader2, Pencil, X } from "lucide-react";
import type { Placement, Platform, WizardState } from "./types";
import { isAdPlatformAllowed, type PlanId } from "@/lib/plans";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "video" | null>(null);

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
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Impossible de charger tes comptes Meta Ads"))))
      .then((data) => {
        const accounts: MetaAccountOption[] = data.accounts ?? [];
        setMetaAccounts(accounts);
        if (accounts.length === 1 && !state.metaAdAccountId) patch({ metaAdAccountId: accounts[0].id });
        if (accounts.length === 0) setMetaAccountsError("Aucun compte Meta Ads connecté. Connecte-en un depuis Paramètres avant de lancer une pub.");
      })
      .catch((err) => setMetaAccountsError(err instanceof Error ? err.message : "Impossible de charger tes comptes Meta Ads"))
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
        if (!ok) throw new Error(data?.error || "Impossible de charger les pages Facebook de ce compte");
        const pages: MetaPageOption[] = data.pages ?? [];
        setMetaPages(pages);
        if (pages.length === 1) patch({ metaPageId: pages[0].id });
        else if (state.metaPageId && !pages.some((page) => page.id === state.metaPageId)) patch({ metaPageId: undefined });
        if (pages.length === 0) {
          setMetaPagesError(data.pages_error || "Aucune page Facebook trouvée sur ce compte publicitaire.");
        }
      })
      .catch((err) => setMetaPagesError(err instanceof Error ? err.message : "Impossible de charger les pages Facebook"))
      .finally(() => setLoadingMetaPages(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.platform, state.metaAdAccountId]);

  useEffect(() => {
    if (state.platform !== "tiktok" || tiktokAccounts.length > 0 || loadingTikTokAccounts) return;
    setLoadingTikTokAccounts(true);
    setTikTokAccountsError(null);
    fetch("/api/integrations/tiktok/accounts")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Impossible de charger tes comptes TikTok Ads"))))
      .then((data) => {
        const accounts: TikTokAccountOption[] = data.accounts ?? [];
        setTikTokAccounts(accounts);
        if (accounts.length === 1 && !state.tiktokAdAccountId) patch({ tiktokAdAccountId: accounts[0].id });
        if (accounts.length === 0) setTikTokAccountsError("Aucun compte TikTok Ads connecté. Connecte-en un depuis Paramètres avant de lancer une pub.");
      })
      .catch((err) => setTikTokAccountsError(err instanceof Error ? err.message : "Impossible de charger tes comptes TikTok Ads"))
      .finally(() => setLoadingTikTokAccounts(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.platform]);

  useEffect(() => {
    if (state.platform !== "pinterest" || pinterestAccounts.length > 0 || loadingPinterestAccounts) return;
    setLoadingPinterestAccounts(true);
    setPinterestAccountsError(null);
    fetch("/api/integrations/pinterest/accounts")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Impossible de charger tes comptes Pinterest Ads"))))
      .then((data) => {
        const accounts: PinterestAccountOption[] = data.accounts ?? [];
        setPinterestAccounts(accounts);
        if (accounts.length === 1 && state.pinterestAdAccountId !== accounts[0].id) patch({ pinterestAdAccountId: accounts[0].id });
        if (accounts.length === 0) setPinterestAccountsError("Aucun compte Pinterest Ads connecté. Connecte-en un depuis Paramètres avant de lancer une pub.");
      })
      .catch((err) => setPinterestAccountsError(err instanceof Error ? err.message : "Impossible de charger tes comptes Pinterest Ads"))
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
        backLabel: "Annuler",
        onBack: () => setEditingField(null),
        nextLabel: "Enregistrer",
        onNext: () => setEditingField(null),
      });
      return;
    }
    if (subStep === "adset") {
      onFooterChange({
        backLabel: "Retour",
        onBack: onBackToStep1,
        nextLabel: "Continuer",
        onNext: () => setSubStep("ad"),
        nextDisabled: !adSetValid,
      });
      return;
    }
    onFooterChange({
      backLabel: "Précédent",
      onBack: () => setSubStep("adset"),
      nextLabel: "Suivant",
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
          Ensemble de publicités
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
          Publicité
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
              ? metaAccountsError ?? "Aucun compte Meta Ads connecté. Connecte-en un pour financer cette publicité."
              : "Aucun compte publicitaire indiqué : sélectionne le compte Meta Ads qui financera cette publicité."}
            {metaAccounts.length === 0 && !loadingMetaAccounts && (
              <a
                href="/api/integrations/meta/connect"
                className="mt-2 block font-semibold text-[#3730A3] underline underline-offset-2"
              >
                Connecter un compte Meta Ads
              </a>
            )}
          </WarningBanner>
        )}
        {state.platform === "tiktok" && !state.tiktokAdAccountId && (
          <WarningBanner>
            {tiktokAccounts.length === 0 && !loadingTikTokAccounts
              ? tiktokAccountsError ?? "Aucun compte TikTok Ads connecté. Connecte-en un pour financer cette publicité."
              : "Aucun compte publicitaire indiqué : sélectionne le compte TikTok Ads qui financera cette publicité."}
            {tiktokAccounts.length === 0 && !loadingTikTokAccounts && (
              <a
                href="/api/integrations/tiktok/connect"
                className="mt-2 block font-semibold text-[#3730A3] underline underline-offset-2"
              >
                Connecter un compte TikTok Ads
              </a>
            )}
          </WarningBanner>
        )}
        {state.platform === "pinterest" && !state.pinterestAdAccountId && (
          <WarningBanner>
            {pinterestAccounts.length === 0 && !loadingPinterestAccounts
              ? pinterestAccountsError ?? "Aucun compte Pinterest Ads connecté. Connecte-en un pour financer cette publicité."
              : "Aucun compte publicitaire indiqué : sélectionne le compte Pinterest Ads qui financera cette publicité."}
            {pinterestAccounts.length === 0 && !loadingPinterestAccounts && <a href="/api/integrations/pinterest/connect" className="mt-2 block font-semibold text-[#3730A3] underline underline-offset-2">Connecter un compte Pinterest Ads</a>}
          </WarningBanner>
        )}
        <div>
          <Row label="Nom de l'ensemble de publicités" value={state.adSetName || "Nouvel ensemble de publicités"} onEdit={() => setEditingField("adSetName")} />
          <Row label="Réseau" value={state.platform === "meta" ? "Meta Ads" : state.platform === "tiktok" ? "TikTok Ads" : "Pinterest Ads"} onEdit={() => setEditingField("network")} />
          <Row
            label="Compte publicitaire"
            value={
              state.platform === "meta"
                ? loadingMetaAccounts
                  ? "Chargement…"
                  : metaAccounts.find((a) => a.id === state.metaAdAccountId)?.name ?? state.metaAdAccountId ?? "Non sélectionné"
                : state.platform === "tiktok"
                  ? loadingTikTokAccounts
                    ? "Chargement…"
                    : tiktokAccounts.find((a) => a.id === state.tiktokAdAccountId)?.name ?? state.tiktokAdAccountId ?? "Non sélectionné"
                  : loadingPinterestAccounts
                    ? "Chargement…"
                    : pinterestAccounts.find((a) => a.id === state.pinterestAdAccountId)?.name ?? state.pinterestAdAccountId ?? "Non sélectionné"
            }
            onEdit={() => setEditingField("account")}
          />
          <Row label="Conversion" value="Ventes sur ta boutique (fixé)" />
          {state.platform === "meta" && (
            <Row
              label="Placements"
              value={state.placement === "auto" ? "Automatique" : "Statut WhatsApp"}
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
            Aucune page indiquée : sélectionne la page Facebook qui représentera cette publicité.
          </WarningBanner>
        )}
        <div>
          <Row label="Nom de la publicité" value={state.adName || "Nouvelle publicité"} onEdit={() => setEditingField("adName")} />
          <Row
            label="Configuration de la publicité"
            value={state.mediaUrl ? "Image/Vidéo unique — visuel ajouté" : "Image/Vidéo unique — aucun visuel"}
            onEdit={() => setEditingField("media")}
          />
          <Row
            label="Contenu publicitaire"
            value={state.adText ? state.adText.slice(0, 60) + (state.adText.length > 60 ? "…" : "") : "Non renseigné"}
            onEdit={() => setEditingField("content")}
          />
          {state.platform === "meta" ? (
            <Row
              label="Identité"
              value={loadingMetaPages ? "Chargement…" : metaPages.find((p) => p.id === state.metaPageId)?.name ?? "Non sélectionnée"}
              onEdit={() => setEditingField("identity")}
            />
          ) : (
            <Row label="Identité" value={state.platform === "tiktok" ? "Identité TikTok — configurée automatiquement" : "Pin Pinterest — créé au lancement"} />
          )}
        </div>
      </div>
    );
  }

  // ---- Sous-écrans d'édition d'un champ ---------------------------------

  if (editingField === "adSetName") {
    return (
      <div>
        <EditorHeader label="Nom de l'ensemble de publicités" />
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
        <EditorHeader label="Réseau" />
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
        <EditorHeader label={isMeta ? "Compte publicitaire Meta" : isTikTok ? "Compte publicitaire TikTok" : "Compte publicitaire Pinterest"} />
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement de tes comptes {isMeta ? "Meta Ads" : isTikTok ? "TikTok Ads" : "Pinterest Ads"}…
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
            <option value="">Choisir un compte…</option>
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
              {isMeta ? "Connecter un compte Meta Ads" : isTikTok ? "Connecter un compte TikTok Ads" : "Connecter un compte Pinterest Ads"}
            </a>
          </div>
        )}
      </div>
    );
  }

  if (editingField === "placement") {
    return (
      <div>
        <EditorHeader label="Placements" />
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
                {p === "auto" ? "Automatique" : "Statut WhatsApp"}
                {p === "whatsapp_status" && !allowed && <span className="ml-1 text-[10px] font-normal text-gray-400">(non inclus dans ton plan)</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {state.placement === "whatsapp_status"
            ? "Diffusée dans l'onglet Actualités de WhatsApp (Statuts), en plus des Stories Instagram — Meta impose ce duo. Le clic ouvre ton lien de destination, pas une conversation WhatsApp."
            : "Meta choisit automatiquement les meilleurs emplacements (Facebook, Instagram)."}
        </p>
      </div>
    );
  }

  if (editingField === "adName") {
    return (
      <div>
        <EditorHeader label="Nom de la publicité" />
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
        <EditorHeader label="Configuration de la publicité" />
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Visuel (image ou vidéo)</label>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelected} className="hidden" />
        {!previewUrl && !state.mediaUrl ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-8 text-sm text-gray-500 transition hover:border-[#6366F1] hover:text-[#6366F1]"
          >
            <ImagePlus className="h-6 w-6" />
            Choisir une image ou vidéo depuis l'appareil
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
              aria-label="Retirer le visuel"
            >
              <X className="h-4 w-4" />
            </button>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-sm font-medium text-[#3730A3]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Envoi en cours…
              </div>
            )}
          </div>
        )}
        {uploadError ? (
          <p className="mt-1 text-xs text-[#991B1B]">{uploadError}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">JPG, PNG ou courte vidéo. L'envoi démarre automatiquement dès la sélection.</p>
        )}
      </div>
    );
  }

  if (editingField === "content") {
    return (
      <div className="space-y-4">
        <EditorHeader label="Contenu publicitaire" />
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">Titre</label>
          <input
            value={state.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">Texte de l'annonce</label>
          <textarea
            value={state.adText}
            onChange={(e) => patch({ adText: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">Lien de destination</label>
          <input
            value={state.destinationUrl}
            onChange={(e) => patch({ destinationUrl: e.target.value })}
            placeholder="https://ta-boutique.chariow.com/produit/…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
          {state.product?.url && <p className="mt-1 text-xs text-gray-400">Pré-rempli depuis la page du produit choisi.</p>}
        </div>
      </div>
    );
  }

  if (editingField === "identity") {
    return (
      <div>
        <EditorHeader label="Identité" />
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
                <option value="">Choisir une page…</option>
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
          <p className="text-sm text-gray-500">L'identité TikTok (compte créateur/entreprise) est configurée automatiquement lors du lancement.</p>
        )}
      </div>
    );
  }

  return null;
}
