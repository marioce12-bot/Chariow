# Pages publiques Vendeo — projet de validation (FR)

> **Version de travail — non publiée.** Les pages Conditions d’utilisation et Politique de confidentialité sont des projets à faire valider avant toute mise en production. Ce contenu n’est pas un avis juridique. Ne pas publier avant résolution des questions indispensables ci-dessous.

**Coordonnées opérationnelles à afficher :** vendeo008@gmail.com · WhatsApp +229 0191829482 · https://wa.me/2290191829482

## Points à confirmer avant publication

1. **Éditeur légal / responsable** : nom ou raison sociale exacte, forme et immatriculation si applicables, adresse postale et identité du responsable. Les anciennes mentions « Digital store global » et « Trésor Marioce » sont contradictoires ; aucune n’est retenue ici.
2. **Droit et commerce** : pays d’établissement et règles applicables, prix, essai éventuel, périodicité, paiement/renouvellement, taxes, annulation, remboursements et rôle exact de SasPay. Rien de cela ne doit être déduit de cette ébauche.
3. **Traitements réels** : inventaire des données de boutiques et clients finaux, finalités et bases juridiques, rôles contractuels, permissions, champs envoyés aux fournisseurs IA, fournisseurs et environnements réellement actifs.
4. **Vie privée opérationnelle** : lieux de traitement/transferts, durées ou critères de conservation, sauvegardes, mesures de sécurité vérifiées, cookies/stockage local, suivi/analytique et mécanisme de choix requis.
5. **Procédures** : processus et délais de réponse aux demandes, exceptions légales de conservation, révocation des connexions, suppression chez Vendeo et chez les tiers, version/date d’entrée en vigueur.

## Audit technique succinct (branche examinée)

- **Supabase** : le middleware utilise `@supabase/ssr` et des cookies de session ; Supabase sert aussi aux données applicatives et à l’authentification. Le code suggère un chiffrement de certains secrets d’intégration, pas de toutes les données ni une garantie générale.
- **Hébergement** : le connecteur Vercel confirme le projet `vendeo`, son déploiement de production et les domaines `vendeo-studio.site` / `www.vendeo-studio.site`. Les régions de traitement et les garanties contractuelles restent à vérifier.
- **IA** : routes IA repérées ; le code mentionne un ordre de fournisseurs Imole, Groq et Gemini. Les fournisseurs effectivement activés et les contenus transmis sont à confirmer en configuration.
- **Paiements** : SasPay apparaît dans les fonctions de paiement/crédits. Le flux exact et les données de paiement manipulées doivent être contrôlés ; ne pas affirmer que les données de carte ne sont pas conservées sans preuve.
- **Boutique / publicité** : routes et code de boutique et de comptes/campagnes publicitaires présents. Chariow est l’intégration de boutique actuellement documentée ; Shopify n’est pas annoncé comme disponible. Les champs réellement reçus, dont les éventuelles données clients, et les permissions doivent être inventoriés.
- **WhatsApp** : coordonnées fournies comme canal de contact manuel, pas comme traitement automatisé.
- **Usage / traceurs** : composants de suivi/attribution et routes analytiques repérés ; la revue n’a pas établi tous les cookies, stockages locaux, traceurs, finalités et durées. Cookies d’authentification visibles dans middleware. `useUsageTracking` et `/api/track` enregistrent sections et durée visible avec un identifiant de session, reliés au compte authentifié ; ne pas qualifier ce suivi de strictement anonyme. Les caches et préférences sont aussi mémorisés dans le navigateur.
- **Sécurité / rétention** : pas de preuve suffisante pour promettre chiffrement exhaustif, conservation déterminée, conformité garantie ou délai de suppression.

---

# Textes complets proposés

## À propos

### Les bonnes décisions commencent par une vision claire.

Vendeo aide les créateurs et vendeurs de produits numériques à rapprocher leurs ventes et leurs dépenses publicitaires pour mieux comprendre leur activité.

### Notre intention
Les chiffres publicitaires et les ventes d’une boutique vivent souvent dans des outils distincts. Vendeo est conçu pour rapprocher ces repères et donner aux vendeurs une lecture plus utile de leurs campagnes, sans prétendre remplacer leur jugement.

