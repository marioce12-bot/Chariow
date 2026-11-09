"use client";

import { useState, type FormEvent } from "react";
import { Activity, Lightbulb, Loader2, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import { useI18n } from "@/lib/i18n/i18n";
import type { MarketRadarFormat, MarketRadarReport } from "@/lib/market-radar";

type RadarResponse = { report?: MarketRadarReport; error?: string };

export function MarketRadarView({ onGoToAI }: { onGoToAI: (prompt: string) => void }) {
  const { t, locale } = useI18n();
  const [idea, setIdea] = useState("");
  const [selectedAudiences, setSelectedAudiences] = useState(["entrepreneurs"]);
  const [format, setFormat] = useState<MarketRadarFormat>("ebook");
  const [report, setReport] = useState<MarketRadarReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [audiencesOpen, setAudiencesOpen] = useState(false);

  const audienceOptions = [
    ["entrepreneurs", t("sweep3.text233")], ["jeunes actifs", t("optionsExtra.text46")], ["étudiants", t("optionsExtra.text47")],
    ["femmes entrepreneures", t("optionsExtra.text48")], ["créateurs de contenu", t("sweep1.text234")], ["vendeurs en ligne", t("optionsExtra.text49")],
    ["petites entreprises", t("optionsExtra.text50")], ["freelances", t("optionsExtra.text51")], ["parents", t("radar.parents")],
    ["salariés en reconversion", t("sweep2.text235")], ["coachs et formateurs", t("sweep3.text236")], ["artisans et créateurs", t("sweep1.text237")],
    ["influenceurs", t("sweep2.text238")], ["expatriés et diaspora", t("sweep3.text239")], ["retraités actifs", t("sweep1.text240")],
  ] as const;

  function toggleAudience(value: string) {
    setSelectedAudiences((selected) => selected.includes(value)
      ? selected.filter((audience) => audience !== value)
      : [...selected, value].slice(0, 5));
  }

  function selectedAudienceLabels() {
    return audienceOptions.filter(([value]) => selectedAudiences.includes(value)).map(([, label]) => label);
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch("/api/market/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), audiences: selectedAudiences, audience: selectedAudiences.join(", "), format, locale }),
      });
      const data = await response.json() as RadarResponse;
      if (!response.ok) {
        setError(data.error ?? t("radar.analysisError"));
        return;
      }
      if (!data.report) {
        setError(t("radar.analysisError"));
        return;
      }
      setReport(data.report);
    } catch {
      setError(t("sweep2.text241"));
    } finally {
      setLoading(false);
    }
  }

  const confidenceLabel = report?.confidence === "medium" ? t("radar.confidenceMedium") : t("radar.confidenceLow");
  const scoreItems = report ? [
    { label: t("radar.dimensionDemand"), value: report.dimensions.demand },
    { label: t("radar.dimensionGrowth"), value: report.dimensions.growth },
    { label: t("radar.dimensionAudience"), value: report.dimensions.audienceFit },
    { label: t("radar.dimensionProduct"), value: report.dimensions.productFit },
    { label: t("radar.dimensionCompetition"), value: report.dimensions.competition },
    { label: t("radar.dimensionMonetization"), value: report.dimensions.monetization },
  ] : [];
  const targetCountries = report?.recommendedCountries.map((country) => country.name).join(", ") || t("radar.noCountryContext");

  return <div className="market-radar-page">
    <div className="page-top">
      <div><h1>{t("radar.eyebrow")}</h1><p>{t("radar.subtitle")}</p></div>
    </div>

    <section className="market-radar-hero">
      <div>
        <span className="eyebrow">{t("radar.heroEyebrow")}</span>
        <h2>{t("radar.heroTitle")}</h2>
        <p>{t("radar.heroText")}</p>
        <label className="market-idea-input">
          <span>{t("radar.ideaLabel")}</span>
          <input
            value={idea}
            maxLength={180}
            onChange={(event) => { setIdea(event.target.value); setReport(null); }}
            placeholder={t("radar.ideaPlaceholder")}
          />
          <small className={idea.trim().length > 0 && idea.trim().length < 8 ? "is-invalid" : ""}>
            {idea.trim().length < 8 ? t("dynamicExtra.ideaMinimum", { count: idea.trim().length }) : t("radar.ideaHint")}
          </small>
        </label>
      </div>
      <TrendingUp size={32} />
    </section>

    <form className="app-card market-radar-form" onSubmit={analyze}>
      <div className="market-radar-fields">
        <div className="market-radar-control">
          <span className="market-radar-control-label">{t("radar.audienceLabel")}</span>
          <button type="button" className="market-radar-trigger" aria-haspopup="dialog" aria-expanded={audiencesOpen} onClick={() => setAudiencesOpen(true)}>
            <span>{selectedAudienceLabels().join(", ") || t("radar.audiencePlaceholder")}</span>
            <small>{selectedAudiences.length} {t("radar.audiencesSelected")}</small>
          </button>
          {audiencesOpen ? <div className="market-radar-modal-backdrop" role="presentation" onMouseDown={() => setAudiencesOpen(false)}>
            <section className="market-radar-modal" role="dialog" aria-modal="true" aria-labelledby="market-audience-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="market-radar-modal-head">
                <div><span className="eyebrow">{t("radar.eyebrow")}</span><h2 id="market-audience-dialog-title">{t("radar.audienceLabel")}</h2></div>
                <button type="button" className="market-radar-modal-close" onClick={() => setAudiencesOpen(false)} aria-label={t("wizardExtra.close")}>×</button>
              </div>
              <p className="market-radar-modal-help">{t("radar.audienceHint")}</p>
              <div className="market-radar-option-grid">
                {audienceOptions.map(([value, label]) => <label key={value} className={selectedAudiences.includes(value) ? "selected" : ""}>
                  <input type="checkbox" checked={selectedAudiences.includes(value)} onChange={() => toggleAudience(value)} />
                  <span>{label}</span>
                </label>)}
              </div>
              <button type="button" className="btn btn-dark market-radar-modal-confirm" onClick={() => setAudiencesOpen(false)}>{t("radar.confirmAudience")}</button>
            </section>
          </div> : null}
        </div>

        <label>{t("radar.formatLabel")}
          <select value={format} onChange={(event) => setFormat(event.target.value as MarketRadarFormat)}>
            <option value="ebook">E-book</option>
            <option value="formation">{t("radar.formatTraining")}</option>
            <option value="template">{t("radar.formatTemplates")}</option>
            <option value="abonnement">{t("radar.formatSubscription")}</option>
          </select>
        </label>
      </div>
      {error ? <p className="store-error">{localizeSystemMessage(error, locale)}</p> : null}
      <button className="btn btn-dark" disabled={loading || idea.trim().length < 8 || selectedAudiences.length === 0}>
        {loading ? <><Loader2 size={16} className="market-radar-spinner" /> {t("radar.analyzing")}</> : t("radar.analyze")}
      </button>
      {loading ? <small className="market-radar-loading-note">{t("radar.recommendationsLoading")}</small> : null}
    </form>

    {report ? <>
      <section className="market-radar-score">
        <div className="market-radar-score-summary">
          <span className="eyebrow">{t("radar.scoreTitle")}</span>
          {report.score === null
            ? <strong className="market-radar-no-score">—</strong>
            : <strong>{report.score}<small>/100</small></strong>}
          <p>{report.score === null ? t("radar.noMeasuredScore") : `${t("radar.confidenceLabel")}: ${confidenceLabel}`}</p>
          <small className="market-radar-source-list">{report.liveSources.join(" · ") || t("radar.noLiveSources")}</small>
        </div>
        <div>
          <div className="market-dimension-grid">
            {scoreItems.map(({ label, value }) => <div key={label} className={value === null ? "is-unmeasured" : ""}>
              <small>{label}</small>
              <strong>{value === null ? "—" : value}</strong>
              {value === null ? <span>{t("radar.notMeasured")}</span> : <i><b style={{ width: `${value}%` }} /></i>}
            </div>)}
          </div>
          <div className="market-trend">
            <span>{t("radar.trendTitle")}{report.trend.countryCode ? ` · ${report.recommendedCountries.find((country) => country.code === report.trend.countryCode)?.name ?? report.trend.countryCode}` : ""}</span>
            <strong>{report.trend.currentIndex === null ? "—" : report.trend.currentIndex}
              <small>{report.trend.direction === "up" ? t("radar.trendUp") : report.trend.direction === "down" ? t("radar.trendDown") : report.trend.direction === "stable" ? t("radar.trendStable") : t("radar.trendUnknown")}</small>
            </strong>
            {report.trend.points.length ? <div aria-label={t("radar.trendIndexNote")}>{report.trend.points.map((point, index) => <i key={`${index}-${point}`} style={{ height: `${Math.max(8, point)}%` }} />)}</div> : null}
            <p>{report.trend.summary}</p>
            <small>{t("radar.trendIndexNote")}</small>
          </div>
        </div>
      </section>

      <section className="app-card market-ai-summary">
        <div className="card-head"><div><span className="eyebrow">{t("radar.aiSummaryEyebrow")}</span><h2>{t("radar.aiSummaryTitle")}</h2></div><Sparkles size={18} /></div>
        <p>{report.summary}</p>
        <small>{report.methodology}</small>
      </section>

      <section className="app-card market-country-recommendations">
        <div className="card-head"><div><span className="eyebrow">{t("radar.recommendationsEyebrow")}</span><h2>{t("radar.recommendationsTitle")}</h2></div><TrendingUp size={18} /></div>
        <p className="market-section-intro">{t("radar.recommendationsDescription")}</p>
        {report.recommendedCountries.length ? <div className="market-country-grid">
          {report.recommendedCountries.map((country, index) => <article className="market-country-card" key={country.code}>
            <div className="market-country-head">
              <div><span className="market-country-rank">{index + 1}</span><h3>{country.name}</h3></div>
              <strong>{country.score === null ? `${country.aiFitScore}/100` : `${country.score}/100`}
                <small>{country.score === null ? t("radar.aiFitHypothesis") : t("radar.testPriorityScore")}</small>
              </strong>
            </div>
            <span className={`market-country-status ${country.signalStatus === "measured" ? "is-measured" : "is-hypothesis"}`}>
              {country.signalStatus === "measured" ? t("radar.trendsBacked") : t("radar.hypothesis")}
            </span>
            <small className="market-country-source">{t("radar.sourceLabel")}: {country.source === "live" ? t("radar.sourceLive") : country.source === "cache" ? t("radar.sourceCache") : country.source === "stale" ? t("radar.sourceStale") : country.source === "error" ? t("radar.sourceError") : t("radar.sourceUnavailable")}</small>
            {country.trend.currentIndex !== null ? <p className="market-country-local-index">{t("radar.localIndex")}: {country.trend.currentIndex}/100 · {country.trend.sampleCount} {t("radar.observations")}</p> : null}
            <p>{country.rationale}</p>
            <small className="market-country-test"><strong>{t("radar.firstTest")}:</strong> {country.firstTest}</small>
          </article>)}
        </div> : <div className="market-radar-no-recommendations">{t("radar.noRecommendations")}</div>}
      </section>

      <section className="market-evidence-grid">
        <div className="app-card">
          <div className="card-head"><div><span className="eyebrow">{t("radar.evidenceEyebrow")}</span><h2>{t("radar.evidenceTitle")}</h2></div><Activity size={18} /></div>
          {report.evidence.map((item) => <div className="market-evidence" key={`${item.label}-${item.value}`}><small>{item.label}</small><strong>{item.value}</strong></div>)}
        </div>
        <div className="app-card">
          <div className="card-head"><div><span className="eyebrow">{t("radar.risksEyebrow")}</span><h2>{t("radar.risksTitle")}</h2></div><ShieldAlert size={18} /></div>
          {report.risks.map((risk, index) => <p className="market-risk" key={`${index}-${risk}`}>{risk}</p>)}
        </div>
      </section>

      {report.ideas.length ? <section className="app-card market-ideas">
        <div className="card-head"><div><span className="eyebrow">{t("radar.ideaConceptEyebrow")}</span><h2>{t("radar.ideaConceptTitle")}</h2></div><Lightbulb size={18} /></div>
        {report.ideas.map((item) => <article className="market-idea" key={item.title}>
          <div>
            <h3>{item.title}</h3><p>{item.promise}</p><small>{t("radar.conceptAudience")}: {item.audience}</small>
            {item.outline.length ? <ul>{item.outline.map((step) => <li key={step}>{step}</li>)}</ul> : null}
            <small>{t("radar.conceptUpsell")}: {item.upsell}</small>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => onGoToAI(t("dynamicExtra.expandIdea", { title: item.title, countries: targetCountries }))}>{t("radar.developWithAI")}</button>
        </article>)}
      </section> : null}
    </> : <div className="app-card market-empty"><Lightbulb size={24} /><strong>{t("radar.emptyTitle")}</strong><span>{t("radar.emptyText")}</span></div>}
  </div>;
}
