// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.
#import "../report-theme.typ": report-accent, report-theme
#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary
#let glossary = (
  (key: "roas", short: "ROAS", long: "retour sur dépenses publicitaires", description: "Valeur des conversions attribuées divisée par dépenses publicitaires, selon le suivi et le modèle d’attribution utilisés."),
  (key: "cout_resultat", short: "coût par résultat", long: "coût par résultat", description: "Dépenses divisées par le nombre de résultats définis et rapportés; le résultat doit être nommé précisément."),
  (key: "fenetre_attribution", short: "fenêtre d’attribution", long: "fenêtre d’attribution", description: "Période après une interaction pendant laquelle une conversion peut être créditée à une annonce selon les paramètres retenus."),
  (key: "phase_apprentissage", short: "phase d’apprentissage", long: "phase d’apprentissage", description: "Période où un système de diffusion explore la livraison d’une campagne; les résultats peuvent être moins stables et les règles sont propres à la plateforme."),
  (key: "incremente", short: "incrémental", long: "effet incrémental", description: "Part du résultat qui n’aurait probablement pas eu lieu sans l’exposition publicitaire; elle ne se déduit pas directement du seul ROAS attribué.")
)
#show: make-glossary
#register-glossary(glossary)
#set page(footer: context {
  grid(columns: (1fr, auto, auto), gutter: 0.45cm,
    [#text(size: 8pt, fill: luma(105))[VENDEO · GUIDES PRATIQUES]],
    [#text(size: 8pt, fill: luma(105))[#counter(page).display()]],
    image("../../../public/vendeo-logo.png", width: 2.45cm),
  )
})
#let panel(title, body) = block(fill: rgb("#F1F5FF"), inset: 12pt, radius: 4pt, width: 100%, breakable: true)[
  #text(size: 10pt, weight: "bold", fill: report-accent)[#title]
  #v(4pt)
  #body
]
#show: report-theme.with(
  title: "Analyser et optimiser ses performances publicitaires",
  author: "Vendeo",
  rhythm: "report",
  running-header: true,
)
  // Cover page
  #page(header: none)[
  #set par(justify: false)
  #v(1.6cm)
  #text(size: 9pt, weight: "bold", fill: report-accent)[VENDEO  ·  PARCOURS DE FORMATION]
  #v(2.0cm)
  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[Analyser et optimiser ses performances publicitaires]
  #v(0.35cm)
  #text(size: 14pt, fill: report-accent)[Lire les chiffres, diagnostiquer et tester avec méthode]
  #v(0.7cm)
  #line(length: 100%, stroke: 1.2pt + report-accent)
  #v(0.8cm)
  #text(size: 10.5pt, fill: luma(70))[POUR QUI : Annonceurs et entrepreneurs qui veulent comprendre leurs rapports publicitaires sans confondre attribution, chiffre d’affaires et rentabilité.]
  #v(0.65cm)
  #panel("Objectif de ce guide", [Vous saurez calculer les indicateurs courants, diagnostiquer un parcours de conversion et préparer un test interprétable sans promettre de résultat universel.])
  #v(0.55cm)
  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]
  #v(0.2cm)
- Relier métriques de plateforme et objectif d’affaires.
- Calculer coût par résultat et ROAS, puis identifier ce qu’ils ne disent pas.
- Diagnostiquer par étape et décider à partir de données vérifiées.
- Contrôler les événements Pixel et distinguer un problème de suivi d’une absence réelle de ventes.
  #v(0.7cm)
  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 12 novembre 2026]
  ]
  #page(header: none)[
  #outline(title: [Sommaire], depth: 2, indent: 1.1em)
  ]
  #heading(numbering: none, outlined: false)[Avant de commencer]
  Les rapports publicitaires décrivent des événements selon les définitions, fenêtres et modèles de la plateforme. Ils ne remplacent pas la comptabilité, l’analyse de marge ni les règles d’attribution. Une optimisation utile commence par une question claire et des données de qualité.
  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])
  #heading(numbering: none, outlined: false)[Repères pratiques]
  #text(weight: "bold", fill: report-accent)[Pour qui ?]
  Annonceurs et entrepreneurs qui veulent comprendre leurs rapports publicitaires sans confondre attribution, chiffre d’affaires et rentabilité.
  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]
  Vous saurez calculer les indicateurs courants, diagnostiquer un parcours de conversion et préparer un test interprétable sans promettre de résultat universel.
  = Partir de l’objectif et distinguer les indicateurs
  Impressions, clics et conversions n’ont pas la même signification. Choisissez des indicateurs qui répondent à la décision que vous devez prendre et gardez séparés les signaux de diagnostic et les résultats d’affaires.
  == Points à retenir
  - Visibilité, visites, demandes et ventes sont des objectifs différents; définissez une conversion observable et la qualité attendue.
