// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.
#import "../report-theme.typ": report-accent, report-theme
#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary
#let glossary = (
  (key: "hypothese", short: "hypothèse", long: "hypothèse", description: "Énoncé provisoire sur un public, un besoin ou une solution, formulé de façon à pouvoir être vérifié ou remis en question."),
  (key: "proposition_valeur", short: "proposition de valeur", long: "proposition de valeur", description: "Explication concise du public visé, du problème traité et du résultat distinctif que l’offre cherche à apporter."),
  (key: "alternative", short: "alternative", long: "solution de remplacement", description: "Produit, service, contenu ou méthode que le client peut utiliser pour répondre au même besoin."),
  (key: "mvp", short: "MVP", long: "produit minimum viable", description: "Version limitée conçue pour apprendre auprès d’utilisateurs réels avec le minimum de travail nécessaire; ce n’est pas une version bâclée ni une garantie de succès."),
  (key: "preuve", short: "preuve", long: "signal observable", description: "Observation vérifiable liée à une hypothèse; sa portée dépend de la méthode, du contexte et des biais de collecte.")
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
  title: "Trouver et analyser une opportunité",
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
  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[Trouver et analyser une opportunité]
  #v(0.35cm)
  #text(size: 14pt, fill: report-accent)[Évaluer une idée avant d’investir lourdement]
  #v(0.7cm)
  #line(length: 100%, stroke: 1.2pt + report-accent)
  #v(0.8cm)
  #text(size: 10.5pt, fill: luma(70))[POUR QUI : Entrepreneurs et créateurs qui hésitent entre plusieurs idées ou veulent vérifier une offre avant de la développer.]
  #v(0.65cm)
  #panel("Objectif de ce guide", [Vous repartirez avec une fiche d’opportunité fondée sur un public précis, des preuves vérifiables, des limites et une expérience suivante.])
  #v(0.55cm)
  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]
  #v(0.2cm)
- Décrire un problème réel et un segment accessible.
- Comparer une proposition de valeur aux options actuelles.
- Tester une hypothèse prioritaire avec une expérience limitée.
  #v(0.7cm)
  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 4 novembre 2026]
  ]
  #page(header: none)[
  #outline(title: [Sommaire], depth: 2, indent: 1.1em)
  ]
  #heading(numbering: none, outlined: false)[Avant de commencer]
  Une opportunité n’est pas seulement une idée intéressante : elle associe un problème important, un public accessible, une solution différenciée et une manière réaliste de la produire et de la vendre. Les étapes qui suivent servent à réduire l’incertitude sans prétendre prédire le succès.
  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])
  #heading(numbering: none, outlined: false)[Repères pratiques]
  #text(weight: "bold", fill: report-accent)[Pour qui ?]
  Entrepreneurs et créateurs qui hésitent entre plusieurs idées ou veulent vérifier une offre avant de la développer.
  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]
  Vous repartirez avec une fiche d’opportunité fondée sur un public précis, des preuves vérifiables, des limites et une expérience suivante.
  = Définir le public et la difficulté à résoudre
  Une idée devient plus facile à évaluer lorsqu’on sait précisément qui rencontre le problème, quand il survient et ce que la personne fait déjà. Un public trop vaste rend les besoins et les décisions d’achat impossibles à comparer.
  == Points à retenir
  - Rédigez une fiche segment : contexte, rôle ou situation, zone utile, niveau d’expérience, contrainte et moyen de joindre ces personnes.
