// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.
#import "../report-theme.typ": report-accent, report-theme
#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary
#let glossary = (
  (key: "besoin", short: "besoin client", long: "besoin du client", description: "Situation ou résultat important pour une personne, que les solutions actuelles ne satisfont pas complètement."),
  (key: "segment", short: "segment", long: "segment de clientèle", description: "Groupe défini de personnes partageant un contexte ou des caractéristiques utiles pour analyser leur besoin et leur décision d’achat."),
  (key: "donnee_secondaire", short: "donnée secondaire", long: "donnée secondaire", description: "Information déjà publiée ou recueillie auparavant, à examiner pour sa date, sa méthode, son périmètre et sa pertinence pour le marché visé."),
  (key: "donnee_primaire", short: "donnée primaire", long: "donnée primaire", description: "Information recueillie directement pour répondre à une question de recherche précise, par exemple lors d’un entretien ou d’un test."),
  (key: "marche_accessible", short: "marché accessible", long: "marché accessible", description: "Part du marché théorique qu’une entreprise peut réellement servir compte tenu de son offre, de ses moyens, de sa zone et de ses canaux.")
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
  title: "Comprendre le marché des produits digitaux",
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
  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[Comprendre le marché des produits digitaux]
  #v(0.35cm)
  #text(size: 14pt, fill: report-accent)[Passer d’une intuition à une demande vérifiable]
  #v(0.7cm)
  #line(length: 100%, stroke: 1.2pt + report-accent)
  #v(0.8cm)
  #text(size: 10.5pt, fill: luma(70))[POUR QUI : Créateurs, indépendants et petites équipes qui envisagent de lancer un produit numérique.]
  #v(0.65cm)
  #panel("Objectif de ce guide", [À la fin, vous saurez décrire un besoin, examiner les solutions existantes et préparer un test proportionné — sans confondre intérêt déclaré et preuve d’achat.])
  #v(0.55cm)
  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]
  #v(0.2cm)
- Formuler le problème et le segment visé en termes observables.
- Comparer des sources secondaires, des entretiens et des signaux de recherche.
- Construire un tableau concurrentiel et décider quoi tester ensuite.
  #v(0.7cm)
  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 4 novembre 2026]
  ]
  #page(header: none)[
  #outline(title: [Sommaire], depth: 2, indent: 1.1em)
  ]
  #heading(numbering: none, outlined: false)[Avant de commencer]
  Une idée peut sembler évidente à son auteur tout en restant floue pour ses futurs clients. Une étude de marché légère mais structurée aide à réduire cette incertitude avant d’investir trop de temps ou d’argent. Ce guide propose une méthode de travail, pas une prévision de ventes : les résultats doivent être adaptés au pays, au secteur et au public réellement visés.
  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])
  #heading(numbering: none, outlined: false)[Repères pratiques]
  #text(weight: "bold", fill: report-accent)[Pour qui ?]
  Créateurs, indépendants et petites équipes qui envisagent de lancer un produit numérique.
  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]
  À la fin, vous saurez décrire un besoin, examiner les solutions existantes et préparer un test proportionné — sans confondre intérêt déclaré et preuve d’achat.
  = Commencer par le problème, pas par le format
  Un ebook, un cours ou un outil n’est qu’une forme de solution. Commencez par la situation qui motive l’achat : qui rencontre une difficulté, dans quel contexte, à quelle fréquence et avec quelle conséquence ? Une formulation précise rend les hypothèses discutables et testables.
  == Points à retenir
  - Séparez le résultat souhaité de la solution que vous imaginez. « Gagner du temps sur les devis » décrit un résultat; « acheter une application » est déjà une réponse possible.
- Décrivez les comportements observables : comment la personne fait-elle aujourd’hui, que lui coûte cette méthode et quand cherche-t-elle une alternative ?
- Notez ce que vous savez, ce que vous supposez et ce qui reste inconnu. Ne transformez pas une anecdote en constat général.
  #panel("À mettre en pratique", [Rédigez une phrase de travail : « [profil] cherche à [résultat] lorsqu’il/elle [contexte], mais [obstacle] ». Écrivez ensuite trois suppositions à vérifier et une question ouverte pour chacune.])
  #panel("Exemple de travail", [Exemple fictif : « Un artisan qui prépare seul ses devis veut répondre plus vite aux demandes, mais perd du temps à retrouver les mêmes informations. » Il reste à vérifier la fréquence du problème, les outils déjà utilisés et l’importance réelle du délai.])
  = Délimiter le public et le marché atteignable
  Un public utile à étudier est défini par des critères qui changent le besoin ou la décision d’achat, et pas seulement par une catégorie très large. L’étude doit aussi distinguer le marché total imaginé du public que vous pouvez effectivement joindre et servir.
  == Points à retenir
  - Précisez la situation professionnelle ou personnelle, le niveau d’expérience, la zone concernée, les contraintes et le canal par lequel le segment peut être joint.