- Suivez les résultats d’affaires — commandes confirmées, demandes qualifiées, revenus — avec les indicateurs de diagnostic comme impressions ou clics.
- Fixez période, devise, source de données et définition de conversion avant de comparer les campagnes.
  #panel("À mettre en pratique", [Écrivez l’objectif et la métrique principale, puis deux indicateurs de diagnostic et une mesure de qualité en aval. Notez où chaque valeur est enregistrée.])
  #panel("Exemple de travail", [Un taux de clic élevé peut indiquer que le message attire l’attention; il ne prouve pas que l’offre convient ou que la page convertit.])
  = Calculer le coût par résultat et le ROAS
  Deux calculs simples facilitent la lecture, à condition de préciser ce que l’on compte. Le coût par résultat décrit une dépense moyenne; le ROAS compare une valeur attribuée à la dépense publicitaire.
  == Points à retenir
  - Coût par résultat = dépenses publicitaires ÷ nombre de résultats attribués. Définissez le résultat : demande valide, achat ou autre action.
- ROAS = valeur des conversions attribuées ÷ dépenses publicitaires. Un résultat de 3,5 correspond à 3,5 € de valeur mesurée par euro dépensé, soit 350 %.
- Le ROAS n’est pas une marge : il ne déduit pas coût produit, livraison, frais de paiement, remises, retours, salaires ni dépenses hors publicité.
  #panel("À mettre en pratique", [Refaites les calculs à partir des dépenses, résultats, valeurs et période du rapport. Vérifiez la devise, les doublons et les retours avant de les présenter.])
  #panel("Exemple de travail", [Exemple pédagogique : 300 € dépensés, 15 conversions et 1 050 € de valeur attribuée donnent 20 € par conversion et un ROAS de 1 050 ÷ 300 = 3,5 (350 %). La rentabilité dépend encore de tous les coûts et de l’incrémentalité.])
  = Interpréter attribution, délais et apprentissage
  Les paramètres d’attribution changent le crédit rapporté à une campagne. Une conversion récente peut ne pas être remontée, et deux campagnes ayant des fenêtres différentes ne sont pas toujours comparables.
  == Points à retenir
  - Consignez le modèle et la fenêtre d’attribution, les interactions admissibles et le délai entre clic ou vue et conversion.
- Comparez les périodes après avoir laissé le temps nécessaire aux conversions de remonter; vérifiez la cohérence avec une source indépendante lorsque c’est possible.
- Meta décrit une phase d’apprentissage pendant laquelle la diffusion explore les résultats; le repère d’environ 50 événements d’optimisation par semaine est généralement observé, pas une garantie ni une règle universelle.
  #panel("À mettre en pratique", [Dans chaque bilan, notez plateforme, objectif d’optimisation, modèle/fenêtre, dates, fuseau, délais connus et changements significatifs.])
  #panel("Exemple de travail", [Si un rapport compte des achats sur sept jours après clic et l’autre sur une autre fenêtre, les totaux ne doivent pas être interprétés comme une comparaison directe sans harmoniser les réglages.])
  = Diagnostiquer le parcours de conversion
  Repérez où le parcours se dégrade — diffusion, clic, visite, conversion, qualité ou valeur. Formulez une hypothèse avant de modifier la campagne.
  == Points à retenir
  - Si les impressions sont faibles, vérifiez diffusion, budget, audience, dates et statut avant de réécrire les créations.
- Si les clics ne deviennent pas conversions, vérifiez la page et le formulaire, puis testez dans Events Manager que le bon Pixel reçoit l’événement attendu sans doublon, avec valeur et devise correctes.
- Si les conversions sont nombreuses mais de faible qualité, examinez la cohérence du ciblage, le message, les critères de qualification et le traitement des prospects.
  #panel("À mettre en pratique", [Cartographiez volume, coût, qualité, source et anomalies. Testez le Pixel; avant de modifier les dépenses, vérifiez une seule cause.])
  #panel("Exemple de travail", [Des clics sans demandes peuvent venir d’une promesse trop large, d’un formulaire défaillant ou d’un événement de suivi incorrect; vérifiez ces points avant de conclure que le ciblage est mauvais.])
  = Tester une hypothèse sans surinterpréter
  Un test ne devient pas concluant parce qu’une version affiche temporairement un meilleur chiffre. Les décisions doivent tenir compte du volume, du délai, des changements concomitants et de la qualité des données.
  == Points à retenir
  - Formulez une hypothèse avec une cause attendue, une métrique principale et un indicateur garde-fou.
