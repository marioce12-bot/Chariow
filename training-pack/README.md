# Pack de formation Vendeo

Le dossier contient huit guides pratiques réécrits en français, leurs sources éditoriales structurées et les PDF prêts à distribuer. Chaque guide comprend une couverture, un sommaire, des chapitres procéduraux, un atelier guidé, une liste de contrôle, un glossaire, des précautions et des références cliquables. Le logo Vendeo figure dans le pied de page de chaque page.

## Guides

1. `01-comprendre-le-marche.pdf` — Comprendre le marché des produits digitaux.
2. `02-analyser-une-opportunite.pdf` — Trouver et analyser une opportunité.
3. `03-configurer-meta-ads.pdf` — Configurer son compte Meta Ads.
4. `04-creer-un-ebook.pdf` — Créer un ebook utile avec l’IA.
5. `05-creer-des-visuels.pdf` — Créer des visuels publicitaires efficaces.
6. `06-lancer-une-campagne.pdf` — Préparer et lancer une campagne Meta Ads.
7. `07-analyser-les-performances.pdf` — Analyser et optimiser ses performances publicitaires.
8. `08-creer-ses-comptes-publicitaires.pdf` — Créer ses comptes Meta Ads, Pinterest Ads et TikTok Ads.

## Reconstruction

Depuis la racine du dépôt, avec Python 3, Typst et un accès au dépôt de paquets Typst :

```bash
python3 training-pack/build_ebooks.py
```

Le générateur lit les fichiers JSON dans `training-pack/guide-content/`, écrit les sources Typst sous `training-pack/typst-project/guides/`, compile les PDF et reconstruit `training-assets/formation-vendeo-guides.zip`, l’archive servie par l’application. Le thème commun est `training-pack/typst-project/report-theme.typ`. Les glossaires utilisent `@preview/glossarium:0.5.10` ([documentation du paquet](https://typst.app/universe/package/glossarium/)).

## Base documentaire

Les références intégrées sont des sources publiques officielles (Meta, Google, WIPO, OpenAI, Pinterest, TikTok et U.S. Small Business Administration). Les URL, l’usage éditorial et les limites de chaque source sont consignés dans les fichiers de contenu. Les pages ont été consultées les 4, 5 et 12 novembre 2026. Les interfaces, politiques et conditions peuvent changer : revérifier les sources avant d’appliquer une procédure.

Ces guides sont pédagogiques. Ils ne promettent pas de ventes ou de performances et ne remplacent pas un avis juridique, financier ou professionnel adapté au pays et au secteur concernés. La SBA est une agence américaine; ses ressources servent ici de cadre de questions et ne constituent pas des statistiques locales pour un autre pays.
