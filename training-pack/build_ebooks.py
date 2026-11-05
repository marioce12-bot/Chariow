#!/usr/bin/env python3
"""Generate the seven French Vendeo training PDFs from reviewed JSON sources."""
from __future__ import annotations

import json
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "training-pack"
GUIDES = PACK / "guide-content"
SOURCE_DIR = PACK / "typst-project" / "guides"


def q(value: str) -> str:
    """Return a Typst string literal."""
    return json.dumps(str(value), ensure_ascii=False)


def markup(value: str) -> str:
    """Escape Typst markup controls while retaining deliberate @glossary refs."""
    return (str(value).replace("\\", "\\\\")
            .replace("#", r"\#")
            .replace("$", r"\$")
            .replace("*", r"\*"))


def bullet_list(items: list[str], marker: str = "-") -> str:
    return "\n".join(f"{marker} {markup(item)}" for item in items)


def render_source(data: dict) -> str:
    glossary = data["glossary"]
    glossary_code = ",\n".join(
        "  (key: %s, short: %s, long: %s, description: %s)" % (
            q(term["key"]), q(term["short"]), q(term["long"]), q(term["description"])
        )
        for term in glossary
    )

    out = [
        "// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.",
        '#import "../report-theme.typ": report-accent, report-theme',
        '#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary',
        f"#let glossary = (\n{glossary_code}\n)",
        "#show: make-glossary",
        "#register-glossary(glossary)",
        "#set page(footer: context {",
        "  grid(columns: (1fr, auto, auto), gutter: 0.45cm,",
        '    [#text(size: 8pt, fill: luma(105))[VENDEO · GUIDES PRATIQUES]],',
        '    [#text(size: 8pt, fill: luma(105))[#counter(page).display()]],',
        '    image("../../../public/vendeo-logo.png", width: 2.45cm),',
        "  )",
        "})",
        "#let panel(title, body) = block(fill: rgb(\"#F1F5FF\"), inset: 12pt, radius: 4pt, width: 100%, breakable: true)[",
        '  #text(size: 10pt, weight: "bold", fill: report-accent)[#title]',
        "  #v(4pt)",
        "  #body",
        "]",
        "#show: report-theme.with(",
        f"  title: {q(data['title'])},",
        "  author: \"Vendeo\",",
        '  rhythm: "report",',
        "  running-header: true,",
        ")",
        "  // Cover page",
        "  #page(header: none)[",
        "  #set par(justify: false)",
        "  #v(1.6cm)",
        '  #text(size: 9pt, weight: "bold", fill: report-accent)[VENDEO  ·  PARCOURS DE FORMATION]',
        "  #v(2.0cm)",
        f'  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[{markup(data["title"])}]',
        "  #v(0.35cm)",
        f'  #text(size: 14pt, fill: report-accent)[{markup(data["subtitle"])}]',
        "  #v(0.7cm)",
        '  #line(length: 100%, stroke: 1.2pt + report-accent)',
        "  #v(0.8cm)",
        f'  #text(size: 10.5pt, fill: luma(70))[POUR QUI : {markup(data["reader"])}]',
        "  #v(0.65cm)",
        f'  #panel("Objectif de ce guide", [{markup(data["promise"])}])',
        "  #v(0.55cm)",
        '  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]',
        "  #v(0.2cm)",
        bullet_list(data["outcomes"]),
        "  #v(0.7cm)",
        '  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 5 novembre 2026]',
        "  ]",
        "  #page(header: none)[",
        "  #outline(title: [Sommaire], depth: 2, indent: 1.1em)",
        "  ]",
        "  #heading(numbering: none, outlined: false)[Avant de commencer]",
        f"  {markup(data['intro'])}",
        '  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])',
        "  #heading(numbering: none, outlined: false)[Repères pratiques]",
        '  #text(weight: "bold", fill: report-accent)[Pour qui ?]',
        f"  {markup(data['reader'])}",
        '  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]',
        f"  {markup(data['promise'])}",
    ]

    for index, section in enumerate(data["sections"], start=1):
        out.extend([
            f"  = {markup(section['heading'])}",
            f"  {markup(section['intro'])}",
            "  == Points à retenir",
            "  " + bullet_list(section["points"]),
            f'  #panel("À mettre en pratique", [{markup(section["action"])}])',
        ])
        if section.get("example"):
            out.append(f'  #panel("Exemple de travail", [{markup(section["example"])}])')

    exercise = data["exercise"]
    out.extend([
        "  = Atelier guidé",
        f"  {markup(exercise['intro'])}",
        "  " + bullet_list(exercise["steps"], marker="+"),
        f'  #panel("Livrable", [{markup(exercise["deliverable"])}])',
        "  = Liste de contrôle avant d’avancer",
        "  " + bullet_list(data["checklist"]),
        "  = Limites et précautions",
        "  " + bullet_list(data["cautions"]),
        "  = Glossaire essentiel",
        "  #print-glossary(glossary, show-all: true)",
        "  = Sources et vérification",
        "  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.",
    ])
    for source in data["sources"]:
        out.extend([
            "  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[",
            f'    #text(size: 10pt, weight: "bold", fill: report-accent)[#link({q(source["url"])})[{markup(source["title"])}]]',
            "    #linebreak()",
            f'    #text(size: 9pt, fill: luma(80))[Utilisée pour : {markup(source["supports"])}]',
            "  ]",
        ])
    out.extend([
        "  #v(0.35cm)",
        '  #text(size: 9pt, fill: luma(80))[Sources consultées le 5 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]',
    ])
    return "\n".join(out) + "\n"


def main() -> None:
    source_dir = SOURCE_DIR
    source_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(GUIDES.glob("*.json"))
    if len(files) != 8:
        raise SystemExit(f"Attendu : 8 fichiers JSON de guide, trouvé : {len(files)}")

    outputs: list[Path] = []
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        source = source_dir / f"{path.stem}.typ"
        output = PACK / data["file"]
        source.write_text(render_source(data), encoding="utf-8")
        print(f"Compilation : {output.name}", flush=True)
        subprocess.run(
            ["typst", "compile", "--root", str(ROOT), str(source), str(output)],
            cwd=ROOT,
            check=True,
        )
        if not output.is_file() or output.stat().st_size < 20_000:
            raise SystemExit(f"PDF absent ou trop petit : {output}")
        outputs.append(output)
        print(f"  OK — {output.stat().st_size:,} octets", flush=True)

    archive_dir = ROOT / "training-assets"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive = archive_dir / "formation-vendeo-guides.zip"
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for output in outputs:
            bundle.write(output, arcname=output.name)
        bundle.writestr(
            "README.txt",
            "Pack de formation Vendeo — 8 guides PDF pratiques. "
            "Les procédures de plateformes évoluent : consultez les sources officielles indiquées dans chaque guide.\n",
        )
    print(f"Archive prête : {archive.relative_to(ROOT)} ({archive.stat().st_size:,} octets)", flush=True)


if __name__ == "__main__":
    main()
