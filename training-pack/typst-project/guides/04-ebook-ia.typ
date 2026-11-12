// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.
#import "../report-theme.typ": report-accent, report-theme
#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary
#let glossary = (
  (key: "lecteur_cible", short: "lecteur cible", long: "lecteur cible", description: "Personne ou groupe précisément décrit dont les connaissances, le contexte et les besoins guident le contenu."),
  (key: "source_primaire", short: "source primaire", long: "source primaire", description: "Document ou donnée produit par l’organisme ou l’acteur directement concerné, utile pour vérifier une règle ou un fait d’origine."),
  (key: "citation", short: "citation", long: "citation directe", description: "Reproduction fidèle et délimitée des mots d’une source, attribuée et référencée selon les droits et règles applicables."),
  (key: "hallucination", short: "hallucination", long: "erreur générée", description: "Information inventée ou incorrecte présentée avec assurance par un système génératif; toute référence proposée doit être vérifiée à sa source."),
  (key: "contribution_humaine", short: "contribution humaine", long: "contribution créative humaine", description: "Recherche, sélection, organisation, jugement, rédaction ou révision apportée par une personne; sa qualification juridique dépend du pays et du contexte.")
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
  title: "Créer un ebook utile avec l’IA",
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
  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[Créer un ebook utile avec l’IA]
  #v(0.35cm)
  #text(size: 14pt, fill: report-accent)[Une méthode fiable, de la recherche à l’export]
  #v(0.7cm)
  #line(length: 100%, stroke: 1.2pt + report-accent)
  #v(0.8cm)
  #text(size: 10.5pt, fill: luma(70))[POUR QUI : Auteurs, formateurs et créateurs qui veulent produire un guide pédagogique avec l’aide d’outils d’intelligence artificielle.]
  #v(0.65cm)
  #panel("Objectif de ce guide", [Vous apprendrez à cadrer un lecteur, documenter chaque affirmation importante, utiliser l’IA comme aide à la rédaction et contrôler le fichier final.])
  #v(0.55cm)
  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]
  #v(0.2cm)
- Écrire une promesse pédagogique et un plan centré sur l’action du lecteur.
- Constituer un registre de sources et vérifier les passages factuels.
- Relire les droits, la confidentialité, la mise en page et l’export.
  #v(0.7cm)
  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 5 novembre 2026]
  ]
  #page(header: none)[
  #outline(title: [Sommaire], depth: 2, indent: 1.1em)
  ]
  #heading(numbering: none, outlined: false)[Avant de commencer]
  Un ebook de qualité ne se résume pas à du texte produit rapidement. Il doit répondre à un besoin, guider le lecteur dans un ordre logique, s’appuyer sur des sources consultables et être relu après export. Un assistant IA peut aider à structurer ou reformuler, mais il ne remplace ni la recherche ni la responsabilité éditoriale.
  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])
  #heading(numbering: none, outlined: false)[Repères pratiques]
  #text(weight: "bold", fill: report-accent)[Pour qui ?]
  Auteurs, formateurs et créateurs qui veulent produire un guide pédagogique avec l’aide d’outils d’intelligence artificielle.
  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]
  Vous apprendrez à cadrer un lecteur, documenter chaque affirmation importante, utiliser l’IA comme aide à la rédaction et contrôler le fichier final.
  = Définir le lecteur et le résultat concret
  Un ebook utile aide une personne à accomplir une tâche ou à prendre une décision. Un lecteur clairement décrit permet de choisir le vocabulaire, les exemples, le niveau d’explication et ce qu’il faut laisser hors du guide.
  == Points à retenir
  - Décrivez le contexte, les connaissances de départ, le problème concret, les contraintes et la décision ou action à réaliser.
- Formulez l’objectif en termes observables : à la fin, le lecteur pourra comparer des options, remplir une fiche ou exécuter une procédure définie.
- Validez le besoin avec des sources de marché et des échanges directs. L’intérêt exprimé pour un thème ne démontre pas une volonté d’achat.
  #panel("À mettre en pratique", [Écrivez : « Cet ebook aide [lecteur] à [résultat] malgré [obstacle], au moyen de [approche]. » Listez trois questions de besoin à vérifier avant la rédaction.])
  #panel("Exemple de travail", [Une promesse comme « apprendre le marketing » est trop large; « préparer une fiche de campagne avec objectif, audience, budget et contrôle avant lancement » annonce un résultat plus précis.])
  = Chercher et consigner les sources
  Les sources soutiennent des affirmations précises, pas une impression générale de crédibilité. La qualité d’une référence dépend de l’auteur, de la date, de la méthode, du périmètre et du fait qu’elle soutienne réellement la phrase utilisée.
  == Points à retenir
  - Commencez par une question de recherche par chapitre; privilégiez les sources primaires ou institutionnelles adaptées au sujet.