- Décrivez la difficulté sans nommer votre solution. Demandez-vous quelle tâche échoue, combien de fois et avec quelle conséquence.
- Distinguez besoin exprimé, besoin observé et préférence déclarée. Les gens peuvent aimer l’idée sans être prêts à changer de méthode ni à payer.
  #panel("À mettre en pratique", [Complétez la phrase : « Pour [public] confronté à [situation], [problème] entraîne [conséquence]. » Ajoutez une question de recherche qui pourrait démontrer que votre hypothèse est fausse.])
  #panel("Exemple de travail", [Exemple fictif : « Pour une petite boutique en ligne qui traite manuellement les demandes de retour, les retards de réponse augmentent les messages de suivi. » Il faut encore mesurer la fréquence, les outils utilisés et le coût du retard.])
  = Estimer le marché utile et comparer les alternatives
  La taille totale d’un secteur n’est pas le nombre de clients que vous pourrez réellement atteindre. Évaluez d’abord le segment accessible, les solutions concurrentes et les conditions qui influencent sa décision.
  == Points à retenir
  - Examinez demande, taille, localisation, saturation, prix et accès au marché. Utilisez la SBA comme grille de questions, pas comme substitut à des données locales.
- Incluez les alternatives indirectes : méthode manuelle, aide d’un proche, service professionnel, contenu gratuit ou décision de ne rien faire.
- Comparez des observations vérifiables — tarifs affichés, fonctionnalités documentées, conditions et messages — sans inventer chiffre d’affaires ou parts de marché des concurrents.
  #panel("À mettre en pratique", [Faites un tableau de cinq alternatives avec segment, problème servi, prix observé, avantages, limites, URL/date et incertitude. Marquez explicitement toute interprétation.])
  #panel("Exemple de travail", [Une formation payante, une vidéo gratuite et une consultation individuelle peuvent répondre au même besoin à des niveaux de profondeur et de coût différents.])
  = Écrire une proposition de valeur différenciante
  La proposition de valeur relie un public, un problème et un résultat crédible. Elle doit rester compréhensible sans explication orale et ne pas promettre un effet que vous ne contrôlez pas.
  == Points à retenir
  - Écrivez une phrase simple : pour qui, quel problème, quel résultat et par quel mécanisme ou format.
- Vérifiez que la différence compte pour le segment : meilleure adéquation au contexte, accompagnement, clarté, accessibilité ou réduction d’une friction précise.
- Associez chaque promesse à une preuve disponible ou à une hypothèse encore à tester. Supprimez les superlatifs et les résultats garantis non démontrés.
  #panel("À mettre en pratique", [Rédigez trois versions de votre promesse et faites-les lire séparément à des personnes du segment. Demandez ce qu’elles comprennent, pour qui l’offre semble utile et ce qui leur manque pour décider.])
  #panel("Exemple de travail", [Une promesse du type « automatiser tous vos revenus » est invérifiable et excessive; « préparer un premier tableau de suivi en 30 minutes à partir de vos ventes » décrit plutôt un livrable contrôlable.])
  = Vérifier la faisabilité et les risques
  Une idée peut résoudre un vrai problème mais être trop coûteuse, réglementée ou difficile à livrer. Identifiez les dépendances et les contraintes avant de transformer une maquette en produit complet.
  == Points à retenir
  - Estimez le temps, les compétences, les outils, les fournisseurs, la livraison, le support et les coûts récurrents nécessaires.
- Repérez les obligations locales, la sécurité, l’accès aux données, la propriété intellectuelle et la capacité à fournir la promesse à chaque client.
- Une recherche de marque ou un examen documentaire signale des risques possibles, mais ne garantit pas la disponibilité du nom et ne remplace pas un avis juridique.
  #panel("À mettre en pratique", [Créez une liste « bloquant / à vérifier / acceptable pour un test » avec responsable, source et prochaine date d’examen. N’investissez pas dans une hypothèse juridique ou technique non vérifiée.])
  #panel("Exemple de travail", [Pour un outil traitant des données clients, le test doit prévoir données fictives ou minimisées et un examen de la confidentialité avant toute mise en production.])
  = Concevoir un test proportionné et décider
  Le test dépend de l’incertitude. Un entretien peut explorer les pratiques, un prototype peut observer l’usage et une offre pilote peut évaluer une décision plus engageante. Le bon test est celui qui réduit un risque précis sans engager des dépenses disproportionnées.
  == Points à retenir
  - Écrivez avant l’essai l’hypothèse, le public, la méthode, la durée, le signal utile et la décision associée.
