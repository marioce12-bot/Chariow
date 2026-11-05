// Generated from ../guide-content JSON by build_ebooks.py; edit the JSON source, not this file.
#import "../report-theme.typ": report-accent, report-theme
#import "@preview/glossarium:0.5.10": make-glossary, register-glossary, print-glossary
#let glossary = (
  (key: "business-portfolio", short: "portefeuille professionnel", long: "portefeuille professionnel", description: "Espace de gestion qui regroupe des actifs d’entreprise, des comptes et des personnes sur une plateforme."),
  (key: "ad-account", short: "compte publicitaire", long: "compte publicitaire", description: "Espace qui permet de configurer, financer, publier et mesurer les campagnes d’une organisation."),
  (key: "advertiser-account", short: "compte annonceur", long: "compte annonceur Pinterest", description: "Compte Pinterest dédié à la gestion des campagnes et paramètres publicitaires."),
  (key: "two-factor", short: "2FA", long: "authentification à deux facteurs", description: "Protection de connexion demandant une seconde preuve en plus du mot de passe."),
  (key: "business-center", short: "Business Center", long: "TikTok Business Center", description: "Espace TikTok for Business de gestion des comptes, membres, partenaires et actifs d’entreprise.")
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
  title: "Créer ses comptes publicitaires",
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
  #text(size: 26pt, weight: "bold", fill: rgb("#17233C"))[Créer ses comptes publicitaires]
  #v(0.35cm)
  #text(size: 14pt, fill: report-accent)[Meta Ads, Pinterest Ads et TikTok Ads]
  #v(0.7cm)
  #line(length: 100%, stroke: 1.2pt + report-accent)
  #v(0.8cm)
  #text(size: 10.5pt, fill: luma(70))[POUR QUI : débutants qui préparent leurs premiers comptes publicitaires pour leur propre entreprise]
  #v(0.65cm)
  #panel("Objectif de ce guide", [Créer ou préparer un compte publicitaire sur les trois plateformes, choisir la bonne structure, renseigner les informations cohérentes et vérifier l’accès, la facturation et l’état d’approbation sans lancer de publicité par inadvertance.])
  #v(0.55cm)
  #text(size: 11pt, weight: "bold", fill: rgb("#17233C"))[À la fin, vous pourrez]
  #v(0.2cm)
- Distinguer un profil ou compte social, un portefeuille professionnel et un compte publicitaire.
- Créer un compte publicitaire Meta et comprendre les options d’accès dans Business Suite.
- Créer un compte professionnel et un compte annonceur Pinterest.
- Ouvrir Ads Manager TikTok, fournir les informations demandées et suivre l’examen du compte.
- Sécuriser les accès et valider devise, fuseau horaire, facturation et autorisations avant toute dépense.
  #v(0.7cm)
  #text(size: 9pt, fill: luma(90))[Guide pratique • Version 1.0 • Références vérifiées le 5 novembre 2026]
  ]
  #page(header: none)[
  #outline(title: [Sommaire], depth: 2, indent: 1.1em)
  ]
  #heading(numbering: none, outlined: false)[Avant de commencer]
  Les trois plateformes modifient parfois leurs menus, critères d’admissibilité et modalités de paiement. Ce guide décrit les parcours usuels d’après les centres d’aide officiels consultés le 5 novembre 2026. Utilisez les liens de référence pour confirmer l’écran et les règles applicables à votre pays et à votre compte. Créer un compte ne lance pas automatiquement une campagne.
  #panel("Portée et prudence", [Les exemples sont pédagogiques et ne prédisent pas vos résultats. Les interfaces, règles et conditions varient selon les pays, comptes et périodes. Vérifiez les exigences officielles actuelles avant toute décision commerciale ou dépense.])
  #heading(numbering: none, outlined: false)[Repères pratiques]
  #text(weight: "bold", fill: report-accent)[Pour qui ?]
  débutants qui préparent leurs premiers comptes publicitaires pour leur propre entreprise
  #text(weight: "bold", fill: report-accent)[Ce que vous allez produire]
  Créer ou préparer un compte publicitaire sur les trois plateformes, choisir la bonne structure, renseigner les informations cohérentes et vérifier l’accès, la facturation et l’état d’approbation sans lancer de publicité par inadvertance.
  = Préparer les informations avant l’inscription
  Avant d’ouvrir les interfaces, décidez qui possédera les comptes et qui aura besoin d’y travailler. Pour une entreprise, privilégiez les outils professionnels et gardez les actifs au nom de l’entreprise lorsque cela correspond à votre situation.
  == Points à retenir
  - Préparez le nom légal de l’entreprise, son pays, son adresse de facturation et un courriel professionnel auquel le responsable peut accéder.