Notre ambition est de rendre les informations opérationnelles plus lisibles afin que chacun puisse examiner ses résultats et décider de la suite avec davantage de contexte.

### Un espace de pilotage pour le commerce numérique
Vendeo rassemble des vues sur les produits, les ventes et les performances publicitaires. Les analyses et indicateurs calculés peuvent aider à repérer des tendances ; ils restent des estimations dépendantes des données et des définitions disponibles dans les services connectés.

- Relier une boutique Chariow et consulter les informations qu’elle autorise.
- Examiner les dépenses et résultats des canaux publicitaires connectés et disponibles dans l’application.
- Utiliser des outils d’analyse, de préparation de campagnes et d’assistance IA selon les fonctions activées.

### Pensé pour les vendeurs de produits digitaux
Ebooks, guides, ressources et autres produits numériques exigent souvent de tester des messages et des canaux de vente. Vendeo souhaite accompagner ce travail en rendant les données moins dispersées et les décisions plus compréhensibles.

La connexion à Chariow permet de retrouver les informations autorisées de votre boutique. D’autres intégrations pourront être proposées progressivement ; seules celles indiquées comme disponibles dans l’application peuvent être connectées.

### Une approche transparente
Les résultats dépendent de la qualité des données importées, des périodes comparées et des règles propres aux plateformes. Vendeo ne garantit ni ventes, ni rentabilité, ni acceptation ou diffusion d’une publicité. L’utilisateur garde la responsabilité de vérifier ses chiffres et ses choix.

Notre priorité est de vous présenter les données disponibles avec leurs limites et leurs hypothèses, plutôt que de transformer une estimation en certitude.

### Édition et contact
[À compléter avant publication : identité de l’éditeur légal, statut et adresse de contact juridique.] Vous pouvez déjà joindre l’équipe Vendeo aux coordonnées indiquées ci-dessous.

Pour une question sur le service, une intégration ou ces informations, contactez-nous : vendeo008@gmail.com · WhatsApp +229 0191829482 · https://wa.me/2290191829482.

## Conditions d’utilisation — projet à valider

### Objet et description du service
Vendeo est un service logiciel destiné aux vendeurs et créateurs de produits numériques. Selon les fonctions disponibles et les autorisations accordées, il peut rapprocher des informations de boutique et de publicité, fournir des tableaux de bord, estimations et analyses, proposer une assistance IA et permettre de préparer ou transmettre certaines actions publicitaires.

Les fonctions accessibles peuvent évoluer. La boutique actuellement documentée dans le produit est Chariow. Toute intégration ou fonction non disponible dans l’application ne doit pas être considérée comme incluse.

### Compte et accès
L’utilisateur doit fournir des informations exactes, protéger ses moyens d’accès et signaler tout accès non autorisé. Il doit être habilité à agir pour les boutiques, comptes publicitaires et autres ressources qu’il relie à Vendeo. Il lui appartient de maintenir ses coordonnées et autorisations à jour.

Les connexions à des services tiers dépendent des permissions accordées, de leurs conditions et de leur disponibilité. L’utilisateur peut retirer ces autorisations auprès du service tiers lorsque celui-ci le permet ; cela peut désactiver certaines fonctions Vendeo.

### Connexions et actions publicitaires
Une connexion autorise uniquement les traitements nécessaires aux fonctions demandées et aux permissions effectivement accordées. Les actions qui peuvent engager un compte publicitaire ou créer une dépense externe requièrent une vérification attentive et une validation explicite dans le parcours concerné.

L’utilisateur reste responsable du choix du produit, du texte et des visuels, du ciblage, du budget, du calendrier, du lien de destination et du respect des règles des plateformes et des lois applicables. La plateforme publicitaire peut examiner, refuser, modifier, suspendre ou diffuser une annonce selon ses propres règles.

