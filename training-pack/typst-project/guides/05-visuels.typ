// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.
#import "../report-theme.typ": report-accent, report-theme
#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary
#let glossary = (
  (key: "hierarchie_visuelle", short: "hiérarchie visuelle", long: "hiérarchie visuelle", description: "Organisation des éléments qui guide le regard vers l’information la plus importante avant les détails secondaires."),
  (key: "appel_action", short: "appel à l’action", long: "appel à l’action", description: "Instruction claire qui indique la prochaine étape attendue, par exemple découvrir une offre ou demander des informations."),
  (key: "placement", short: "placement", long: "emplacement publicitaire", description: "Espace de diffusion dans une application ou un service, avec son propre format et ses contraintes de rendu."),
  (key: "contraste", short: "contraste", long: "contraste visuel", description: "Différence perceptible entre des éléments voisins, utile notamment pour distinguer texte, fond et sujets."),
  (key: "test_creatif", short: "test créatif", long: "test créatif", description: "Comparaison organisée de variantes pour apprendre l’effet d’un choix visuel ou rédactionnel dans des conditions définies.")
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
  title: "Créer des visuels publicitaires efficaces",
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
  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[Créer des visuels publicitaires efficaces]
  #v(0.35cm)
  #text(size: 14pt, fill: report-accent)[Construire un message clair, lisible et vérifiable]
  #v(0.7cm)
  #line(length: 100%, stroke: 1.2pt + report-accent)
  #v(0.8cm)
  #text(size: 10.5pt, fill: luma(70))[POUR QUI : Entrepreneurs, créateurs et petites équipes qui produisent ou commandent des visuels pour des campagnes numériques.]
  #v(0.65cm)
  #panel("Objectif de ce guide", [Vous saurez relier un visuel à un objectif, construire une hiérarchie simple, contrôler les rendus par placement et vérifier les droits avant diffusion.])
  #v(0.55cm)
  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]
  #v(0.2cm)
- Définir le public, le bénéfice et l’action avant la mise en page.
- Contrôler lisibilité, recadrage et cohérence de l’offre sur mobile.
- Créer des variantes interprétables et documenter droits et conformité.
  #v(0.7cm)
  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 5 novembre 2026]
  ]
  #page(header: none)[
  #outline(title: [Sommaire], depth: 2, indent: 1.1em)
  ]
  #heading(numbering: none, outlined: false)[Avant de commencer]
  Un visuel publicitaire sert d’abord à faire comprendre une offre et une action. Il ne garantit ni clic, ni vente, ni performance. Le guide présente des principes de conception et de contrôle; les formats et règles de chaque plateforme doivent être vérifiés au moment de la diffusion.
  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])
  #heading(numbering: none, outlined: false)[Repères pratiques]
  #text(weight: "bold", fill: report-accent)[Pour qui ?]
  Entrepreneurs, créateurs et petites équipes qui produisent ou commandent des visuels pour des campagnes numériques.
  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]
  Vous saurez relier un visuel à un objectif, construire une hiérarchie simple, contrôler les rendus par placement et vérifier les droits avant diffusion.
  = Partir de l’objectif et du public
  Commencez par la tâche du visuel : faire connaître, expliquer, susciter une visite ou inviter à une conversation. Sans objectif, la mise en page risque d’accumuler des éléments décoratifs qui ne facilitent pas la décision.
  == Points à retenir
  - Décrivez en une phrase le public, l’action attendue et le bénéfice vérifiable de l’offre.
- Choisissez un seul message central et une prochaine étape visible. Le texte, l’image et la destination doivent raconter la même chose.
- Adaptez le message au contexte du canal et au stade de décision; une annonce de découverte n’a pas la même fonction qu’une annonce pour une offre déjà comprise.
  #panel("À mettre en pratique", [Écrivez : « Nous voulons que [public] fasse [action] afin de [résultat]. » Listez l’élément visuel principal et la preuve qui rend la promesse crédible.])
  #panel("Exemple de travail", [Pour un atelier de réparation, une image montrant le service en action peut clarifier l’offre; elle ne doit pas laisser entendre un résultat garanti si celui-ci dépend du modèle ou du diagnostic.])
  = Construire une hiérarchie simple
  Le regard doit comprendre rapidement le sujet, le bénéfice et l’étape suivante. Les détails peuvent être utiles, mais une accumulation de titres, badges, chiffres et logos affaiblit le message.
  == Points à retenir
  - Organisez le visuel en trois niveaux : sujet ou produit, bénéfice principal, détail ou appel à l’action.
- Employez une police lisible à petite taille et un contraste suffisant; vérifiez la lecture sans zoom et sur un écran de téléphone.
- Gardez l’identité de marque reconnaissable sans laisser le logo ou les ornements dominer l’information.
  #panel("À mettre en pratique", [Masquez le texte secondaire et demandez à une personne qui ne connaît pas l’offre ce qu’elle comprend. Si le message change selon l’explication orale, simplifiez le visuel.])
  #panel("Exemple de travail", [Un visuel avec un titre principal, une image cohérente, une mention de condition importante et un seul appel à l’action se comprend généralement mieux qu’une composition avec plusieurs promesses concurrentes.])
  = Adapter le format au placement
  Les emplacements ne partagent pas toujours les mêmes proportions ni les mêmes zones visibles. Un fichier acceptable dans un fil peut être recadré, couvert par l’interface ou illisible dans une story.
  == Points à retenir
  - Vérifiez les spécifications actuelles de chaque placement visé dans le gestionnaire de publicités ou la documentation officielle; elles peuvent évoluer.