- Décidez du fuseau horaire et de la devise avant de créer chaque compte publicitaire. Ces paramètres affectent les rapports et la facturation; certaines plateformes ne permettent pas de les changer facilement après coup.
- Identifiez le propriétaire, les administrateurs et les partenaires. N’utilisez pas un compte partagé : chaque personne doit avoir son propre accès et uniquement les permissions nécessaires.
- Activez l’authentification à deux facteurs. Ne communiquez jamais les mots de passe, codes de connexion ou codes de récupération.
  #panel("À mettre en pratique", [Rassemblez les informations de l’entreprise et faites valider par la personne responsable les choix de pays, fuseau horaire, devise, propriétaire et méthode de paiement avant de créer les comptes.])
  #panel("Exemple de travail", [Si votre équipe est basée à Paris et vend dans plusieurs pays, choisissez le fuseau en fonction de l’organisation qui gérera les rapports, pas uniquement des pays ciblés par les annonces.])
  = Meta Ads : profil, portefeuille professionnel et compte publicitaire
  Un compte Facebook possède déjà un compte publicitaire associé. Pour gérer les actifs d’une entreprise, le portefeuille professionnel Meta (anciennement Business Manager dans certains écrans) aide à organiser pages, personnes et comptes publicitaires. Les fonctions offertes peuvent dépendre de l’historique et de l’admissibilité du compte.
  == Points à retenir
  - Connectez-vous avec votre profil Facebook personnel authentique et sécurisé. Si votre entreprise n’a pas encore de Page Facebook, créez-en une ou demandez un rôle approprié sur la Page que vous êtes autorisé à utiliser.
- Ouvrez Meta Business Suite et créez ou sélectionnez le portefeuille professionnel de l’entreprise dans les paramètres. Vérifiez que vous êtes dans le bon portefeuille avant toute création ou réclamation d’actif.
- Dans Paramètres, ouvrez Comptes puis Comptes publicitaires, sélectionnez Ajouter, puis Créer un compte publicitaire. Les noms de menus peuvent varier. Renseignez un nom, le fuseau horaire et la devise, puis confirmez l’ajout au bon portefeuille.
- Lisez les conditions et vérifiez soigneusement le portefeuille sélectionné : un nouveau compte publicitaire créé dans un portefeuille peut y rester attaché de façon permanente. Les limites de création et le nombre de comptes autorisés peuvent évoluer.
- Ajoutez les personnes et actifs requis avec les permissions minimales. Une Page appartenant à un tiers doit être partagée par son propriétaire; ne la revendiquez pas sans autorisation.
- Dans Facturation et paiements, ajoutez un moyen de paiement valide avec l’accord du responsable financier. Vérifiez le statut du compte dans Business Support Home avant de préparer une campagne.
  #panel("À mettre en pratique", [Avant de cliquer sur Créer, confirmez par écrit le nom, le portefeuille propriétaire, la devise et le fuseau horaire. Après création, notez l’identifiant du compte et contrôlez les accès sans inscrire de secret dans votre registre.])
  #panel("Exemple de travail", [Si vous gérez les annonces d’un client, demandez au client de partager l’accès ou de vous ajouter comme partenaire. Ne créez pas un compte personnel à votre nom pour remplacer la propriété de l’entreprise.])
  = Pinterest Ads : compte professionnel et compte annonceur
  Un compte professionnel Pinterest donne accès aux outils professionnels, notamment aux analyses et aux fonctionnalités publicitaires disponibles. La création initiale d’un compte professionnel et du compte annonceur peut nécessiter un ordinateur de bureau; vérifiez l’aide Pinterest si vous utilisez un téléphone.
  == Points à retenir
  - À partir de Pinterest Business, créez un compte professionnel ou convertissez un compte personnel si cette option convient. L’adresse courriel d’inscription à un nouveau compte doit respecter les conditions affichées par Pinterest.