### Données, calculs et estimations
Les indicateurs calculés peuvent différer des chiffres affichés par les boutiques ou plateformes en raison des fenêtres d’attribution, fuseaux horaires, événements manquants, annulations, remboursements, synchronisations ou méthodes de calcul différentes. Ils sont fournis comme aide à l’analyse, non comme comptabilité certifiée, conseil financier ou garantie de résultat.

L’utilisateur doit vérifier les données sources et les hypothèses avant toute décision commerciale. Vendeo ne garantit aucun chiffre d’affaires, retour publicitaire ou résultat de campagne.

### Assistance par intelligence artificielle
Les fonctions d’assistance IA peuvent produire des suggestions, textes ou analyses qui comportent des erreurs, omissions ou informations inadaptées. Il appartient à l’utilisateur de les vérifier, de les adapter et de ne pas les publier ou utiliser sans examen.

Les réponses ne constituent ni un conseil juridique, financier, fiscal ou professionnel, ni une validation de conformité d’une publicité ou d’un produit. Les données envoyées à des fournisseurs techniques pour répondre à une requête sont décrites dans la politique de confidentialité.

### Conditions commerciales à confirmer
Les prix, éventuel essai, périodicité, modalités de paiement et de renouvellement, taxes, annulation, crédits éventuels et règles de remboursement ne sont pas fixés par ce projet. Les conditions applicables doivent être présentées clairement dans l’application avant toute souscription ou paiement.

Les dépenses média et les frais de services tiers sont distincts de tout tarif Vendeo et sont soumis aux conditions des fournisseurs concernés. Le prestataire de paiement et le rôle respectif des parties doivent être confirmés avant publication. Aucun engagement tarifaire ni remboursement n’est créé par le présent texte.

### Contenus et propriété intellectuelle
L’utilisateur conserve les droits qu’il détient sur ses produits, marques, créations, données et contenus transmis. Il accorde uniquement les autorisations techniques nécessaires au fonctionnement des fonctions qu’il utilise, dans la mesure où elles sont requises.

Les droits sur le nom, le logiciel, l’interface et les éléments propres à Vendeo appartiennent à leur titulaire légitime, dont l’identité doit être confirmée. L’accès au service ne transfère aucun droit de propriété intellectuelle.

### Usages interdits
L’utilisateur s’engage à ne pas utiliser le service pour une activité illégale, frauduleuse ou portant atteinte aux droits d’autrui ; à ne pas accéder aux comptes ou données d’une autre personne sans autorisation ; à ne pas contourner les mesures de sécurité ou les limites d’accès ; et à ne pas perturber le service, introduire de code malveillant ou utiliser les connexions d’une manière contraire aux règles des plateformes tierces.

### Disponibilité et évolution
Le service dépend notamment de réseaux, hébergeurs, intégrations et plateformes externes. Des interruptions, erreurs ou changements d’API peuvent affecter certaines fonctions. Vendeo peut faire évoluer, corriger ou désactiver des fonctions, en tenant compte des engagements applicables qui restent à définir par l’éditeur.

Aucune disponibilité permanente ni résultat spécifique n’est garanti par ce projet de texte. Les limitations de responsabilité éventuelles doivent être examinées et rédigées de façon équilibrée, conformément aux règles applicables.

### Désactivation et suppression
L’utilisateur peut demander la désactivation de son compte et la suppression des données selon le parcours décrit sur la page de suppression. La suppression peut être soumise à vérifications raisonnables et à la conservation limitée de certains éléments lorsqu’une obligation légitime l’exige ; les modalités et exceptions doivent être confirmées.

En cas de risque de sécurité ou d’usage manifestement interdit, des mesures proportionnées peuvent être nécessaires. Les modalités de notification, contestation et rétablissement doivent être définies avant publication.

### Éditeur et dispositions à valider
L’éditeur légal, son adresse de contact juridique, la loi applicable et la juridiction compétente restent à confirmer. Les anciennes pages mentionnaient des identités contradictoires (« Digital store global » et « Trésor Marioce »). Aucune n’est retenue comme identité légale dans ce projet. Ces éléments doivent être renseignés et validés avant mise en production.

