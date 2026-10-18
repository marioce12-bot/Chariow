"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Clock3,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Skeleton, SkeletonRows } from "./Skeleton";
type CaseRow = {
  id: string;
  source_sale_id?: string | null;
  customer_name: string | null;
  phone: string;
  email?: string | null;
  product_name: string | null;
  amount: number | null;
  currency: string | null;
  abandoned_at: string;
  consent_at: string;
  consent_source: string;
  payment_url?: string | null;
  status: string;
  prepared_at: string | null;
  sent_at: string | null;
  sale_id: string | null;
  attribution: string | null;
  opt_out_at?: string | null;
  recovered_amount?: number | null;
  recovered_currency?: string | null;
};
type Candidate = {
  id: string;
  status: string;
  amount: number | null;
  currency: string | null;
  abandonedAt: string;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  productName: string | null;
  paymentUrl: string | null;
  failureReason: string | null;
  hasContact: boolean;
};
type Total = {
  currency: string;
  reference: number;
  estimated: number;
  total: number;
};
function money(value: number | null, currency: string | null) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "XOF",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency || ""}`;
  }
}
const statuses: Record<string, string> = {
  open: "À préparer",
  prepared: "Message préparé",
  sent: "Envoi confirmé",
  recovered: "Vente rapprochée",
  opted_out: "Contact désabonné",
};
export default function RecoveryPanel({ storeId }: { storeId: string | null }) {
  const [rows, setRows] = useState<CaseRow[]>([]),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [totals, setTotals] = useState<Total[]>([]);
  const [busy, setBusy] = useState(false),
    [reconciling, setReconciling] = useState(false),
    [loading, setLoading] = useState(Boolean(storeId)),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [limitNote, setLimitNote] = useState("");
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<{
    id: string;
    url: string;
    message: string;
  } | null>(null);
  const live = useRef(true),
    loadController = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      loadController.current?.abort();
    };
  }, []);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    if (!storeId) {
      setRows([]);
      setCandidates([]);
      setTotals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/recovery?store_id=${encodeURIComponent(storeId)}`,
        { signal: controller.signal },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chargement impossible");
      if (controller.signal.aborted || !live.current) return;
      setRows(data.cases || []);
      setCandidates(data.candidates || []);
      setTotals(data.totalsByCurrency || []);
      setLimitNote(data.note || "");
    } catch (e) {
      if (!controller.signal.aborted && live.current)
        setError(
          e instanceof Error ? e.message : "Connexion impossible. Réessaie.",
        );
    } finally {
      if (!controller.signal.aborted && live.current) setLoading(false);
    }
  }, [storeId]);
  useEffect(() => {
    setRows([]);
    setCandidates([]);
    setTotals([]);
    setPreview(null);
    setConsents({});
    void load();
    return () => loadController.current?.abort();
  }, [load]);
  async function post(payload: Record<string, unknown>, endpoint = "/api/recovery") {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, storeId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action impossible");
      return live.current ? data : null;
    } catch (e) {
      if (live.current)
        setError(
          e instanceof Error ? e.message : "Connexion impossible. Réessaie.",
        );
      return null;
    } finally {
      if (live.current) setBusy(false);
    }
  }
  function beginWhatsAppWindow() {
    const target = window.open("about:blank", "_blank");
    if (target) {
      target.opener = null;
      target.document.title = "Préparation de la relance";
      target.document.body.textContent = "Préparation de votre message WhatsApp…";
    }
    return target;
  }
  function showWhatsApp(data: {id: string; url: string; message: string}, target: Window | null) {
    if (target && !target.closed) {
      target.location.replace(data.url);
      setPreview(null);
    } else {
      setPreview(data);
    }
    setNotice("Message préparé pour WhatsApp. Appuie sur Envoyer dans WhatsApp, puis confirme ici l’envoi réel.");
  }
  async function launch(candidate: Candidate) {
    if (!consents[candidate.id]) {
      setError("Confirme d’abord que ce client a accepté les relances WhatsApp.");
      return;
    }
    const target = beginWhatsAppWindow();
    const data = await post({sourceSaleId:candidate.id,consent:true}, "/api/recovery/launch");
    if (!data) { target?.close(); return; }
    showWhatsApp({id:data.id,url:data.url,message:data.message},target);
    await load();
  }
  async function prepare(row: CaseRow) {
    const target = beginWhatsAppWindow();
    const data = await post({ action: "prepare", id: row.id });
    if (!data) { target?.close(); return; }
    showWhatsApp({id:row.id,url:data.url,message:data.message},target);
    await load();
  }
  async function markSent(row: CaseRow) {
    if (
      !window.confirm(
        "As-tu réellement envoyé ce message dans WhatsApp ? L’ouverture de WhatsApp ne suffit pas.",
      )
    )
      return;
    const data = await post({ action: "sent", id: row.id });
    if (data) {
      setPreview(null);
      setNotice(
        "Envoi réel confirmé. Tu peux maintenant rechercher une vente payée après cette relance.",
      );
      await load();
    }
  }
  async function reconcileAll() {
    setReconciling(true);
    let found = 0;
    for (const row of rows.filter((item) => item.status === "sent")) {
      const data = await post({ action: "reconcile", id: row.id });
      if (!data) break;
      if (data.match) found++;
    }
    if (live.current) {
      setNotice(
        found
          ? `${found} vente(s) rapprochée(s). Une association ne prouve pas que la relance a causé l’achat.`
          : "Aucune nouvelle vente admissible trouvée après les envois confirmés.",
      );
      await load();
      setReconciling(false);
    }
  }
  async function optOut(row: CaseRow) {
    if (
      !window.confirm(
        "Bloquer toute nouvelle relance pour ce téléphone dans cette boutique ?",
      )
    )
      return;
    const data = await post({ action: "opt_out", id: row.id });
    if (data) {
      setPreview(null);
      setNotice(
        "Contact désabonné : toute nouvelle préparation est bloquée pour ce téléphone.",
      );
      await load();
    }
  }
  const disabled = busy || reconciling;
  if (!storeId)
    return (
      <section className="recovery">
        <h2>Relances WhatsApp</h2>
        <p>Sélectionne une boutique pour consulter ses paiements abandonnés.</p>
      </section>
    );
  return (
    <section className="recovery" aria-label="Relances WhatsApp">
      <div className="rec-page-heading">
        <div>
          <span className="business-eyebrow">RELATION CLIENT</span>
          <h2>Une seconde chance pour chaque panier</h2>
          <p>
            Retrouve les paiements abandonnés et ouvre directement une relance polie
            dans WhatsApp, sans formulaire à remplir.
          </p>
        </div>
        <button
          type="button"
          className="rec-primary"
          disabled={disabled}
          onClick={() => void load()}
        >
          <RefreshCw size={15} /> Actualiser les abandons
        </button>
      </div>
      <div className="rec-safety">
        <ShieldCheck size={20} />
        <div>
          <strong>Avec consentement, toujours.</strong>
          <p>
            Un clic prépare le message avec les données et le lien Chariow. Tu valides
            l’envoi dans WhatsApp. Un numéro enregistré ne vaut pas consentement.
            Si un client répond STOP, utilise « Ne plus relancer ».
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="rec-error">
          {error}
          <button
            className="rec-secondary"
            type="button"
            onClick={() => void load()}
          >
            Réessayer
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="rec-notice">
          {notice}
        </div>
      )}
      {limitNote && (
        <p className="rec-muted">
          {limitNote} Les totaux portent sur les cas chargés.
        </p>
      )}
      {preview && (
        <div className="rec-box rec-preview">
          <div className="rec-section-heading">
            <h3>Ouvrir la relance</h3>
            <button
              className="rec-icon-button"
              aria-label="Fermer l’aperçu du message"
              onClick={() => setPreview(null)}
            >
              <X size={17} />
            </button>
          </div>
          <p className="rec-message">{preview.message}</p>
          <a
            className="rec-primary"
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={15} /> Ouvrir WhatsApp pour envoyer
          </a>
          <p className="rec-muted">
            L’ouverture ne marque pas le message comme envoyé. Confirme l’envoi
            réel dans le cas enregistré.
          </p>
        </div>
      )}
      {loading ? (
        <div className="rec-box" role="status" aria-busy="true" aria-label="Chargement des abandons et des relances">
          <div className="rec-summary-grid">
            {[0, 1, 2].map((index) => (
              <div className="rec-summary" key={index}>
                <Skeleton width="65%" height={12} />
                <Skeleton width="35%" height={28} style={{ margin: "12px 0" }} />
                <Skeleton width="50%" height={10} />
              </div>
            ))}
          </div>
          <SkeletonRows count={4} label="Chargement des relances" />
        </div>
      ) : (
        <>
          <div className="rec-summary-grid">
            <div className="rec-summary">
              <span>
                <Clock3 size={16} /> Abandons à vérifier
              </span>
              <strong>{candidates.length}</strong>
              <small>30 derniers jours</small>
            </div>
            <div className="rec-summary">
              <span>
                <MessageCircle size={16} /> Relances envoyées
              </span>
              <strong>{rows.filter((row) => row.sent_at).length}</strong>
              <small>Envoi confirmé manuellement</small>
            </div>
            <div className="rec-summary">
              <span>
                <Check size={16} /> Ventes rapprochées
              </span>
              <strong>
                {rows.filter((row) => row.status === "recovered").length}
              </strong>
              <small>Après l’envoi, sans preuve de causalité</small>
            </div>
          </div>
          <div className="rec-box">
            <div className="rec-section-heading">
              <div>
                <h3>Ventes payées après relance</h3>
                <p>
                  Références vérifiées et estimations restent séparées, devise
                  par devise.
                </p>
              </div>
              <button
                type="button"
                className="rec-secondary"
                disabled={
                  disabled || !rows.some((row) => row.status === "sent")
                }
                onClick={() => void reconcileAll()}
              >
                <RefreshCw
                  size={14}
                  className={reconciling ? "rec-spinning" : ""}
                />{" "}
                {reconciling ? "Recherche…" : "Actualiser les ventes"}
              </button>
            </div>
            {totals.length ? (
              <div className="rec-total-grid">
                {totals.map((total) => (
                  <div key={total.currency} className="rec-total">
                    <small>{total.currency}</small>
                    <strong>{money(total.total, total.currency)}</strong>
                    <span>
                      Référence vérifiée :{" "}
                      {money(total.reference, total.currency)}
                    </span>
                    <span>
                      Rapprochement estimé :{" "}
                      {money(total.estimated, total.currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rec-empty">
                Aucune vente rapprochée pour l’instant. Les ventes sont
                recherchées après un envoi confirmé.
              </div>
            )}
          </div>
          <div className="rec-box">
            <div className="rec-section-heading">
              <div>
                <h3>Paiements abandonnés</h3>
                <p>
                  Les coordonnées et le lien sont récupérés automatiquement depuis Chariow.
                  Confirme le consentement, puis clique sur Relancer.
                </p>
              </div>
              <span className="rec-count">{candidates.length}</span>
            </div>
            {!candidates.length ? (
              <div className="rec-empty">
                Aucun paiement abandonné récent à traiter.
              </div>
            ) : (
              <div className="rec-candidates">
                {candidates.map((candidate) => (
                  <article className="rec-candidate" key={candidate.id}>
                    <div className="rec-contact-icon">
                      <MessageCircle size={18} />
                    </div>
                    <div className="rec-candidate-details">
                      <strong>
                        {candidate.customerName ||
                          candidate.email ||
                          "Client non identifié"}
                      </strong>
                      <span>
                        {candidate.productName || "Produit non précisé"} ·{" "}
                        {money(candidate.amount, candidate.currency)}
                      </span>
                      <small>
                        {new Date(candidate.abandonedAt).toLocaleString(
                          "fr-FR",
                        )}{" "}
                        ·{" "}
                        {candidate.status === "failed"
                          ? "Paiement échoué"
                          : "Paiement abandonné"}
                      </small>
                      {candidate.failureReason && (
                        <small>{candidate.failureReason}</small>
                      )}
                      {!candidate.phone && (
                        <small className="rec-warning">
                          Numéro WhatsApp absent des données Chariow : relance indisponible.
                        </small>
                      )}
                    </div>
                    <div className="rec-direct-actions">
                      {!candidate.paymentUrl && <small className="rec-warning">Lien produit indisponible dans Chariow. Publie la page puis actualise.</small>}
                      {candidate.phone && candidate.paymentUrl && <label className="rec-consent">
                        <input type="checkbox" checked={!!consents[candidate.id]}
                          onChange={event => setConsents(current => ({...current,[candidate.id]:event.target.checked}))}/>
                        <span>Ce client a accepté les relances WhatsApp ; je dispose de son consentement.</span>
                      </label>}
                      <button type="button" className="rec-primary"
                        disabled={disabled || !candidate.phone || !candidate.paymentUrl || !consents[candidate.id]}
                        onClick={() => void launch(candidate)}>
                        <MessageCircle size={15}/> Relancer sur WhatsApp
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {!loading && (
        <div className="rec-box">
          <div className="rec-section-heading">
            <h3>Suivi de mes relances</h3>
            <span className="rec-count">{rows.length}</span>
          </div>
          {!rows.length ? (
            <div className="rec-empty">
              Aucune relance enregistrée. Lance une relance depuis un paiement abandonné.
            </div>
          ) : (
            <div className="rec-cases">
              {rows.map((row) => (
                <article className="rec-case" key={row.id}>
                  <div className="rec-section-heading">
                    <strong>
                      {row.customer_name || row.email || row.phone}
                    </strong>
                    <span className={`rec-badge ${row.status}`}>
                      {row.opt_out_at
                        ? "Contact désabonné"
                        : statuses[row.status] || row.status}
                    </span>
                  </div>
                  <p>
                    {row.product_name || "Produit non précisé"} ·{" "}
                    {money(row.amount, row.currency)}
                  </p>
                  <small className="rec-muted">
                    Consentement :{" "}
                    {new Date(row.consent_at).toLocaleString("fr-FR")} ·{" "}
                    {row.consent_source}
                  </small>
                  {row.sent_at && (
                    <p className="rec-muted">
                      Envoi confirmé le{" "}
                      {new Date(row.sent_at).toLocaleString("fr-FR")}
                    </p>
                  )}
                  {row.status === "recovered" && (
                    <p className="rec-recovered">
                      {money(
                        row.recovered_amount ?? null,
                        row.recovered_currency ?? null,
                      )}{" "}
                      ·{" "}
                      {row.attribution === "confirmed"
                        ? "Référence vérifiée"
                        : "Rapprochement estimé par identité"}
                    </p>
                  )}
                  <div className="rec-case-actions">
                    {!row.opt_out_at &&
                      ["open", "prepared"].includes(row.status) && (
                        <button
                          className="rec-primary"
                          type="button"
                          disabled={disabled}
                          onClick={() => void prepare(row)}
                        >
                          {row.status === "open" ? "Relancer sur WhatsApp" : "Rouvrir WhatsApp"}
                        </button>
                      )}
                    {!row.opt_out_at && row.status === "prepared" && (
                      <button
                        className="rec-secondary"
                        type="button"
                        disabled={disabled}
                        onClick={() => void markSent(row)}
                      >
                        Confirmer l’envoi réel
                      </button>
                    )}
                    {!row.opt_out_at && row.status !== "opted_out" && (
                      <button
                        className="rec-danger"
                        type="button"
                        disabled={disabled}
                        onClick={() => void optOut(row)}
                      >
                        Ne plus relancer
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="rec-box rec-automation-info">
        <strong>Envoi automatique : non connecté</strong>
        <p className="rec-muted">Pour envoyer sans ouvrir WhatsApp, connecte un numéro WhatsApp Business à l’API officielle, avec un modèle de message approuvé et le consentement client. Aucun envoi automatique n’est actif actuellement.</p>
      </div>
      <p className="rec-footnote">
        Un rapprochement indique une vente payée après une relance : il ne
        prouve pas, à lui seul, que la relance a causé cette vente. Les réponses
        WhatsApp et les demandes STOP se traitent manuellement.
      </p>
    </section>
  );
}
