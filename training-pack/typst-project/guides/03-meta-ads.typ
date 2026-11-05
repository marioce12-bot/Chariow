// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.
#import "../report-theme.typ": report-accent, report-theme
#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary
#let glossary = (
  (key: "portefeuille", short: "portefeuille professionnel", long: "portefeuille professionnel Meta", description: "Espace de gestion d’entreprise qui regroupe des actifs Meta et organise des accès professionnels."),
  (key: "actif", short: "actif", long: "actif professionnel", description: "Ressource telle qu’une Page, un compte publicitaire ou un compte Instagram, associée à un portefeuille ou gérée avec un accès partagé."),
  (key: "acces_complet", short: "accès complet", long: "accès complet", description: "Niveau de permission donnant un contrôle étendu sur le portefeuille, les personnes, les actifs et certains réglages sensibles."),
  (key: "acces_partiel", short: "accès partiel", long: "accès partiel", description: "Permission limitée aux actifs ou tâches attribués, à privilégier lorsque le rôle ne nécessite pas le contrôle complet."),
  (key: "2fa", short: "2FA", long: "authentification à deux facteurs", description: "Contrôle de connexion qui demande une seconde preuve en plus du mot de passe, par exemple une application d’authentification.")
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
  title: "Configurer son compte Meta Ads",
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
  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[Configurer son compte Meta Ads]
  #v(0.35cm)
  #text(size: 14pt, fill: report-accent)[Organiser les actifs, limiter les accès et préparer la facturation]
  #v(0.7cm)
  #line(length: 100%, stroke: 1.2pt + report-accent)
  #v(0.8cm)
  #text(size: 10.5pt, fill: luma(70))[POUR QUI : Responsables de petite entreprise, annonceurs et prestataires qui préparent un portefeuille professionnel Meta.]
  #v(0.65cm)
  #panel("Objectif de ce guide", [Vous saurez dresser l’inventaire des actifs et des personnes, vérifier les accès utiles et préparer une revue de sécurité avant toute campagne.])
  #v(0.55cm)
  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]
  #v(0.2cm)
- Distinguer portefeuille, Page, compte publicitaire et actifs associés.
- Attribuer les autorisations selon le travail nécessaire, sans partager de secrets.
- Vérifier 2FA, facturation et connexions tierces avant le lancement.
  #v(0.7cm)
  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 5 novembre 2026]
  ]
  #page(header: none)[
  #outline(title: [Sommaire], depth: 2, indent: 1.1em)
  ]
  #heading(numbering: none, outlined: false)[Avant de commencer]
  Les réglages d’un portefeuille Meta touchent à la propriété des actifs, aux accès des personnes, aux dépenses et aux intégrations. La configuration doit commencer par un inventaire et être validée par la personne qui contrôle les actifs. Les menus et disponibilités varient selon les comptes; les repères ci-dessous s’appuient sur l’aide Meta consultée le 4 novembre 2026.
  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])
  #heading(numbering: none, outlined: false)[Repères pratiques]
  #text(weight: "bold", fill: report-accent)[Pour qui ?]
  Responsables de petite entreprise, annonceurs et prestataires qui préparent un portefeuille professionnel Meta.
  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]
  Vous saurez dresser l’inventaire des actifs et des personnes, vérifier les accès utiles et préparer une revue de sécurité avant toute campagne.
  = Faire l’inventaire et confirmer la propriété
  Avant de modifier un portefeuille, identifiez qui contrôle chaque ressource et comment elle est utilisée. Ajouter une Page à un portefeuille peut changer sa propriété; demander un accès partagé est une autre démarche.
  == Points à retenir
  - Listez le portefeuille professionnel, la Page, le compte publicitaire et, si nécessaire, le compte Instagram; notez le propriétaire et les identifiants utiles dans un registre protégé.