En cas de question, contactez l’équipe aux coordonnées affichées sur cette page. La version publiée devra comporter sa date d’entrée en vigueur et, le cas échéant, un mécanisme clair d’information en cas de modification.

## Politique de confidentialité — projet à valider

### Responsable et contact
[À confirmer avant publication : identité et adresse de l’éditeur légal et du responsable du traitement.] Pour toute demande relative aux données, vous pouvez contacter l’équipe à vendeo008@gmail.com ou par WhatsApp au +229 0191829482. Le canal WhatsApp est un moyen de contact manuel, non une procédure automatisée de gestion des demandes.

### Catégories de données
Selon les fonctions utilisées et les autorisations accordées, le service peut traiter les catégories suivantes. La présence effective et l’étendue de certains champs doivent être confirmées par un inventaire technique complet.

- Compte et authentification : adresse e-mail, identifiant et informations de session nécessaires à la connexion ; les mots de passe relèvent du fournisseur d’authentification Supabase.
- Données de boutique : produits, événements de vente et informations associées, potentiellement certaines données concernant les clients finaux lorsqu’elles sont accessibles et nécessaires aux fonctions. Vendeo s’adresse au vendeur ; le rôle de chaque partie sur ces données de clients doit être établi.
- Données publicitaires et intégrations : informations et statistiques de campagnes, paramètres et ressources accessibles via les connexions effectivement disponibles.
- Contenus saisis et données d’usage : requêtes, paramètres, messages ou informations transmis dans les outils d’analyse et d’assistance, ainsi que données techniques nécessaires au fonctionnement et à la sécurité.
- Données commerciales : statut d’accès ou d’achat/crédit dans les fonctions de paiement identifiées. Les champs réellement traités par le prestataire et Vendeo sont à inventorier.

### Finalités
Les données servent, selon le parcours utilisé, à créer et sécuriser un compte, fournir les tableaux de bord et calculs demandés, récupérer ou afficher les données de services connectés, générer des réponses IA, gérer certaines fonctions commerciales, prévenir les abus et diagnostiquer les erreurs. Les données nécessaires, bases juridiques et durées doivent être précisées par l’éditeur pour chaque finalité avant publication.

### Prestataires et services tiers
L’audit du code de cette branche montre un usage de Supabase pour l’authentification et les données applicatives, des routes de paiement nommant SasPay, et des fonctions IA qui peuvent appeler Imole, Groq ou Gemini selon la route et l’ordre de fournisseurs configuré. L’application comprend aussi des routes de synchronisation/intégration boutique et des fonctions liées à des comptes publicitaires. Les fournisseurs réellement activés, leurs rôles, lieux de traitement, sous-traitants et données communiquées doivent être vérifiés en configuration et en production.

Vercel apparaît dans des commentaires du code comme environnement d’hébergement envisagé ou utilisé, mais l’hébergement effectivement configuré pour ce déploiement doit être confirmé. Les plateformes connectées (notamment Chariow et les plateformes publicitaires disponibles) traitent les données sous leurs propres conditions. SasPay est repéré dans les fonctions de paiement ; aucune information de carte ne doit être déclarée comme non conservée sans vérification des flux exacts.

Les requêtes d’assistance IA peuvent contenir des extraits de texte, contexte ou données fournis par l’utilisateur. Ne transmettez pas de données personnelles non nécessaires. L’inventaire des champs transmis à chaque fournisseur reste à finaliser.

### Données de vos clients
Si des informations de clients finaux provenant d’une boutique sont accessibles à Vendeo, le vendeur doit s’assurer qu’il dispose des droits et informations nécessaires pour autoriser leur traitement. Le rôle de Vendeo (prestataire agissant sur instructions ou responsable distinct selon l’opération), les instructions, mesures de sécurité et modalités de réponse aux demandes doivent être définis contractuellement. Cette notice ne constitue pas une garantie de conformité.

### Stockage, sécurité et conservation
Le code utilise Supabase et des mécanismes de session/cookies associés à l’authentification. Certaines données d’intégration sensibles semblent passer par une fonction de chiffrement avant stockage ; cela ne permet pas d’affirmer que toutes les données sont chiffrées de bout en bout ni de décrire la gestion complète des clés. L’étendue, la configuration et les mesures de sécurité doivent être contrôlées.