- Ne changez qu’une variable principale et gardez autant que possible le public, l’offre, la destination et la période comparables.
- Définissez à l’avance la durée, la règle d’arrêt, la décision possible et ce que le test ne permet pas de conclure.
  #panel("À mettre en pratique", [Documentez la version, la date, les dépenses, le paramétrage et le résultat. Après le test, écrivez les observations brutes, l’interprétation et les données supplémentaires nécessaires.])
  #panel("Exemple de travail", [Hypothèse : une accroche décrivant le bénéfice attirera davantage de visites qualifiées sans réduire les demandes valides. Un clic supplémentaire seul ne confirme pas l’hypothèse complète.])
  = Atelier guidé
  Exercice guidé (20–30 min) : utilisez les nombres ci-dessous comme exemple fictif et construisez une lecture équilibrée.
  + Avec 300 € dépensés, 15 conversions et 1 050 € de valeur attribuée, calculez le coût par conversion : 300 ÷ 15 = 20 €.
+ Calculez le ROAS : 1 050 ÷ 300 = 3,5, soit 350 %.
+ Listez au moins trois coûts non inclus dans ce rapport : produit, livraison, frais, remises, retours ou main-d’œuvre.
+ Notez la fenêtre d’attribution, le délai de remontée et la qualité réelle des conversions.
+ Proposez un test avec une seule hypothèse, une métrique principale, un garde-fou et une période d’observation.
+ Écrivez quelle donnée supplémentaire serait nécessaire avant de décider de poursuivre ou d’augmenter le budget.
  #panel("Livrable", [Livrable : un mini-bilan qui distingue valeurs rapportées, calculs, coûts absents, limites d’attribution et décision provisoire.])
  = Liste de contrôle avant d’avancer
  - La métrique principale correspond à un objectif d’affaires explicite.
- La définition du résultat, période et devise est consignée.
- Coût par résultat et ROAS sont recalculés à partir de chiffres vérifiés.
- Les coûts hors publicité et la marge sont examinés séparément.
- Le modèle et la fenêtre d’attribution sont connus.
- La qualité des conversions et le suivi technique sont contrôlés.
- Un test change une dimension principale et prévoit ses limites.
- Les événements Pixel ont été vérifiés dans Events Manager et rapprochés, lorsque c’est possible, avec les commandes confirmées de la boutique.
  = Limites et précautions
  - Le ROAS attribué n’est ni bénéfice ni preuve d’effet incrémental.
- Les fenêtres, modèles et noms de paramètres des plateformes évoluent; vérifiez-les avant chaque analyse.
- Le repère d’apprentissage Meta n’est pas une garantie et ne s’applique pas à toutes les plateformes.
- Google Trends mesure un intérêt relatif de recherche, pas les ventes ou une causalité.
- Respectez confidentialité et règles applicables aux données de conversion.
- Un événement Pixel visible en test confirme la réception de cet événement, pas à lui seul l’attribution publicitaire, l’absence de doublons sur toutes les commandes ni la rentabilité.
  = Glossaire essentiel
  #print-glossary(glossary, show-all: true)
  = Sources et vérification
  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.sba.gov/counseling/manage-your-business/")[U.S. Small Business Administration — Manage your business]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Objectifs, budget marketing, comparaison des coûts et revenus et mesure cohérente; cadre général à adapter.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://support.google.com/google-ads/answer/6268637?hl=en")[Google Ads Help — About Target ROAS bidding]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Définition d’un ratio de valeur de conversion par dépense et importance de rapporter correctement les valeurs; options Google Ads pouvant évoluer.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/112167992830700")[Meta Business Help Center — About the learning phase]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Description de la phase d’apprentissage Meta, résultats moins stables et repère indicatif des résultats d’optimisation.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/460276478298895")[Meta Business Help Center — About attribution models and attribution settings]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Effet des modèles et fenêtres d’attribution sur les conversions rapportées et prudence lors des comparaisons.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://support.google.com/trends/answer/4365533?hl=en")[Google Trends Help — FAQ about Google Trends data]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Échantillonnage, normalisation et limites de Trends lorsqu’il est utilisé comme signal de marché.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/2040882565969969")[Meta Business Help Center — Test events tool: verify app and web browser events for Meta]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Vérification des événements web dans Test Events, ouverture de la page pendant le test et délais de remontée; consulté le 12 novembre 2026.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking")[Meta for Developers — Conversion Tracking with the Meta Pixel]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Événements standards, valeurs et devises de conversion, et configuration du suivi; consulté le 12 novembre 2026.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/TroubleshootEventSetupTool")[Meta Business Help Center — Troubleshoot the event setup tool for web in Meta Events Manager]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Dépannage des événements absents, erreurs de détection et événements répétés; consulté le 12 novembre 2026.]
  ]
  #v(0.35cm)
  #text(size: 9pt, fill: luma(80))[Sources consultées jusqu’au 12 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]