- Vérifiez si une Page est déjà rattachée à une autre entreprise et demandez l’accord du propriétaire avant toute demande ou ajout.
- L’aide Meta distingue l’ajout d’une Page existante de la demande d’accès partagé; l’ajout peut transférer la propriété au portefeuille.
  #panel("À mettre en pratique", [Complétez un inventaire avec actif, propriétaire, administrateur responsable, statut, objectif d’usage et justificatif d’autorisation. Ne changez aucune propriété avant confirmation écrite.])
  #panel("Exemple de travail", [Si un prestataire doit publier des annonces pour une marque cliente, un accès partenaire limité peut être préférable à l’ajout de la Page comme propriété de son propre portefeuille.])
  = Préparer la Page et le compte publicitaire
  Un compte publicitaire doit être rattaché aux bons actifs et à une méthode de paiement autorisée. Les comptes disponibles, les limites de création et les conditions de vérification peuvent dépendre de l’historique du compte et des contrôles Meta.
  == Points à retenir
  - Confirmez le compte publicitaire prévu, la devise, le fuseau horaire, la Page utilisée et les accès nécessaires avant de configurer une campagne.
- Meta mentionne une Page ou un rôle approprié sur une Page ainsi qu’un moyen de paiement valide comme prérequis de diffusion dans les procédures décrites.
- N’ouvrez pas plusieurs comptes par réflexe : les limites d’accès ou de création peuvent varier; vérifiez l’état dans les outils d’assistance officiels.
  #panel("À mettre en pratique", [Vérifiez la cohérence entre nom d’entreprise, actifs, devise, fuseau et destination client. Notez ce qui doit être validé par le responsable financier avant toute dépense.])
  #panel("Exemple de travail", [Pour une équipe dans plusieurs pays, un fuseau horaire mal choisi peut compliquer la lecture des périodes de facturation et des rapports; confirmez-le avant la première campagne.])
  = Attribuer les rôles et protéger les connexions
  Accorder l’accès complet à tout le monde augmente l’impact d’une erreur ou d’un compte compromis. Créez une matrice personnes–actifs–tâches et attribuez uniquement les permissions utiles.
  == Points à retenir
  - L’accès complet permet un contrôle étendu du portefeuille; l’accès partiel limite les tâches ou actifs. Les autorisations financières sont distinctes des droits opérationnels.
- Le 2FA est une protection essentielle et peut être exigé par le portefeuille. Chaque personne doit sécuriser son propre compte avant d’accéder aux actifs.
- Ne transmettez jamais un mot de passe, un code de connexion, une clé de secours ou un code 2FA par courriel ou dans le document de suivi.
  #panel("À mettre en pratique", [Pour chaque personne, inscrivez le rôle, les tâches et les actifs requis; proposez l’accès minimal, faites accepter l’invitation par la personne et planifiez une revue périodique.])
  #panel("Exemple de travail", [Un analyste qui consulte les résultats n’a pas nécessairement besoin de modifier les paiements ni d’ajouter des administrateurs.])
  = Vérifier la facturation et les dépenses
  La vérification de la facturation doit être faite avec la personne autorisée, dans l’interface du compte publicitaire. Le guide ne remplace pas les règles comptables, fiscales ou les contrôles internes de l’entreprise.
  == Points à retenir
  - Confirmez que le moyen de paiement est valide, qu’il est rattaché au compte prévu et que le responsable connaît les plafonds ou limites de dépenses disponibles.
- Vérifiez les factures, transactions, devise et coordonnées de facturation dans l’interface officielle; les options peuvent varier selon le pays et le compte.
- Séparez les droits d’administration de campagne des droits financiers avancés; accordez ces derniers uniquement aux rôles qui en ont besoin.
  #panel("À mettre en pratique", [Établissez une fiche de contrôle sans numéro complet de carte : responsable, compte, date de revue, statut du moyen de paiement et autorisation budgétaire. Rangez les justificatifs dans l’outil approuvé par l’entreprise.])
  #panel("Exemple de travail", [Un compte peut être correctement configuré pour diffuser, mais ne pas être autorisé à engager le budget prévu; faites valider l’enveloppe par le propriétaire avant publication.])
  = Examiner les applications tierces et les accès obsolètes
  Les intégrations peuvent garder des permissions de consultation ou de gestion. La révocation d’une intégration coupe généralement les accès futurs via Meta, mais ne garantit pas que l’éditeur a effacé les données qu’il possédait déjà.
  == Points à retenir
  - Listez les applications, partenaires et prestataires rattachés; vérifiez l’éditeur, les autorisations demandées, la finalité et la date de dernière utilisation.
