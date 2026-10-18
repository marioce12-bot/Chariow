import Link from "next/link";
import "./public-document.css";
type Section = {
    id: string;
    title: string;
    body: string[];
    bullets?: string[];
};
type Props = {
    kind: "about" | "terms" | "privacy" | "deletion";
    title: string;
    intro: string;
    sections: Section[];
    draft?: boolean;
};
const contacts = <><a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a> · <a href="https://wa.me/2290191829482" target="_blank" rel="noreferrer">WhatsApp +229 0191829482</a></>;
export default function PublicDocument({ kind, title, intro, sections, draft = false }: Props) {
    return <main className="public-doc"><header className="pd-top"><Link href="/" aria-label="Vendeo, accueil"><img src="/vendeo-logo-dark.svg" alt="Vendeo"/></Link><Link href="/" className="pd-home">← Accueil</Link></header>
 {draft && <div className="pd-draft" role="note"><strong>Version de travail — non publiée.</strong> Ce texte juridique est un projet à valider avant toute mise en production. Les éléments entre crochets ou signalés comme à confirmer nécessitent une validation.</div>}
 <div className="pd-layout"><aside className="pd-aside"><span className="pd-label">{kind === "about" ? "QUI NOUS SOMMES" : "CENTRE D’INFORMATION"}</span><nav aria-label="Sommaire"><a href="#document-intro">Vue d’ensemble</a>{sections.map(s => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</nav><div className="pd-contact"><b>Une question ?</b><p>Notre équipe est joignable directement.</p>{contacts}</div></aside>
 <article className="pd-article"><div className="pd-kicker">VENDEO <span>·</span> {kind === "about" ? "À PROPOS" : "INFORMATIONS"}</div><h1>{title}</h1><p className="pd-intro" id="document-intro">{intro}</p>{sections.map((s, i) => <section className="pd-section" id={s.id} key={s.id}><div className="pd-count">{String(i + 1).padStart(2, "0")}</div><div><h2>{s.title}</h2>{s.body.map((p, j) => <p key={j}>{p}</p>)}{s.bullets && <ul>{s.bullets.map(x => <li key={x}>{x}</li>)}</ul>}</div></section>)}
 <div className="pd-bottom"><h2>Besoin d’un échange ?</h2><p>Écrivez-nous, nous vous répondrons dès que possible.</p><div>{contacts}</div></div><footer className="pd-footer"><Link href="/terms">Conditions</Link><Link href="/privacy">Confidentialité</Link><Link href="/data-deletion">Suppression des données</Link><Link href="/about">À propos</Link></footer></article></div></main>;
}