- Estimez la demande avec plusieurs indices : fréquence du problème, solutions déjà payées ou bricolées, budgets observables, questions reçues et sources sectorielles datées.
- La SBA recommande d’examiner demande, taille, localisation, saturation et prix. Son cadre est méthodologique : ses données américaines ne décrivent pas automatiquement un marché francophone ou un autre pays.
  #panel("À mettre en pratique", [Construisez un tableau avec les colonnes : segment, besoin, solution actuelle, coût ou prix observé, canal d’accès, source/date, incertitude. Marquez chaque estimation comme mesure publiée, observation ou hypothèse.])
  #panel("Exemple de travail", [Si votre audience se trouve au Sénégal, en France ou ailleurs, cherchez des données locales ou précisez que la source ne couvre pas ce territoire. Ne convertissez pas une donnée américaine en estimation locale sans méthode défendable.])
  = Croiser les données documentaires et les échanges directs
  Les données déjà publiées orientent l’enquête; elles répondent rarement à elles seules à une question très précise sur votre offre. Les échanges avec des personnes du segment peuvent compléter le contexte à condition de poser des questions neutres et de noter les limites de l’échantillon.
  == Points à retenir
  - Commencez par des sources adaptées à la question : statistiques publiques, rapports sectoriels, tarifs affichés, avis publics, documentation de plateformes et données de tendances.
- En entretien, demandez une expérience récente : « Racontez la dernière fois où… ». Évitez « Vous achèteriez mon idée ? », qui invite à approuver une proposition hypothétique.
- Google Trends exprime un intérêt de recherche relatif, normalisé de 0 à 100 par zone et période. Une valeur faible, un pic ou une hausse n’est ni un volume absolu ni une preuve d’intention d’achat.
  #panel("À mettre en pratique", [Préparez cinq questions neutres, recrutez quelques personnes correspondant au segment et consignez les réponses sans les présenter comme un échantillon représentatif. Notez aussi qui n’a pas été entendu.])
  #panel("Exemple de travail", [Comparez deux ou trois formulations du problème dans Google Trends en gardant la même région et la même période, puis confrontez ces signaux à des conversations et à des solutions réellement utilisées.])
  = Cartographier les concurrents et les solutions de remplacement
  La concurrence comprend toute option qui aide déjà le public à atteindre le même résultat : produit payant, service, contenu gratuit, communauté, tableur ou méthode manuelle. L’objectif est de comprendre les compromis, pas de recopier les offres ni de déduire leurs ventes à partir d’une page web.
  == Points à retenir
  - Pour chaque alternative, notez le segment, la promesse, le format, le prix affiché, les conditions d’accès et les preuves publiques consultées.
- Comparez les forces et limites visibles : simplicité, accompagnement, spécialisation, délai, compatibilité et confiance. Distinguez les faits vérifiés de votre interprétation.
- Une différence n’a de valeur que si elle compte pour le public et peut être livrée de façon viable. L’absence d’un concurrent visible ne prouve pas une opportunité.
  #panel("À mettre en pratique", [Relevez cinq alternatives directes ou indirectes. Pour chacune, ajoutez URL et date de consultation, puis écrivez une phrase sur le besoin possiblement mal servi et une phrase sur ce que vous ignorez.])
  #panel("Exemple de travail", [Un atelier vendant un modèle de devis en ligne peut concurrencer un logiciel complet pour certains indépendants, même si les produits n’ont ni la même taille ni le même prix.])
  = Transformer les constats en décision de test
  Une étude utile se termine par une décision provisoire. Vous n’avez pas besoin de prouver tout le marché avant un premier essai; vous devez choisir la prochaine incertitude importante et le moyen le moins coûteux de l’éclairer.
  == Points à retenir
  - Classez les hypothèses par impact si elles sont fausses et par facilité de vérification. Commencez par celles qui pourraient invalider l’offre.