La durée de conservation varie selon la catégorie, la finalité, les contraintes techniques et les obligations applicables. Les durées précises restent à confirmer avant publication. L’éditeur doit définir des durées ou critères de suppression, y compris pour les journaux, sauvegardes et données chez les prestataires.

### Demandes, retrait et suppression
Vous pouvez contacter l’équipe pour demander l’accès, la rectification, l’effacement ou la limitation des données, ou poser une question sur leur traitement. Les droits applicables et modalités dépendent du droit compétent et doivent être validés. Pour une connexion tierce, vous pouvez également retirer l’autorisation depuis le service concerné ; cela n’efface pas nécessairement les données déjà synchronisées chez Vendeo.

Pour demander la suppression d’un compte ou de données, écrivez à vendeo008@gmail.com avec l’adresse associée au compte et l’objet « Demande de suppression Vendeo ». Évitez de joindre un mot de passe ou des données sensibles. Une vérification raisonnable pourra être demandée. La procédure et ses délais de réponse doivent être fixés avant publication. Certaines données peuvent devoir être conservées pour une obligation légale ou un litige ; les exceptions concrètes restent à établir.

### Cookies, stockage local et mesure d’usage
Le middleware du projet utilise des cookies de session liés à Supabase et à l’authentification. L’audit repère aussi des composants de suivi/attribution et des routes d’analytique ; il n’a pas établi l’ensemble des balises, cookies, stockages locaux, durées ou déclencheurs. Une revue complète du navigateur et des outils tiers est nécessaire pour distinguer cookies indispensables, mesure d’usage et éventuels traceurs publicitaires, puis informer et recueillir les choix requis.

### Transferts et mises à jour
Les lieux d’hébergement et de traitement des fournisseurs ainsi que les éventuels transferts internationaux ne sont pas déterminés par ce seul examen du code. Ils doivent être documentés, avec les garanties et informations requises selon les lois applicables. Toute modification importante de cette notice devra être présentée aux utilisateurs selon une procédure à définir.

## Suppression des données

### Comment envoyer une demande
Écrivez à vendeo008@gmail.com avec l’objet « Demande de suppression Vendeo ». Indiquez l’adresse e-mail associée à votre compte et précisez si votre demande concerne le compte entier ou des données déterminées. Vous pouvez aussi nous joindre par WhatsApp au +229 0191829482, mais l’e-mail est préférable pour garder une trace de la demande.

Ne transmettez jamais votre mot de passe, numéro de carte ou autre donnée sensible. Nous pouvons vous demander des informations raisonnables pour vérifier que vous êtes autorisé à demander la suppression.

### Ce que nous examinerons
Nous examinerons les données de compte et les données applicatives associées, ainsi que les connexions tierces éventuellement liées, selon les fonctions réellement utilisées. Les éléments conservés par un service externe, par exemple une boutique, un réseau publicitaire ou un prestataire de paiement, ne sont pas nécessairement supprimés par une action dans Vendeo ; une demande distincte peut être nécessaire auprès de ce service.

La suppression complète peut être affectée par des obligations légales, la résolution d’un différend, la prévention de fraude ou les sauvegardes techniques. Les catégories concernées, règles applicables et critères de fin de conservation doivent être confirmés par l’éditeur ; aucune durée de traitement n’est annoncée ici.

### Révoquer une connexion tierce
Pour interrompre les futurs accès, révoquez également Vendeo dans les paramètres de la boutique ou de la plateforme publicitaire concernée lorsque cette option existe. La révocation d’un accès tiers et la suppression des données précédemment reçues sont deux opérations distinctes.

### Suite donnée à votre demande
Nous vous confirmerons la réception et, si nécessaire, demanderons des précisions ou une vérification. Le délai de réponse et la procédure définitive restent à définir avant publication. L’identité de l’éditeur légal reste également à confirmer ; les coordonnées de contact ci-dessus sont les coordonnées opérationnelles communiquées pour ce projet.