- Tenez un registre : organisme, titre, URL, date de publication ou mise à jour si disponible, date de consultation, affirmation soutenue et section concernée.
- Distinguez citation, paraphrase et synthèse. Une citation mot à mot doit être fidèle, délimitée, attribuée et compatible avec les droits applicables.
  #panel("À mettre en pratique", [Pour chaque affirmation importante, ajoutez provisoirement une note de source. Ouvrez le document original, vérifiez le contexte et classez la phrase : confirmée, à nuancer, à vérifier ou supprimée.])
  #panel("Exemple de travail", [Google Trends peut documenter la nature relative et les limites de ses données; il ne doit pas être cité comme preuve d’une demande solvable ou d’un volume de ventes.])
  = Construire un plan pédagogique
  Un plan doit faire progresser le lecteur du problème vers l’action. Des chapitres cohérents évitent les répétitions et rendent visible ce que chaque partie apporte.
  == Points à retenir
  - Organisez le guide en étapes : cadrage, notions indispensables, procédure, exemple travaillé, erreurs fréquentes, exercice et synthèse.
- Donnez à chaque chapitre une question à laquelle il répond et un livrable ou une décision que le lecteur peut produire.
- Séparez le contenu central des annexes, définitions et références. Les listes doivent expliquer ou faciliter l’action, pas remplacer chaque paragraphe.
  #panel("À mettre en pratique", [Établissez un plan de cinq à sept chapitres. Pour chaque titre, notez : question du lecteur, point de départ, action, exemple et résultat attendu.])
  #panel("Exemple de travail", [Si le guide explique une campagne, présentez l’offre et l’objectif avant le budget, puis l’audience et les créations, ensuite les contrôles, la mesure et l’analyse.])
  = Utiliser l’IA comme assistante, pas comme source
  Un modèle peut proposer des angles, réorganiser un brouillon ou reformuler des notes fournies. Ses réponses peuvent toutefois inventer des références, des chiffres ou des procédures; le texte généré doit rester un matériau à contrôler et à réécrire.
  == Points à retenir
  - Fournissez au modèle la fiche lecteur, le résultat du chapitre, les notes vérifiées, les sources et une consigne explicite de ne pas inventer de faits ou de citations.
- Demandez un brouillon ou un plan avec des marqueurs [À SOURCER] lorsque les informations manquent, plutôt que des références fabriquées.
- Réécrivez dans votre voix, vérifiez chaque affirmation et gardez une trace de la sélection, des corrections et de la contribution humaine.
  #panel("À mettre en pratique", [Testez une seule section : fournissez les sources, demandez un brouillon limité à ces sources, puis annotez chaque phrase factuelle par une référence vérifiée ou supprimez-la.])
  #panel("Exemple de travail", [Si l’assistant nomme une étude sans lien ou dont le titre ne mène pas au document cité, traitez la référence comme non vérifiée; ne la laissez pas dans la version publiée.])
  = Vérifier droits, confidentialité et promesses
  Le contrôle éditorial inclut les textes, images, polices, marques, extraits, données saisies dans un outil IA et promesses de résultats. Les règles de propriété intellectuelle et de contenu généré varient selon les juridictions et les services.
  == Points à retenir
  - N’intégrez que des éléments dont vous détenez les droits ou une licence compatible avec l’usage, la modification et la diffusion prévus; gardez les justificatifs.
- Ne téléversez pas de données confidentielles ou personnelles sans autorisation et examen des conditions; limitez la collecte et protégez les données.
- Ne promettez pas un revenu, une performance ou un effet garanti sans preuves adaptées. Pour un sujet juridique, financier ou de santé, faites valider le contenu par un professionnel compétent.
  #panel("À mettre en pratique", [Faites une liste des ressources incorporées et de leur licence. Relisez aussi les conditions de l’outil IA utilisé, notamment confidentialité, réutilisation, propriété et règles de présentation.])
  #panel("Exemple de travail", [Une image accessible sur Internet n’est pas automatiquement libre pour un ebook commercial. Une sortie d’IA peut nécessiter contrôle humain et examen des conditions du service.])
  = Relire et contrôler l’export final
  La mise en page fait partie de l’expérience de lecture. Des titres hiérarchisés, des paragraphes lisibles, une pagination cohérente, un sommaire utile et des liens fonctionnels facilitent l’usage sur écran et à l’impression.
  == Points à retenir
  - Relisez séparément le fond factuel, la progression pédagogique et la langue; une passe unique repère moins de problèmes.
