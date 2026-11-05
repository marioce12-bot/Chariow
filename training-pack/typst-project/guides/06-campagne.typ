// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.
#import "../report-theme.typ": report-accent, report-theme
#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary
#let glossary = (
  (key: "objectif_campagne", short: "objectif de campagne", long: "objectif de campagne", description: "Résultat de diffusion choisi dans la plateforme, sélectionné en fonction de l’action commerciale que l’annonce cherche à soutenir."),
  (key: "conversion", short: "conversion", long: "conversion", description: "Action définie et mesurée, par exemple une demande valide ou un achat; sa définition doit être cohérente entre annonce et système de suivi."),
  (key: "destination", short: "destination", long: "destination", description: "Page, formulaire ou expérience où la personne arrive après avoir interagi avec l’annonce."),
  (key: "plafond_budget", short: "plafond", long: "plafond de dépense", description: "Limite interne de dépenses autorisées pour contrôler le risque d’un test publicitaire."),
  (key: "attribution", short: "attribution", long: "attribution", description: "Règle qui attribue un crédit à une interaction publicitaire pour une conversion mesurée; les fenêtres et modèles influencent le rapport.")
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
  title: "Préparer et lancer une campagne Meta Ads",
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
  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[Préparer et lancer une campagne Meta Ads]
  #v(0.35cm)
  #text(size: 14pt, fill: report-accent)[Relier objectif, offre, budget et mesure avant publication]
  #v(0.7cm)
  #line(length: 100%, stroke: 1.2pt + report-accent)
  #v(0.8cm)
  #text(size: 10.5pt, fill: luma(70))[POUR QUI : Petites entreprises, indépendants et responsables marketing qui lancent une campagne payante sur les services Meta.]
  #v(0.65cm)
  #panel("Objectif de ce guide", [Vous suivrez une séquence de préparation, de vérification, de lancement et de contrôle pour engager un budget maîtrisé et interpréter les premiers résultats avec prudence.])
  #v(0.55cm)
  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]
  #v(0.2cm)
- Choisir un objectif aligné sur une action d’affaires observable.
- Vérifier offre, destination, audience et création avant de dépenser.
- Définir plafond, indicateurs, contrôles post-lancement et décision suivante.
  #v(0.7cm)
  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 5 novembre 2026]
  ]
  #page(header: none)[
  #outline(title: [Sommaire], depth: 2, indent: 1.1em)
  ]
  #heading(numbering: none, outlined: false)[Avant de commencer]
  Une campagne ne commence pas par le bouton « publier ». Elle commence par une offre compréhensible, un public plausible, une destination fonctionnelle et une action mesurable. Les options Meta évoluent et varient selon les comptes; vérifiez les réglages officiels avant chaque lancement.
  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])
  #heading(numbering: none, outlined: false)[Repères pratiques]
  #text(weight: "bold", fill: report-accent)[Pour qui ?]
  Petites entreprises, indépendants et responsables marketing qui lancent une campagne payante sur les services Meta.
  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]
  Vous suivrez une séquence de préparation, de vérification, de lancement et de contrôle pour engager un budget maîtrisé et interpréter les premiers résultats avec prudence.
  = Traduire l’objectif commercial en objectif de diffusion
  Une métrique de plateforme n’est utile que si elle sert une décision d’affaires. Un clic, une conversation ou une vente ne représentent pas le même objectif et ne nécessitent pas les mêmes réglages.
  == Points à retenir
  - Écrivez l’action utile : être découvert, obtenir une visite qualifiée, générer une demande, démarrer une conversation ou réaliser une vente.
- Meta décrit six objectifs simplifiés — notoriété, trafic, interaction, prospects, promotion d’application et ventes — mais les libellés et options peuvent évoluer.
- Séparez l’objectif de campagne, le lieu de conversion et le résultat d’optimisation : ces réglages sont liés mais ne sont pas interchangeables.
  #panel("À mettre en pratique", [Rédigez : « Nous voulons que [public] fasse [action] afin de [résultat]. » Choisissez ensuite l’objectif de plateforme cohérent et définissez comment vérifier l’action hors de la plateforme.])
  #panel("Exemple de travail", [Si l’objectif est de vendre, compter uniquement les clics ne suffit pas; il faut vérifier que l’achat est correctement mesuré et que la valeur rapportée est cohérente.])
  = Valider l’offre et la destination
  La campagne envoie des personnes vers une expérience qui doit prolonger la promesse annoncée. Un clic qui arrive sur une page lente, incompréhensible ou différente de l’offre peut produire un mauvais résultat sans que l’annonce soit la seule cause.
  == Points à retenir
  - Présentez le public concerné, le problème, le contenu de l’offre, le prix ou les conditions importantes et la prochaine étape.
- Vérifiez que l’annonce et la destination portent la même promesse, le même produit et les mêmes modalités.
- Testez le parcours sur téléphone et ordinateur : chargement, liens, formulaire ou paiement, quantité d’informations demandées et confirmation.
  #panel("À mettre en pratique", [Faites un parcours complet comme un client avant toute dépense. Corrigez les liens, formulaires, informations de prix et messages de confirmation; notez la version vérifiée.])
  #panel("Exemple de travail", [Un rabais affiché doit préciser la durée et les conditions pertinentes; une destination qui présente un prix différent crée une rupture de confiance.])
  = Définir un public et des créations cohérentes
  Le ciblage doit être assez défendable pour orienter une campagne sans prétendre connaître parfaitement tous les acheteurs. Les annonces doivent présenter des bénéfices vérifiables et rester cohérentes avec les règles de la plateforme.
  == Points à retenir
  - Décrivez le public en fonction de besoins, contexte et zone réellement desservie; justifiez ce choix par plusieurs indices.