- Renseignez les informations demandées sur l’entreprise et vérifiez l’accès au compte professionnel. Si vous êtes employé ou partenaire d’une agence, demandez l’accès à l’entreprise plutôt que de créer un compte qui duplique sa propriété.
- Dans le Business Hub ou le sélecteur de comptes, ouvrez la gestion des comptes publicitaires et choisissez l’option pour créer un compte annonceur. Complétez les informations de l’entreprise et les paramètres proposés pour le pays et la devise.
- Vérifiez le pays et la devise avant validation : Pinterest indique qu’un changement peut nécessiter la création d’un nouveau compte. Les options de facturation et la disponibilité des annonces varient selon le marché.
- Ajoutez les utilisateurs ou partenaires avec les rôles nécessaires. Si le compte est destiné à un client, demandez à son propriétaire de partager l’accès approprié.
- Complétez la facturation seulement avec l’accord du responsable habilité. Pour le suivi des conversions, configurez le Pinterest Tag ou l’intégration adaptée et vérifiez le consentement et les règles de confidentialité applicables.
  #panel("À mettre en pratique", [Ouvrez le compte annonceur depuis un ordinateur si l’option n’apparaît pas sur mobile. Avant de continuer, vérifiez dans les paramètres le pays, la devise et les coordonnées qui figureront sur les justificatifs de facturation.])
  #panel("Exemple de travail", [Pour une boutique qui vend en France, sélectionnez les informations de l’entité facturée et la devise réellement souhaitée. Ne choisissez pas une devise au hasard pour la modifier plus tard.])
  = TikTok Ads : inscription dans Ads Manager
  Le parcours en libre-service TikTok Ads Manager commence sur la page d’inscription TikTok for Business. La plateforme demande des renseignements d’entreprise et peut examiner le compte avant que les annonces puissent être diffusées.
  == Points à retenir
  - Ouvrez l’inscription TikTok for Business depuis le lien officiel et créez des identifiants avec une adresse courriel ou un numéro de téléphone contrôlé par l’entreprise. Validez le code reçu et acceptez les conditions après lecture.
- Créez le compte annonceur en renseignant le pays ou la région, le secteur, la dénomination légale de l’entreprise, le fuseau horaire, le téléphone et la devise demandés.
- Utilisez une dénomination légale cohérente avec les documents de l’entreprise. Une différence peut retarder l’approbation ou l’accès à d’autres outils professionnels.
- Ajoutez les informations de facturation et sélectionnez un moyen de paiement pris en charge dans votre région. Les renseignements fiscaux ou justificatifs demandés dépendent du pays.
- Après l’inscription, ouvrez Ads Manager et consultez les paramètres du compte pour vérifier l’état d’approbation. Un compte en attente ou refusé ne signifie pas que les annonces sont prêtes à diffuser; suivez la procédure officielle de révision si nécessaire.
- Relevez l’identifiant du compte depuis le menu du nom du compte. Si plusieurs personnes doivent gérer les actifs, utilisez Business Center et les invitations nominatives plutôt que le partage des identifiants.
  #panel("À mettre en pratique", [Après inscription, notez l’identifiant, l’état de vérification et les informations du propriétaire. Ne créez pas de campagne facturable avant que l’entreprise ait confirmé le budget et que le compte soit approuvé.])
  #panel("Exemple de travail", [Si TikTok demande une vérification d’entreprise, préparez les documents officiels correspondant au nom légal inscrit. N’envoyez des pièces que dans l’espace sécurisé de la plateforme.])
  = Contrôles communs avant la première campagne
  La création des comptes est seulement une étape de préparation. Avant toute mise en ligne, contrôlez que chaque compte appartient à la bonne entité, que les accès sont sécurisés et que les paramètres commerciaux sont corrects.
  == Points à retenir
  - Vérifiez le nom et l’identifiant du compte, l’entreprise propriétaire, le pays, la devise et le fuseau horaire.
- Contrôlez les accès des personnes et partenaires. Retirez les invitations et permissions qui ne sont plus nécessaires avec l’accord du propriétaire.
- Confirmez les exigences de vérification, les règles publicitaires de la plateforme et l’état du moyen de paiement. Une création de compte ne garantit ni l’approbation ni la diffusion.
- Faites approuver le budget, les créations, la page de destination et le suivi des conversions par les responsables concernés avant publication.
- N’enregistrez jamais un mot de passe, un code 2FA ou un numéro complet de carte dans un document partagé.
  #panel("À mettre en pratique", [Utilisez la liste de contrôle ci-dessous et demandez une validation explicite du propriétaire du compte et du responsable financier avant toute dépense publicitaire.])
  #panel("Exemple de travail", [Un compte approuvé peut toujours nécessiter la vérification d’une annonce, d’un moyen de paiement ou d’un domaine avant la diffusion. Vérifiez les statuts affichés plutôt que de supposer que tout est actif.])
  = Atelier guidé
  Exercice guidé (30–45 min) : préparez une fiche de configuration sans lancer de publicité.
  + Pour Meta, Pinterest et TikTok, inscrivez le propriétaire prévu et la personne qui administrera le compte.