- Retirez les accès inutiles après validation par le propriétaire et documentez l’impact éventuel sur les outils qui dépendent encore de l’intégration.
- Meta indique que certaines permissions professionnelles ont des règles distinctes des autorisations générales des applications; vérifiez la politique applicable au moment de la revue.
  #panel("À mettre en pratique", [Établissez une revue trimestrielle ou après chaque départ de prestataire : membres, invitations en attente, actifs attribués, intégrations, 2FA et facturation.])
  #panel("Exemple de travail", [Si vous révoquez un outil de planification, vérifiez au préalable qui publiera ensuite les contenus et où seront conservés les rapports nécessaires.])
  = Atelier guidé
  Exercice guidé (20–30 min) : réalisez un audit de préparation sans modifier les réglages en direct.
  + Inventoriez le portefeuille, la Page, le compte publicitaire et le compte Instagram s’il est utilisé; notez propriétaire et responsable.
+ Listez les personnes, leurs tâches et les actifs nécessaires; proposez un niveau d’accès minimal.
+ Vérifiez si le 2FA est activé et si des invitations attendent une acceptation.
+ Dans la zone de facturation, confirmez le statut du moyen de paiement et le compte concerné sans copier de données sensibles dans la fiche.
+ Recensez intégrations et permissions visibles; signalez les connexions disproportionnées ou inutiles.
+ Soumettez les changements éventuels au propriétaire et au responsable financier avant toute application.
  #panel("Livrable", [Livrable : un registre de configuration et une liste d’actions approuvées. Cet exercice ne demande aucun mot de passe, code 2FA ou numéro de carte.])
  = Liste de contrôle avant d’avancer
  - Le propriétaire de chaque actif est confirmé.
- Les changements de propriété sont autorisés par la bonne organisation.
- Chaque personne dispose seulement des permissions requises.
- Le 2FA est activé ou les exigences officielles sont suivies.
- Le moyen de paiement, la devise et le compte sont vérifiés par le responsable.
- Les invitations et intégrations tierces sont revues.
- Aucun mot de passe, code 2FA ou numéro complet de carte n’est stocké dans le registre.
  = Limites et précautions
  - Les noms de menus, rôles et fonctions Meta peuvent évoluer et varier selon les comptes et pays.
- N’ajoutez pas une Page comme actif appartenant à votre portefeuille sans confirmer la propriété et l’accord du propriétaire.
- Ne communiquez jamais de mot de passe, de code 2FA ni de données complètes de paiement.
- La révocation d’une intégration ne supprime pas nécessairement les données déjà conservées par l’éditeur tiers.
- Les politiques de plateforme ne remplacent ni les règles locales ni un avis juridique ou financier.
  = Glossaire essentiel
  #print-glossary(glossary, show-all: true)
  = Sources et vérification
  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/442345745885606")[Meta Business Help Center — About business portfolio and business asset permissions]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Portefeuille, accès complet et partiel, droits financiers et permissions des actifs.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/720478807965744")[Meta Business Help Center — Add a Facebook Page to your organisation's business portfolio]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Prérequis d’ajout d’une Page, distinction entre propriété et accès partagé, effet sur les accès existants.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/2169003770027706")[Meta Business Help Center — Add people to a business portfolio and assign a business asset]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Invitations, attribution des actifs, acceptation et permissions des personnes.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/865384580786591")[Meta Business Help Center — About two-factor authentication for your business portfolio]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Rôle du 2FA et conséquences possibles lorsque la vérification est exigée.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/407323696966570")[Meta Business Help Center — How to create an ad account in Ads Manager]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Éléments à préparer pour un compte publicitaire, Page et moyen de paiement; les options dépendent du compte.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/help/218345114850283")[Meta Help Center — Manage the privacy settings for third-party apps]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Permissions d’applications et limites de la révocation concernant les données déjà conservées.]
  ]
  #v(0.35cm)
  #text(size: 9pt, fill: luma(80))[Sources consultées le 5 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]