- Préparez un rendu par format nécessaire et gardez le sujet, le texte essentiel et le logo loin des bords susceptibles d’être coupés.
- Prévisualisez la création sur mobile et ordinateur dans les environnements prévus; contrôlez aussi le chargement, la qualité d’image et la destination.
  #panel("À mettre en pratique", [Créez une fiche par placement : dimensions exigées, aperçu, texte visible, recadrage, éléments masqués et URL de destination. Faites vérifier chaque rendu exporté.])
  #panel("Exemple de travail", [Meta recommande de prévisualiser les annonces sur téléphone et ordinateur et indique que le ratio dépend du placement. Utilisez les recommandations en vigueur plutôt qu’une taille universelle figée.])
  = Créer des variantes qui enseignent quelque chose
  Deux variantes très différentes à la fois ne permettent pas de savoir ce qui a influencé le résultat. Un test créatif utile part d’une hypothèse, garde les paramètres pertinents comparables et observe une métrique définie à l’avance.
  == Points à retenir
  - Faites varier une dimension principale : accroche, image, bénéfice mis en avant ou ordre des éléments.
- Conservez, autant que possible, la même offre, destination et action pour interpréter la différence.
- Notez public, placement, période, dépenses et indicateurs. Une variante meilleure dans un contexte ne garantit pas les résultats dans un autre.
  #panel("À mettre en pratique", [Préparez deux versions et écrivez avant diffusion quelle différence vous testez, quel indicateur principal sera lu et quelle conclusion serait trop forte.])
  #panel("Exemple de travail", [Une variante avec bénéfice en premier et une variante avec usage en premier peuvent tester la compréhension; gardez prix, public et page d’arrivée identiques.])
  = Vérifier exactitude, droits et accessibilité
  Une publicité peut être claire tout en restant trompeuse si l’image suggère un résultat irréaliste, si les conditions sont cachées ou si les éléments visuels n’ont pas de licence. La revue doit couvrir le visuel, le texte et la page de destination.
  == Points à retenir
  - Vérifiez les allégations, prix, disponibilité, périodes, conditions et cohérence entre annonce et destination.
- Contrôlez la propriété ou la licence des photos, polices, logos, musiques, témoignages et images de personnes.
- Les règles Meta s’appliquent aux publicités payantes et peuvent varier selon le pays, le produit ou le secteur; une revue ne garantit pas l’approbation.
  #panel("À mettre en pratique", [Faites une passe conformité séparée : affirmation, preuve, condition, droits, contraste et destination. En cas de doute sur un sujet réglementé, demandez un avis compétent avant la diffusion.])
  #panel("Exemple de travail", [Si une remise est annoncée, affichez clairement sa durée, ses conditions et les exclusions pertinentes dans le visuel ou la destination.])
  = Atelier guidé
  Exercice guidé : préparez deux concepts de création pour une offre réelle, sans les publier.
  + Définissez l’objectif, le public, un bénéfice vérifiable et l’action attendue.
+ Rédigez une version centrée sur le bénéfice et une version centrée sur un usage concret.
+ Choisissez les placements réellement visés et vérifiez les spécifications officielles actuelles.
+ Prévisualisez les rendus à taille mobile; inspectez contraste, texte, recadrage, logo et interface qui pourrait masquer un élément.
+ Vérifiez l’exactitude des promesses, les conditions de l’offre, les autorisations et les licences.
+ Écrivez l’hypothèse que chaque variante teste et l’indicateur qui aiderait à l’évaluer.
  #panel("Livrable", [Livrable : deux maquettes accompagnées d’une fiche de placement, d’une liste de droits et d’une hypothèse de test. Aucune performance n’est garantie.])
  = Liste de contrôle avant d’avancer
  - Un objectif et une action sont définis avant la conception.
- Le message central reste compréhensible sans texte secondaire.
- Le texte et le logo restent visibles après recadrage.
- Le visuel est contrôlé à taille mobile dans chaque placement visé.
- Prix, conditions et destination concordent.
- Les images, polices, marques et témoignages disposent des droits nécessaires.
- La variante change une dimension principale à la fois.
  = Limites et précautions
  - Les formats et politiques Meta changent; vérifiez les recommandations officielles au moment de la diffusion.
- La conformité ne garantit ni l’approbation d’une annonce ni son efficacité.
- Google Trends donne un indice relatif et ne prouve pas la demande ou l’intention d’achat.
- Ne présumez pas qu’une image trouvée en ligne peut être utilisée commercialement.
- N’utilisez pas de seuil de contraste ou de performance comme garantie si celui-ci n’a pas été mesuré.
  = Glossaire essentiel
  #print-glossary(glossary, show-all: true)
  = Sources et vérification
  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.sba.gov/business-guide/manage-your-business/marketing-sales")[U.S. Small Business Administration — Marketing and sales]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Objectifs, public cible, proposition de valeur, canaux marketing et mesure; cadre méthodologique à adapter.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://support.google.com/trends/answer/4365533?hl=en")[Google Trends Help — FAQ about Google Trends data]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Limites des données de tendance et de la normalisation; Trends ne mesure pas directement l’intention d’achat.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/388369961318508")[Meta Business Help Center — Best practices for image ads]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Ratios variables selon les placements, qualité visuelle et prévisualisation mobile/ordinateur; vérifiez la version actuelle.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/488043719226449")[Meta Business Help Center — About Meta Advertising Standards]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Application des standards aux publicités payantes et politiques supplémentaires possibles selon les sujets.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.wipo.int/copyright/en/")[WIPO — Copyright]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Droits applicables aux œuvres visuelles et autorisation d’utiliser des éléments protégés.]
  ]
  #v(0.35cm)
  #text(size: 9pt, fill: luma(80))[Sources consultées jusqu’au 5 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]