- Vérifiez le sommaire, les sauts de page, les contrastes, les légendes, les liens, les en-têtes/pieds de page et les pages trop chargées.
- Ouvrez le PDF exporté dans un autre lecteur ou sur un téléphone; le contrôle du fichier source ne remplace pas la relecture du rendu final.
  #panel("À mettre en pratique", [Utilisez une copie exportée et faites une vérification page par page : coupures, texte minuscule, images floues, pagination, liens, crédits, sommaire et pied de page.])
  #panel("Exemple de travail", [Une table des matières peut être correcte dans le manuscrit mais contenir des numéros de page périmés après un changement de longueur; testez chaque entrée dans le PDF final.])
  = Atelier guidé
  Exercice guidé (45–60 min) : préparez une première section d’un ebook avant d’écrire le manuscrit complet.
  + Rédigez une fiche lecteur, le résultat attendu et trois hypothèses de besoin.
+ Trouvez une source officielle ou primaire par question; notez titre, URL, date, passage soutenu et limites.
+ Créez un plan de cinq à sept rubriques, chacune reliée à une action du lecteur.
+ Demandez à un assistant IA un brouillon d’une rubrique à partir de vos notes vérifiées et interdisez les faits/références non présents.
+ Vérifiez toutes les affirmations, réécrivez le texte, ajoutez les références et les limites.
+ Faites une revue des droits, des données sensibles et du rendu après export.
  #panel("Livrable", [Livrable : une page de cadrage éditorial, un registre de sources et une rubrique relue de bout en bout.])
  = Liste de contrôle avant d’avancer
  - Le lecteur et le résultat sont précis et visibles dès la couverture.
- Chaque chapitre apporte une action ou une décision.
- Les références ont été ouvertes et vérifiées à leur source.
- Les réponses générées ne sont pas traitées comme preuve.
- Les droits des images, textes, polices et marques sont contrôlés.
- Les données soumises à l’IA sont autorisées et minimisées.
- Le PDF final, les liens, le sommaire et chaque page ont été relus.
  = Limites et précautions
  - Les modèles génératifs peuvent inventer ou déformer faits et références; l’auteur doit vérifier les sources originales.
- Les droits d’auteur et l’éligibilité de contenus assistés par IA varient selon le pays et le type d’œuvre.
- Ne téléversez pas de données confidentielles ou personnelles sans autorisation et revue des conditions applicables.
- Les conditions du service IA peuvent évoluer; vérifiez confidentialité, réutilisation et règles de présentation.
- Les conseils de ce guide ne remplacent pas un avis juridique local pour des usages commerciaux ou sensibles.
  = Glossaire essentiel
  #print-glossary(glossary, show-all: true)
  = Sources et vérification
  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.sba.gov/counseling/plan-your-business/")[U.S. Small Business Administration — Plan your business]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Recherche de clientèle, taille, concurrents, sources secondaires et recherche directe; la portée géographique américaine doit être prise en compte.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://support.google.com/trends/answer/4365533?hl=en")[Google Trends Help — FAQ about Google Trends data]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Échantillonnage, normalisation relative, limites des termes peu recherchés et avertissement que Trends n’est pas un sondage scientifique.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.wipo.int/en/web/wipo-magazine/articles/us-copyright-office-on-ai-human-creativity-still-matters-legally-73696")[WIPO Magazine — US Copyright Office on AI: Human creativity still matters legally]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Contribution humaine et approche américaine de la protection des œuvres assistées par IA; ce texte n’est pas une règle mondiale.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://openai.com/policies/terms-of-use/")[OpenAI — Terms of Use]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Responsabilité de l’utilisateur, sorties potentiellement inexactes, devoir d’évaluation et règles de présentation des résultats; conditions consultées en vigueur au 1er janvier 2026.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://transparency.meta.com/policies/ad-standards/")[Meta Transparency Center — Introduction to the Advertising Standards]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Principes publicitaires Meta et nécessité de vérifier les règles applicables si l’ebook est promu sur la plateforme.]
  ]
  #v(0.35cm)
  #text(size: 9pt, fill: luma(80))[Sources consultées jusqu’au 5 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]