- Un entretien teste la compréhension et les pratiques déclarées; une maquette teste l’usage; une page d’intérêt teste la clarté et l’engagement initial. Aucun de ces signaux ne vaut une vente confirmée.
- Définissez à l’avance l’observation recherchée, la limite de l’essai et la décision qui suivra : poursuivre, reformuler ou explorer un autre segment.
  #panel("À mettre en pratique", [Écrivez une fiche de test : hypothèse, public, méthode, durée, signal attendu, limite, résultat observé et prochaine décision. Recueillez seulement les données nécessaires et expliquez leur usage.])
  #panel("Exemple de travail", [Une page de préinscription peut révéler si la promesse est comprise et attire des inscriptions; elle ne démontre pas que les inscrits paieront, ni que le coût d’acquisition sera viable.])
  = Atelier guidé
  Exercice guidé (45–60 min) : choisissez un problème concret auquel un produit numérique pourrait répondre.
  + Décrivez le profil et le problème en une phrase, puis listez trois suppositions.
+ Repérez cinq alternatives directes ou indirectes; relevez public, promesse, format, prix affiché et URL/date.
+ Comparez deux ou trois formulations dans Google Trends avec une zone et une période constantes. Inscrivez que l’indice est relatif, pas un volume absolu.
+ Préparez cinq questions sur des expériences récentes et échangez avec quelques personnes du segment. Demandez ce qu’elles ont fait, pas seulement si l’idée leur plaît.
+ Présentez une proposition ou un aperçu simple; notez les incompréhensions et objections.
+ Décidez provisoirement : poursuivre, reformuler ou tester autrement. Listez les preuves manquantes.
  #panel("Livrable", [Livrable : une page de synthèse séparant faits, interprétations, hypothèses et prochaine expérience. L’exercice est exploratoire et ne constitue pas un échantillon représentatif.])
  = Liste de contrôle avant d’avancer
  - Le problème est décrit indépendamment de la solution imaginée.
- Le segment inclut des critères utiles à son besoin et à l’accès.
- Les sources ont une URL, une date et une limite notée.
- Les alternatives incluent des solutions gratuites ou informelles.
- Les questions d’entretien portent sur des comportements passés.
- La prochaine expérience a un signal et une limite définis.
  = Limites et précautions
  - Les données américaines de la SBA ne décrivent pas automatiquement un marché francophone ou un pays particulier.
- Google Trends est relatif, échantillonné et sensible aux faibles volumes; il ne prouve ni ventes ni intention d’achat.
- Entretiens, clics et inscriptions exploratoires ne constituent pas une preuve de rentabilité future.
- Respectez le consentement et les règles de protection des données applicables; collectez uniquement ce qui est nécessaire.
- Vérifiez les droits sur les textes, images, marques, polices et éléments intégrés au produit numérique.
  = Glossaire essentiel
  #print-glossary(glossary, show-all: true)
  = Sources et vérification
  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://legacy.sba.gov/business-guide/plan-your-business/market-research-competitive-analysis")[U.S. Small Business Administration — Market research and competitive analysis]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Questions de recherche sur demande, taille, localisation, saturation et prix; distinction entre données existantes et recherche directe; méthodes d’enquête et analyse concurrentielle.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://support.google.com/trends/answer/4365533?hl=fr")[Google Trends Help — FAQ about Google Trends data (français)]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Échantillonnage, agrégation, normalisation 0–100, limites des termes peu recherchés, bruit statistique et avertissement que Trends n’est pas un sondage scientifique.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.wipo.int/en/web/about-ip")[Organisation Mondiale de la Propriété Intellectuelle — What is Intellectual Property?]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Aperçu des catégories de propriété intellectuelle et rappel de vérifier les droits relatifs aux composants d’un produit numérique.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.sba.gov/counseling/plan-your-business/")[U.S. Small Business Administration — Plan your business]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Cadre général d’étude de la clientèle, des tendances, des alternatives et de la concurrence; à adapter au pays visé.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help")[Meta Business Help Center]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Centre officiel à consulter pour vérifier les règles de plateforme en vigueur si l’étude débouche sur une campagne Meta.]
  ]
  #v(0.35cm)
  #text(size: 9pt, fill: luma(80))[Sources consultées le 4 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]
