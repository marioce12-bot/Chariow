"use client";

import { useState } from "react";
import { Archive, BarChart3, ImageIcon, Layers3, Link2, ShieldCheck } from "lucide-react";
import "./performance-visuel.css";

const kpis = [
  { label: "Dépenses publicitaires", icon: BarChart3 },
  { label: "Clics", icon: Link2 },
  { label: "Commandes attribuées", icon: Layers3 },
  { label: "Coût par commande", icon: ShieldCheck },
  { label: "Chiffre d’affaires attribué", icon: BarChart3 },
];

export function PerformanceVisuelView() {
  const [period, setPeriod] = useState("30");

  return (
    <div className="creative-performance">
      <header className="creative-performance-header">
        <div>
          <div className="creative-performance-breadcrumb">Espace de travail <span aria-hidden="true">›</span> Performance visuel</div>
          <h1>Performance visuel</h1>
          <p>Reliez chaque création à son produit, sa campagne et sa variante — puis repérez ce qui convertit.</p>
        </div>
        <label className="creative-period">
          <span>Période</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Période de performance">
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
        </label>
      </header>

      <section className="creative-kpis" aria-label="Indicateurs de performance des créations">
        {kpis.map(({ label, icon: Icon }) => (
          <article className="creative-kpi" key={label}>
            <span className="creative-kpi-icon"><Icon size={17} aria-hidden="true" /></span>
            <div>
              <span className="creative-kpi-label">{label}</span>
              <strong aria-label={`${label} indisponible`}>—</strong>
              <small>En attente de données par création</small>
            </div>
          </article>
        ))}
      </section>

      <section className="creative-principles" aria-label="Fonctionnement de la bibliothèque">
        <article className="creative-principle">
          <span className="creative-principle-icon"><ImageIcon size={17} aria-hidden="true" /></span>
          <div><strong>Une fiche par média</strong><p>Un visuel réutilisé dans plusieurs campagnes reste une seule création, avec ses totaux et son détail par campagne et plateforme.</p></div>
        </article>
        <article className="creative-principle">
          <span className="creative-principle-icon"><Archive size={17} aria-hidden="true" /></span>
          <div><strong>Historique et suggestions encadrés</strong><p>Les campagnes archivées conservent leurs résultats. Les trois idées Studio ne seront proposées qu’après une campagne effectivement lancée et l’analyse de ses résultats par Vendeo; sinon, Vendeo demandera davantage de données. Les variantes proches seront signalées, jamais fusionnées automatiquement.</p></div>
        </article>
      </section>

      <section className="creative-library" aria-labelledby="creative-library-title">
        <div className="creative-library-head">
          <div>
            <h2 id="creative-library-title">Résultats par création</h2>
            <p>Une ligne par média, avec ses performances agrégées et sa ventilation.</p>
          </div>
          <span className="creative-data-status"><i aria-hidden="true" /> Aucune donnée fictive</span>
        </div>
        <div className="creative-table-scroll" role="region" aria-label="Résultats par création" tabIndex={0}>
          <div className="creative-table" role="table" aria-label="Performances des créations">
            <div className="creative-table-row creative-table-header" role="row">
              <span role="columnheader">Créatif</span>
              <span role="columnheader">Produit · campagne · variante</span>
              <span role="columnheader">Dépenses</span>
              <span role="columnheader">Clics</span>
              <span role="columnheader">Commandes</span>
              <span role="columnheader">Coût / commande</span>
              <span role="columnheader">CA attribué</span>
            </div>
            <div className="creative-empty" role="row">
              <div className="creative-empty-icon"><ImageIcon size={22} aria-hidden="true" /></div>
              <h3 role="cell">Aucune performance par création pour le moment</h3>
              <p role="cell">Les campagnes existantes ne sont pas encore reliées à une bibliothèque de médias et à leurs métriques détaillées. Aucun chiffre de la maquette n’est présenté comme un résultat réel.</p>
              <p className="creative-empty-rule" role="cell">Aucune idée de créatif ne sera proposée pour un produit non promu, sans campagne lancée ou sans historique analysé.</p>
            </div>
          </div>
        </div>
        <footer className="creative-library-foot">
          <span>Les produits gagnants resteront un badge ou un filtre dans les vues existantes.</span>
          <span>Empreintes exactes et perceptuelles à relier au stockage des médias.</span>
        </footer>
      </section>
    </div>
  );
}
