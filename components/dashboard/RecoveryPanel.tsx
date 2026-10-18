"use client";
import { localizeSystemMessage } from "@/lib/i18n/system-messages";
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
import { useI18n } from "@/lib/i18n/i18n";
import { overviewCopy } from "@/lib/i18n/overview-copy";
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
  const { locale , t } = useI18n();
  const copy = (key: string, fallback: string) => locale === "en" ? overviewCopy.en[`overviewExtra.${key}`] || fallback : fallback;
  const [rows, setRows] = useState<CaseRow[]>([]),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [totals, setTotals] = useState<Total[]>([]);
  const [busy, setBusy] = useState(false),
    [reconciling, setReconciling] = useState(false),
    [loading, setLoading] = useState(Boolean(storeId)),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [limitNote, setLimitNote] = useState("");
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
          e instanceof Error ? e.message : t("sweep1.text156"),
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
          e instanceof Error ? e.message : t("sweep1.text156"),
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
      target.document.title = locale === "en" ? "Preparing follow-up" : "Préparation de la relance";
      target.document.body.textContent = locale === "en" ? "Preparing your WhatsApp message…" : "Préparation de votre message WhatsApp…";
    }
    return target;
  }
  function showWhatsApp(data: {id: string; url: string; message: string}, target: Window | null, recorded = true) {
    if (target && !target.closed) {
      target.location.replace(data.url);
      setPreview(null);
    } else {
      setPreview(data);
    }
    setNotice(recorded ? t("sweep2.text157") : (locale === "en"
      ? "Message prepared for WhatsApp. Review it and send it yourself in WhatsApp. No consent or message delivery has been recorded."
      : "Message préparé pour WhatsApp. Vérifie-le et envoie-le toi-même dans WhatsApp. Aucun consentement ni envoi de message n’a été enregistré."));
  }
  async function launch(candidate: Candidate) {
    const target = beginWhatsAppWindow();
    const data = await post({sourceSaleId:candidate.id}, "/api/recovery/launch");
    if (!data) { target?.close(); return; }
    showWhatsApp({id:data.id,url:data.url,message:data.message},target,false);
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
        t("sweep1.text159"),
      )
    )
      return;
    const data = await post({ action: "sent", id: row.id });
    if (data) {
      setPreview(null);
      setNotice(
        t("sweep2.text160"),
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
          ? t("dynamicExtra.reconciledSales", { count: (found) })
          : t("sweep3.text161"),
      );
      await load();
      setReconciling(false);
    }
  }
  async function optOut(row: CaseRow) {
    if (
      !window.confirm(
        t("sweep1.text162"),
      )
    )
      return;
    const data = await post({ action: "opt_out", id: row.id });
    if (data) {
      setPreview(null);
      setNotice(
        t("sweep2.text163"),
      );
      await load();
    }
  }
  const disabled = busy || reconciling;
  if (!storeId)
    return (
      <section className="recovery">
        <h2>{copy("recoveryHeading", t("workspaceExtra.whatsapp"))}</h2>
        <p>{locale === "en" ? "Select a store to view its abandoned payments." : "Sélectionne une boutique pour consulter ses paiements abandonnés."}</p>
      </section>
    );
  return (
    <section className="recovery" aria-label={t("workspaceExtra.whatsapp")}>
      <div className="rec-page-heading">
        <div>
          <span className="business-eyebrow">{t("finalExtra.text12")}</span>
          <h2>{copy("recoveryTitle", t("sweep3.text164"))}</h2>
          <p>
            {t("sweep1.text165")}</p>
        </div>
        <button
          type="button"
          className="rec-primary"
          disabled={disabled}
          onClick={() => void load()}
        >
          <RefreshCw size={15} /> {copy("refresh", t("sweep2.text166"))}
        </button>
      </div>
      <div className="rec-safety">
        <ShieldCheck size={20} />
        <div>
          <strong>{t("finalExtra.text13")}</strong>
          <p>
            {t("sweep3.text167")}</p>
        </div>
      </div>
      {error && (
        <div role="alert" className="rec-error">
          {localizeSystemMessage(error, locale)}
          <button
            className="rec-secondary"
            type="button"
            onClick={() => void load()}
          >
            {t("adminExtra.admin.retry")}</button>
        </div>
      )}
      {notice && (
        <div role="status" className="rec-notice">
          {localizeSystemMessage(notice, locale)}
        </div>
      )}
      {limitNote && (
        <p className="rec-muted">
          {limitNote} {" "}{t("sweep1.text168")}</p>
      )}
      {preview && (
        <div className="rec-box rec-preview">
          <div className="rec-section-heading">
            <h3>{copy("openFollowup", t("overviewExtra.openFollowup"))}</h3>
            <button
              className="rec-icon-button"
              aria-label={t("sweep2.text169")}
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
            <MessageCircle size={15} /> {copy("openWhatsApp", t("sweep3.text170"))}
          </a>
          <p className="rec-muted">
            {t("sweep1.text171")}</p>
        </div>
      )}
      {loading ? (
        <div className="rec-box" role="status" aria-busy="true" aria-label={t("sweep2.text172")}>
          <div className="rec-summary-grid">
            {[0, 1, 2].map((index) => (
              <div className="rec-summary" key={index}>
                <Skeleton width="65%" height={12} />
                <Skeleton width="35%" height={28} style={{ margin: "12px 0" }} />
                <Skeleton width="50%" height={10} />
              </div>
            ))}
          </div>
          <SkeletonRows count={4} label={t("sweep3.text173")} />
        </div>
      ) : (
        <>
          <div className="rec-summary-grid">
            <div className="rec-summary">
              <span>
                <Clock3 size={16} /> {" "}{t("sweep1.text174")}</span>
              <strong>{candidates.length}</strong>
              <small>{t("adminComplete.last30")}</small>
            </div>
            <div className="rec-summary">
              <span>
                <MessageCircle size={16} /> {" "}{t("sweep2.text175")}</span>
              <strong>{rows.filter((row) => row.sent_at).length}</strong>
              <small>{t("sweep3.text176")}</small>
            </div>
            <div className="rec-summary">
              <span>
                <Check size={16} /> {" "}{t("sweep1.text177")}</span>
              <strong>
                {rows.filter((row) => row.status === "recovered").length}
              </strong>
              <small>{t("sweep2.text178")}</small>
            </div>
          </div>
          <div className="rec-box">
            <div className="rec-section-heading">
              <div>
                <h3>{t("sweep3.text179")}</h3>
                <p>
                  {t("sweep1.text180")}</p>
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
                {reconciling ? t("adminComplete.searching") : t("sweep2.text181")}
              </button>
            </div>
            {totals.length ? (
              <div className="rec-total-grid">
                {totals.map((total) => (
                  <div key={total.currency} className="rec-total">
                    <small>{total.currency}</small>
                    <strong>{money(total.total, total.currency)}</strong>
                    <span>
                      {t("sweep3.text182")}{" "}
                      {money(total.reference, total.currency)}
                    </span>
                    <span>
                      {t("sweep1.text183")}{" "}
                      {money(total.estimated, total.currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rec-empty">
                {t("sweep2.text184")}</div>
            )}
          </div>
          <div className="rec-box">
            <div className="rec-section-heading">
              <div>
                <h3>{t("sweep3.text185")}</h3>
                <p>
                  {t("sweep1.text186")}</p>
              </div>
              <span className="rec-count">{candidates.length}</span>
            </div>
            {!candidates.length ? (
              <div className="rec-empty">
                {t("sweep2.text187")}</div>
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
                          ? t("sweep3.text188")
                          : t("sweep1.text189")}
                      </small>
                      {candidate.failureReason && (
                        <small>{candidate.failureReason}</small>
                      )}
                      {!candidate.phone && (
                        <small className="rec-warning">
                          {t("sweep2.text190")}</small>
                      )}
                    </div>
                    <div className="rec-direct-actions">
                      {!candidate.paymentUrl && <small className="rec-warning">{t("sweep3.text191")}</small>}
                      <button type="button" className="rec-primary"
                        disabled={disabled || !candidate.phone || !candidate.paymentUrl}
                        onClick={() => void launch(candidate)}>
                        <MessageCircle size={15}/> {" "}{t("finalExtra.text14")}</button>
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
            <h3>{copy("followupTracking", t("optionsExtra.text18"))}</h3>
            <span className="rec-count">{rows.length}</span>
          </div>
          {!rows.length ? (
            <div className="rec-empty">
              {locale === "en" ? overviewCopy.en["overviewExtra.recoveryEmpty"] : "Aucune relance enregistrée. Lance une relance depuis un paiement abandonné."}
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
                        ? t("sweep2.text193")
                        : statuses[row.status] ? (locale === "en" ? t(`overviewExtra.${row.status === "opted_out" ? "optedOut" : row.status}`) : statuses[row.status]) : row.status}
                    </span>
                  </div>
                  <p>
                    {row.product_name || "Produit non précisé"} ·{" "}
                    {money(row.amount, row.currency)}
                  </p>
                  <small className="rec-muted">
                    {t("finalExtra.text15")}{" "}
                    {new Date(row.consent_at).toLocaleString("fr-FR")} ·{" "}
                    {row.consent_source}
                  </small>
                  {row.sent_at && (
                    <p className="rec-muted">
                      {t("sweep3.text194")}{" "}
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
                        ? t("sweep1.text195")
                        : t("sweep2.text196")}
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
                          {row.status === "open" ? t("finalExtra.text14") : t("optionsExtra.text19")}
                        </button>
                      )}
                    {!row.opt_out_at && row.status === "prepared" && (
                      <button
                        className="rec-secondary"
                        type="button"
                        disabled={disabled}
                        onClick={() => void markSent(row)}
                      >
                        {t("sweep3.text197")}</button>
                    )}
                    {!row.opt_out_at && row.status !== "opted_out" && (
                      <button
                        className="rec-danger"
                        type="button"
                        disabled={disabled}
                        onClick={() => void optOut(row)}
                      >
                        {t("finalExtra.text16")}</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="rec-box rec-automation-info">
        <strong>{t("finalExtra.text17")}</strong>
        <p className="rec-muted">{t("sweep1.text198")}</p>
      </div>
      <p className="rec-footnote">
        {t("sweep2.text199")}</p>
    </section>
  );
}
