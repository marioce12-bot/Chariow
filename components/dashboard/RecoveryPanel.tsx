"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { recoveryDraftError } from "@/lib/recovery";
import {
  Check,
  Clock3,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
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
const blank = {
  customerName: "",
  phone: "",
  email: "",
  productName: "",
  amount: "",
  currency: "XOF",
  abandonedAt: "",
  consentSource: "",
  paymentUrl: "",
  customerId: "",
  consentAt: "",
};
function localDate(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
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
  const [form, setForm] = useState(blank),
    [selected, setSelected] = useState(""),
    [consent, setConsent] = useState(false),
    [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [formOpenVersion, setFormOpenVersion] = useState(0);
  useEffect(() => {
    if (!showForm || !formRef.current) return;
    formRef.current.scrollIntoView({ behavior: "auto", block: "start" });
    formRef.current.focus({ preventScroll: true });
  }, [showForm, formOpenVersion]);
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
    setForm(blank);
    setSelected("");
    setShowForm(false);
    setConsent(false);
    void load();
    return () => loadController.current?.abort();
  }, [load]);
  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/recovery", {
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
  function choose(candidate: Candidate) {
    setSelected(candidate.id);
    setConsent(false);
    setError("");
    setShowForm(true);
    setFormOpenVersion((version) => version + 1);
    setForm({
      ...blank,
      customerName: candidate.customerName || "",
      phone: candidate.phone || "",
      email: candidate.email || "",
      productName: candidate.productName || "",
      amount: candidate.amount == null ? "" : String(candidate.amount),
      currency: candidate.currency || "XOF",
      abandonedAt: localDate(candidate.abandonedAt),
      paymentUrl: candidate.paymentUrl || "",
    });
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    const validationError = recoveryDraftError({ ...form, consent });
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    const data = await post({
      action: "create",
      ...form,
      consent,
      sourceSaleId: selected || null,
      amount: form.amount === "" ? null : Number(form.amount),
      abandonedAt: new Date(form.abandonedAt).toISOString(),
      consentAt: form.consentAt ? new Date(form.consentAt).toISOString() : null,
    });
    if (data) {
      setForm(blank);
      setSelected("");
      setConsent(false);
      setShowForm(false);
      setNotice(
        "Cas enregistré. Le consentement déclaré est daté et conservé.",
      );
      await load();
    }
  }
  async function prepare(row: CaseRow) {
    const data = await post({ action: "prepare", id: row.id });
    if (data) {
      setPreview({ id: row.id, url: data.url, message: data.message });
      setNotice(
        "Message prêt à vérifier. Ouvre ensuite WhatsApp pour l’envoyer toi-même.",
      );
      await load();
    }
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
  const field = (
    label: string,
    key: keyof typeof blank,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="rec-field">
      {label}
      <input
        {...props}
        value={form[key]}
        onChange={(event) =>
          setForm((current) => ({ ...current, [key]: event.target.value }))
        }
      />
    </label>
  );
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
            Retrouve les paiements abandonnés, prépare une relance utile et suis
            les ventes payées après l’envoi.
          </p>
        </div>
        <button
          type="button"
          className="rec-primary"
          disabled={disabled}
          onClick={() => {
            setForm(blank);
            setSelected("");
            setConsent(false);
            setShowForm(true);
            setError("");
            setFormOpenVersion((version) => version + 1);
          }}
        >
          <Plus size={15} /> Ajouter un cas
        </button>
      </div>
      <div className="rec-safety">
        <ShieldCheck size={20} />
        <div>
          <strong>Avec consentement, toujours.</strong>
          <p>
            Envoi manuel dans WhatsApp, jamais automatique. Un numéro enregistré
            ne vaut pas consentement. Si un client répond STOP, utilise « Ne
            plus relancer ».
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
            <h3>Vérifie ton message</h3>
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
        <div className="rec-box rec-loading" role="status">
          <RefreshCw size={19} className="rec-spinning" /> Chargement des
          abandons et des relances…
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
                  Vérifie les coordonnées et le consentement avant de créer une
                  relance.
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
                          Numéro WhatsApp à vérifier et à compléter.
                        </small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="rec-secondary"
                      disabled={disabled}
                      onClick={() => choose(candidate)}
                    >
                      Vérifier le cas
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {showForm && (
        <form
          id="recovery-form"
          ref={formRef}
          tabIndex={-1}
          aria-label={selected ? "Vérifier le paiement abandonné" : "Ajouter un paiement abandonné"}
          style={{ scrollMarginTop: 96 }}
          className="rec-box"
          noValidate
          onSubmit={add}
        >
          <div className="rec-section-heading">
            <div>
              <h3>
                {selected
                  ? "Préparer ce paiement abandonné"
                  : "Ajouter un paiement abandonné"}
              </h3>
              <p>
                Le lien de paiement doit provenir de la boutique. Aucun lien
                n’est inventé.
              </p>
            </div>
            <button
              type="button"
              className="rec-icon-button"
              aria-label="Fermer le formulaire de relance"
              onClick={() => setShowForm(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="rec-form-grid">
            {field("Nom du client", "customerName", { autoComplete: "name" })}
            {field("Téléphone WhatsApp", "phone", {
              type: "tel",
              autoComplete: "tel",
              placeholder: "+229…",
            })}
            {field("E-mail", "email", { type: "email", autoComplete: "email" })}
            {field("Produit", "productName")}
            {field("Montant du paiement", "amount", {
              type: "number",
              min: 0,
              max: 999999999999.99,
              step: "0.01",
            })}
            {field("Devise", "currency", { maxLength: 8 })}
            {field("Date d’abandon", "abandonedAt", {
              type: "datetime-local",
              max: localDate(new Date()),
            })}
            {field("Date réelle du consentement (facultatif)", "consentAt", {
              type: "datetime-local",
              max: localDate(new Date()),
            })}
            {field("Preuve / provenance du consentement", "consentSource", {
              minLength: 3,
              maxLength: 300,
              placeholder: "Formulaire, date et version, échange client…",
            })}
            {field("Lien de paiement HTTPS", "paymentUrl", {
              type: "url",
              placeholder: "https://…",
            })}
          </div>
          {error && (
            <p role="alert" className="rec-error">
              {error}
            </p>
          )}
          <label className="rec-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Je confirme que ce client a explicitement consenti à cette relance
              WhatsApp, et que je dispose de la preuve indiquée ci-dessus.
            </span>
          </label>
          <p className="rec-muted">
            La déclaration est conservée. Si la date réelle est renseignée, elle
            est également enregistrée.
          </p>
          <button
            type="submit"
            className="rec-primary"
            disabled={disabled}
          >
            {busy ? "Enregistrement…" : "Enregistrer le cas"}
          </button>
        </form>
      )}
      {!loading && (
        <div className="rec-box">
          <div className="rec-section-heading">
            <h3>Suivi de mes relances</h3>
            <span className="rec-count">{rows.length}</span>
          </div>
          {!rows.length ? (
            <div className="rec-empty">
              Aucune relance enregistrée. Commence par vérifier un paiement
              abandonné.
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
                          {row.status === "open"
                            ? "Préparer le message"
                            : "Revoir le message"}
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
      <p className="rec-footnote">
        Un rapprochement indique une vente payée après une relance : il ne
        prouve pas, à lui seul, que la relance a causé cette vente. Les réponses
        WhatsApp et les demandes STOP se traitent manuellement.
      </p>
    </section>
  );
}