+ Notez le pays, le fuseau horaire et la devise envisagés pour chacun; faites valider ces choix par le responsable financier.
+ Suivez le parcours de création officiel et arrêtez-vous avant toute action qui engage un paiement ou publie une campagne non approuvée.
+ Consignez les identifiants de compte et l’état de vérification dans un outil professionnel sécurisé, sans mot de passe ni code de sécurité.
+ Vérifiez les permissions et les actifs nécessaires, puis faites approuver les accès par leur propriétaire.
+ Ajoutez les liens officiels pertinents aux favoris pour recontrôler les exigences avant la première campagne.
  #panel("Livrable", [Livrable : une fiche de configuration par plateforme avec propriétaire, identifiant, pays, devise, fuseau, état de vérification, responsables et prochaines actions approuvées. Aucun paiement ni lancement de campagne n’est requis pour cet exercice.])
  = Liste de contrôle avant d’avancer
  - Le propriétaire légal ou commercial de chaque compte est identifié.
- Les informations de l’entreprise correspondent aux documents officiels.
- Pays, devise et fuseau horaire ont été vérifiés avant validation.
- Les accès sont nominatifs, limités aux tâches nécessaires et protégés par 2FA.
- La propriété des pages, profils et actifs est confirmée; aucun actif tiers n’est revendiqué sans accord.
- La facturation et tout budget sont validés par la personne habilitée.
- Les états de vérification et les limites de plateforme sont contrôlés dans les interfaces officielles.
- Aucune campagne n’est publiée avant approbation du budget et des éléments de diffusion.
  = Limites et précautions
  - Les interfaces, noms des menus, règles, limites de compte et moyens de paiement évoluent et varient selon les pays et les comptes.
- Une inscription réussie ne garantit pas l’approbation de l’entreprise, l’accès à toutes les fonctionnalités ou la diffusion d’une publicité.
- Meta peut limiter le nombre de comptes publicitaires et l’ajout d’un compte à un portefeuille peut être permanent; vérifiez attentivement l’option choisie.
- Pinterest indique que la création de comptes professionnels et annonceurs nécessite actuellement un ordinateur dans certains parcours; confirmez l’aide officielle avant d’essayer sur mobile.
- Les documents d’entreprise et informations de paiement doivent être fournis uniquement dans les interfaces officielles sécurisées.
- Ce guide explique une configuration générale et ne constitue pas un conseil juridique, fiscal ou financier.
  = Glossaire essentiel
  #print-glossary(glossary, show-all: true)
  = Sources et vérification
  Les ressources ci-dessous soutiennent les notions mentionnées dans ce guide. Les pages en ligne et les règles de plateforme peuvent changer; la date de consultation est indiquée pour les vérifier de nouveau.
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/407323696966570")[Meta Business Help Center — How to create an ad account in Meta Ads Manager]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Compte publicitaire associé à Facebook, exigences Page et moyen de paiement, limites d’accès et création d’autres comptes dans un portefeuille.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://www.facebook.com/business/help/915885887059947")[Meta Business Help Center — Add an ad account to your business portfolio in Meta Business Suite]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Parcours de création, nom, devise, fuseau, portefeuille cible, accès et caractère permanent de l’ajout d’un compte.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://help.pinterest.com/en/business/article/get-a-business-account")[Pinterest Business Help — Get a business account]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Création et conversion de compte professionnel, fonctions professionnelles et disponibilité de l’inscription sur ordinateur.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://help.pinterest.com/en/business/article/create-an-advertiser-account")[Pinterest Business Help — Create an advertiser account]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Gestion et création des comptes annonceurs, configuration de facturation et conséquences du choix de devise.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://ads.tiktok.com/resources/help/article/create-tiktok-ads-manager-account")[TikTok Business Help Center — Create a TikTok ad account]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Inscription, renseignements entreprise, fuseau, devise, paiement, approbation et vérification de l’identifiant du compte.]
  ]
  #block(inset: (top: 7pt, bottom: 7pt), breakable: true)[
    #text(size: 10pt, weight: "bold", fill: report-accent)[#link("https://ads.tiktok.com/i18n/signup")[TikTok for Business — Sign up]]
    #linebreak()
    #text(size: 9pt, fill: luma(80))[Utilisée pour : Page officielle d’inscription à TikTok for Business.]
  ]
  #v(0.35cm)
  #text(size: 9pt, fill: luma(80))[Sources consultées le 5 novembre 2026. Ce guide fournit des repères pédagogiques, pas un avis juridique, financier ou une garantie de performance.]