- Préparez quelques variantes de texte ou de visuel qui testent une différence identifiable, sans changer toutes les variables en même temps.
- Vérifiez les droits d’images, témoignages, musiques et marques, ainsi que les politiques actuelles; l’approbation d’une annonce ne peut être garantie.
  #panel("À mettre en pratique", [Pour chaque création, consignez l’hypothèse, le texte, l’image, l’appel à l’action, la destination, les droits et la version. Vérifiez l’aperçu dans chaque placement utilisé.])
  #panel("Exemple de travail", [Un visuel peut varier sur le bénéfice mis en avant tout en conservant offre, audience et page d’arrivée, afin de rendre la comparaison plus interprétable.])
  = Fixer une enveloppe de test et des règles de pilotage
  Un budget de test doit rester compatible avec la trésorerie, la marge, le coût de service et la capacité à traiter les demandes. Aucun montant ou coût par résultat universel ne convient à toutes les entreprises.
  == Points à retenir
  - Déterminez un plafond que l’entreprise accepte de perdre si le test n’apporte pas de résultat utile; obtenez l’approbation de la personne responsable.
- Choisissez une métrique principale et des indicateurs de qualité en aval; définissez les règles d’arrêt ou de modification avant la publication.
- Tenez compte de la fenêtre d’attribution, du délai de remontée des résultats, de la devise et des coûts hors publicité.
  #panel("À mettre en pratique", [Écrivez la somme maximale, la durée ou date de revue, la métrique principale, les garde-fous, le responsable et les actions possibles. Ne présentez pas un coût cible comme une performance promise.])
  #panel("Exemple de travail", [Si les demandes arrivent mais ne correspondent pas au public visé, examinez leur qualité et le parcours avant d’augmenter le budget.])
  = Contrôler le lancement et suivre les premières données
  Le contrôle après publication vérifie que la campagne fonctionne comme prévu; l’analyse doit ensuite comparer les observations aux critères définis. Les premières variations ne suffisent pas à prouver une tendance stable.
  == Points à retenir
  - Contrôlez l’état de diffusion, le budget, les dates, la destination, les liens et la présentation réelle sur mobile.
- Vérifiez que l’événement de conversion se déclenche correctement et que les valeurs et devises sont cohérentes; surveillez doublons et retards de remontée.
- Notez toute modification et évitez d’attribuer une évolution à une seule variable lorsque plusieurs changements ont été faits.
  #panel("À mettre en pratique", [Planifiez une revue au lancement puis à l’intervalle prévu; enregistrez dépenses, résultats, qualité, anomalies, modifications et décision suivante.])
  #panel("Exemple de travail", [Une hausse de clics sans demandes valides peut signaler un problème de promesse, de page ou de mesure; elle ne justifie pas automatiquement davantage de budget.])
  = Atelier guidé
  Exercice guidé (30–45 min) : préparez une fiche de campagne complète sans la publier.
  + Écrivez l’objectif commercial, l’action et le résultat observable; choisissez l’objectif Meta correspondant.
+ Décrivez l’offre, ses conditions et la destination; testez le parcours complet sur mobile.
+ Décrivez le public et la zone servis; notez deux indices qui appuient ce choix.
+ Rédigez deux concepts avec hypothèse, texte, visuel, action et destination; vérifiez preuves et droits.
+ Fixez un plafond de dépense, une date de revue, un indicateur principal et un contrôle qualité.
+ Utilisez la liste de contrôle avant publication et planifiez la revue post-lancement.
  #panel("Livrable", [Livrable : une fiche d’une page que le responsable peut approuver avant tout engagement de dépense.])
  = Liste de contrôle avant d’avancer
  - L’objectif, la conversion et la source de mesure sont définis.
- L’offre, les prix, conditions et destination sont cohérents.
- Le public et la zone sont justifiés par des indices plausibles.
- Le budget maximal et la personne autorisée sont confirmés.
- Les créations, droits, règles et aperçus sont contrôlés.
- Les liens, formulaires et événements de conversion sont testés.
- La date de revue, les garde-fous et les critères de décision sont écrits.
  = Limites et précautions
  - Les objectifs, réglages et politiques Meta peuvent évoluer et varier selon les comptes et marchés.
- Les standards publicitaires ne garantissent ni l’approbation ni la performance d’une annonce.
- Un clic, un lead ou une valeur attribuée n’est pas nécessairement un bénéfice ou un client rentable.
- Respectez les règles locales sur publicité, consommation, confidentialité et mesure.
- Ne dépensez pas un budget non autorisé et ne communiquez pas d’allégations non prouvées.
  = Glossaire essentiel
  #print-glossary(glossary, show-all: true)
  = Sources et vérification
  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/1438417719786914")[Meta Business Help Center — How to choose the right ad objective in Ads Manager]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Six objectifs simplifiés et distinctions entre objectif de campagne, lieu de conversion et performance; les libellés peuvent évoluer.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/488043719226449")[Meta Business Help Center — About Meta Advertising Standards]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Application des standards aux annonces payantes, attributs personnels, contenus et politiques additionnelles.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://legacy.sba.gov/business-guide/plan-your-business/market-research-competitive-analysis")[U.S. Small Business Administration — Market research and competitive analysis]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Analyse du marché, de la demande, de la concurrence et de la localisation; cadre à adapter au territoire visé.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://support.google.com/trends/answer/4365533?hl=fr")[Google Trends Help — FAQ about Google Trends data]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Limites des tendances de recherche lorsqu’elles sont utilisées pour explorer la demande.]
  ]
  #v(0.35cm)
  #text(size: 9pt, fill: luma(80))[Sources consultées le 5 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]