- Distinguez exposition, clic, inscription, demande qualifiée, acompte et achat réel. Chaque niveau renseigne une chose différente.
- Documentez les biais : recrutement, saison, canal, formulation, taille de l’échantillon et différences entre l’essai et l’offre finale.
  #panel("À mettre en pratique", [Choisissez une seule hypothèse prioritaire et un test réversible. Après l’essai, séparez observations brutes et interprétations, puis décidez : poursuivre, modifier, tester autrement ou arrêter.])
  #panel("Exemple de travail", [Un prototype apprécié peut révéler que l’usage est compréhensible; seul un comportement d’achat dans des conditions réelles renseigne davantage sur la volonté de payer, sans garantir la rentabilité à grande échelle.])
  = Atelier guidé
  Exercice guidé (45–60 min) : évaluez une idée que vous pourriez réellement mettre à l’épreuve.
  + Définissez un public précis et un problème vécu récemment; listez la solution utilisée aujourd’hui.
+ Écrivez votre proposition de valeur en une phrase et identifiez trois hypothèses risquées.
+ Analysez des alternatives directes et indirectes, avec prix affichés, sources et dates; ne déduisez pas leurs ventes.
+ Pour chaque hypothèse, choisissez une observation qui pourrait la confirmer ou la contredire.
+ Concevez un test limité, indiquez le signal de décision, les risques, la durée et les données collectées.
+ Après le test, classez faits, interprétations, limites et prochaine action.
  #panel("Livrable", [Livrable : une fiche d’opportunité d’une page. Aucun seuil universel ne s’applique; le critère doit correspondre au coût, au risque et au contexte de l’offre.])
  = Liste de contrôle avant d’avancer
  - Le public et le problème sont assez précis pour guider une enquête.
- Les alternatives incluent les solutions informelles et gratuites.
- La promesse est compréhensible et reliée à des preuves ou hypothèses.
- Les contraintes de coût, de livraison, de données et de droits sont répertoriées.
- Le test cherche à répondre à une question définie, pas à confirmer l’idée.
- La décision suivante est écrite avant de connaître le résultat.
  = Limites et précautions
  - Les sources secondaires peuvent ne pas représenter le segment ciblé; les entretiens peuvent aussi être biaisés.
- Google Trends fournit un indice relatif, pas un volume absolu ni une preuve d’achat.
- Un clic, une déclaration positive ou une maquette appréciée ne démontre pas la rentabilité.
- La recherche WIPO est un repérage préliminaire, pas une garantie de disponibilité ni un avis juridique.
- Respectez le consentement, la vie privée et les règles applicables pendant les tests.
  = Glossaire essentiel
  #print-glossary(glossary, show-all: true)
  = Sources et vérification
  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://legacy.sba.gov/business-guide/plan-your-business/market-research-competitive-analysis")[U.S. Small Business Administration — Market research and competitive analysis]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Demande, taille, localisation, saturation, prix, recherche directe et facteurs d’analyse concurrentielle.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://support.google.com/trends/answer/4365533?hl=fr")[Google Trends Help — FAQ about Google Trends data]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Échantillonnage et normalisation relative, limites des termes à faible volume et avertissement que Trends n’est pas un sondage scientifique.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.wipo.int/en/web/madrid-system/check-availability")[WIPO — Check Availability (Madrid System)]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Recherche préliminaire de marques à examiner dans les marchés visés; une recherche n’établit pas à elle seule la disponibilité juridique.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://transparency.meta.com/policies/ad-standards/")[Meta Transparency Center — Introduction to the Advertising Standards]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Règles Meta applicables aux publicités payantes et recommandation de vérifier les politiques en vigueur si l’opportunité est promue sur Meta.]
  ]
  #v(0.35cm)
  #text(size: 9pt, fill: luma(80))[Sources consultées le 4 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]
