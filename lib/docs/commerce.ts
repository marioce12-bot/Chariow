import type { DocSection } from './types';

export const commerceSections: DocSection[] = [
  {
    id: 'getting-started',
    group: 'start',
    title: { fr: 'Démarrer et comprendre Vendeo', en: 'Getting started with Vendeo' },
    summary: {
      fr: 'Repérez les espaces du tableau de bord, reliez une boutique Chariow et comprenez quelles données sont nécessaires avant de lancer une campagne.',
      en: 'Find your way around the dashboard, connect a Chariow store, and understand which data is needed before launching a campaign.',
    },
    articles: [
      {
        id: 'dashboard-overview',
        title: { fr: 'Les espaces du tableau de bord', en: 'Dashboard areas' },
        paragraphs: [
          { fr: 'Le tableau de bord Vendeo regroupe les espaces Vue d’ensemble, Vendeo AI, Studio, Pub, Comptes publicitaires, Radar marché, Mes boutiques, Rapports, Bénéfices nets, Relances WhatsApp, Pilotage auto, Abonnement, Paramètres, Notifications et Suggestions et notes. Les éléments visibles peuvent dépendre de la configuration du compte.', en: 'The Vendeo dashboard groups Vue d’ensemble (Overview), Vendeo AI, Studio, Pub (Ads), Comptes publicitaires (Ad accounts), Radar marché (Market Radar), Mes boutiques (My stores), Rapports (Reports), Bénéfices nets (Net profit), Relances WhatsApp (WhatsApp follow-ups), Pilotage auto (Autopilot), Abonnement (Subscription), Paramètres (Settings), Notifications, and Suggestions et notes (Suggestions and notes). Which items appear can depend on account configuration.' },
          { fr: 'La navigation sélectionne un espace dans le tableau de bord. Pour passer d’un espace à l’autre, utilisez les éléments de navigation du tableau de bord. Les intitulés peuvent être affichés en français ou en anglais selon la langue choisie.', en: 'Navigation selects an area inside the dashboard. To move between areas, use the dashboard navigation. Labels may appear in French or English depending on your selected language.' },
        ],
        steps: [
          { fr: 'Connectez-vous, puis ouvrez Vue d’ensemble pour consulter le résumé disponible.', en: 'Sign in, then open Overview to see the available summary.' },
          { fr: 'Utilisez Mes boutiques pour ajouter ou sélectionner une boutique; la sélection précédente est conservée sur cet appareil.', en: 'Use My stores to add or select a store; the prior selection is retained on this device.' },
          { fr: 'Ouvrez les espaces dédiés (Pub, Comptes publicitaires, Radar marché, Rapports ou Pilotage auto) selon le travail à effectuer.', en: 'Open the dedicated areas (Ads, Ad accounts, Market Radar, Reports, or Autopilot) for the task you need to do.' },
        ],
      },
      {
        id: 'first-store',
        title: { fr: 'Première connexion d’une boutique', en: 'Connect your first store' },
        paragraphs: [
          { fr: 'Vendeo utilise l’intégration Chariow pour lire les informations de boutique et de produits. La connexion est vérifiée côté serveur; un état en attente ou en échec n’équivaut pas à une connexion opérationnelle. Si la boutique n’est plus autorisée, reconnectez-la depuis le parcours proposé par l’application.', en: 'Vendeo uses its Chariow integration to read store and product information. The connection is checked by the server; a pending or failed state is not a working connection. If the store is no longer authorized, reconnect it through the flow provided by the app.' },
          { fr: 'Le forfait Vendeo actuellement configuré autorise jusqu’à 3 boutiques Chariow. Le bouton « Boutique personnalisée » est désactivé : vous ne pouvez pas connecter une autre plateforme en collant son adresse ou des identifiants. Chariow est relié en suivant le parcours d’autorisation affiché dans Vendeo.', en: 'The currently configured Vendeo plan allows up to 3 Chariow stores. The “Custom store” button is disabled, so you cannot connect another platform by pasting its address or credentials. Chariow is linked by following the authorization flow shown in Vendeo.' },
        ],
        steps: [
          { fr: 'Dans Mes boutiques, cliquez sur « Connecter Chariow » (ou « Connect store », selon la langue). Vous êtes redirigé vers Chariow pour autoriser l’accès.', en: 'In My stores, click “Connect Chariow” (or “Connect store,” depending on the language). You are redirected to Chariow to authorize access.' },
          { fr: 'Connectez-vous à Chariow si nécessaire, examinez l’autorisation demandée et confirmez-la sur Chariow. Au retour dans Vendeo, attendez que la boutique et son catalogue soient chargés.', en: 'Sign in to Chariow if needed, review the requested authorization, and approve it on Chariow. Back in Vendeo, wait for the store and its catalog to load.' },
          { fr: 'Si le tableau de bord signale une connexion expirée, révoquée ou en échec, réautorisez l’accès avant de vous fier aux données.', en: 'If the dashboard reports an expired, revoked, or failed connection, reauthorize access before relying on its data.' },
        ],
      },
      {
        id: 'create-account-and-password',
        title: { fr: 'Créer un compte, confirmer l’adresse et réinitialiser le mot de passe', en: 'Create an account, confirm your email, and reset your password' },
        paragraphs: [
          { fr: 'Sur /register, saisissez votre nom, votre adresse e-mail et un mot de passe d’au moins 8 caractères, cochez l’acceptation des conditions et de la politique de confidentialité, puis cliquez sur « Créer mon espace » (en anglais : « Create my space »). Vendeo demande la confirmation de l’adresse e-mail; ouvrez le message reçu et suivez son lien pour terminer la confirmation. Si le message n’arrive pas, vérifiez les courriers indésirables et que l’adresse saisie est correcte.', en: 'At /register, enter your name, email address, and a password of at least 8 characters, accept the terms and privacy policy, then click “Create my space.” Vendeo asks you to confirm your email address; open the message and follow its link to finish confirmation. If it does not arrive, check spam and make sure the address is correct.' },
          { fr: 'Pour vous connecter, utilisez votre adresse et votre mot de passe sur /login. Le formulaire propose « Mot de passe oublié ? » (anglais : “Forgot password?”) : saisissez l’adresse du compte, cliquez sur « Envoyer le lien » / “Send reset link”, puis ouvrez le message et suivez le lien pour choisir un nouveau mot de passe. L’inscription, la connexion et la réinitialisation se font par e-mail et mot de passe; aucun bouton de connexion OAuth n’est présenté sur ces formulaires.', en: 'To sign in, use your email and password at /login. The form offers “Forgot password?”: enter the account email, click “Send reset link,” then open the message and follow the link to choose a new password. Registration, sign-in, and reset use email and password; these forms do not present an OAuth sign-in button.' },
        ],
        steps: [
          { fr: 'Inscription : nom, e-mail, mot de passe (8 caractères minimum), consentement, puis « Créer mon espace ».', en: 'Sign-up: name, email, password (minimum 8 characters), consent, then “Create my space.”' },
          { fr: 'Confirmation : ouvrez le lien envoyé à votre adresse e-mail; après confirmation, connectez-vous avec e-mail et mot de passe.', en: 'Confirmation: open the link sent to your email; after confirmation, sign in with email and password.' },
          { fr: 'Mot de passe oublié : depuis /login, ouvrez « Mot de passe oublié ? », demandez le lien, puis suivez-le pour en définir un nouveau.', en: 'Forgot password: from /login, choose “Forgot password?”, request the link, then follow it to set a new password.' },
        ],
      },
      {
        id: 'account-settings',
        title: { fr: 'Compte, préférences et abonnement', en: 'Account, preferences, and subscription' },
        paragraphs: [
          { fr: 'Les espaces Abonnement et Paramètres sont distincts des réglages des campagnes. La configuration de plan sert notamment à déterminer le nombre de boutiques autorisées; les capacités disponibles doivent être vérifiées dans votre compte et ne sont pas déduites d’une page marketing.', en: 'Subscription and Settings are separate from campaign settings. Plan configuration determines, among other things, the allowed store count; check the capabilities shown in your account rather than inferring them from marketing copy.' },
          { fr: 'Le budget média d’une campagne est débité par la plateforme publicitaire sur le compte sélectionné, et non par Vendeo. Les frais de l’abonnement Vendeo et les crédits éventuels du Studio sont distincts de cette dépense publicitaire (voir « Budget, paiement et erreurs »).', en: 'The selected ad platform charges the media budget to the selected ad account, not Vendeo. Vendeo subscription fees and any Studio credits are separate from this ad spend (see “Budget, payment, and errors”).' },
        ],
        steps: [
          { fr: 'Ouvrez Abonnement pour consulter les informations d’offre affichées à votre compte.', en: 'Open Subscription to review the plan information shown for your account.' },
          { fr: 'Ouvrez Paramètres pour les préférences disponibles; ne confondez pas ces paramètres avec les réglages de ciblage ou de budget d’une campagne.', en: 'Open Settings for available preferences; do not confuse them with campaign targeting or budget settings.' },
        ],
      },
    ],
  },
  {
    id: 'stores-products',
    group: 'sell',
    title: { fr: 'Boutiques, produits et liens', en: 'Stores, products, and links' },
    summary: {
      fr: 'Sélectionnez une boutique Chariow connectée, vérifiez ses produits et choisissez l’URL réellement utilisée pour une campagne.',
      en: 'Select a connected Chariow store, review its products, and choose the URL actually used for a campaign.',
    },
    articles: [
      {
        id: 'storefront-data',
        title: { fr: 'Boutiques et vitrine', en: 'Stores and storefronts' },
        paragraphs: [
          { fr: 'Mes boutiques et le sélecteur de boutique servent à choisir le contexte de travail. Vendeo charge les données de la boutique depuis Chariow; utilisez les informations lorsque la boutique apparaît comme connectée. Une connexion perdue peut empêcher le chargement ou rendre les chiffres incomplets.', en: 'My stores and the store selector set the working context. Vendeo loads store data from Chariow; use the information when the store is shown as connected. A lost connection can prevent loading or leave figures incomplete.' },
          { fr: 'Vous pouvez demander une vitrine publique personnalisée à Vendeo AI dans l’espace Vendeo AI : décrivez la boutique, le nom à afficher, les produits à présenter, leur ordre, le thème clair ou sombre, la couleur, le style de titre et l’accroche. L’assistant récapitule le résultat et attend votre validation avant de la publier. La vitrine utilise le catalogue d’une boutique Chariow active; ses boutons d’achat renvoient vers les pages de paiement Chariow. Il ne s’agit pas d’un éditeur de thème libre ni d’une boutique indépendante avec son propre paiement.', en: 'You can ask Vendeo AI to create a public storefront: describe the store, display name, products and their order, light or dark theme, color, title style, and tagline. The assistant summarizes the result and waits for your confirmation before publishing. The storefront uses an active Chariow store catalog; its buy buttons lead to Chariow checkout pages. It is not a free-form theme editor or an independent shop with its own checkout.' },
        ],
        steps: [
          { fr: 'Ouvrez Mes boutiques et sélectionnez la boutique Chariow souhaitée.', en: 'Open My stores and select the desired Chariow store.' },
          { fr: 'Vérifiez son état de connexion et le nom de boutique avant d’utiliser les données ou de créer une campagne.', en: 'Check its connection state and store name before using its data or creating a campaign.' },
          { fr: 'Pour créer ou actualiser une vitrine, ouvrez Vendeo AI et demandez clairement « crée une vitrine » ou « create a storefront ». Précisez quelle boutique utiliser si vous en avez plusieurs; l’assistant peut demander des précisions sur les produits et le style. Joignez une image dans la conversation si vous souhaitez l’utiliser comme logo. Après le récapitulatif, répondez explicitement que vous validez. Le lien public s’affiche une fois la création terminée; vous pouvez ensuite demander une mise à jour dans Vendeo AI.', en: 'To create or update a storefront, open Vendeo AI and ask “create a storefront.” Specify which store to use if you have more than one; the assistant may ask about products and styling. Attach an image in the conversation if you want it used as the logo. After reviewing the summary, explicitly confirm. The public link is shown when creation finishes; you can then request an update in Vendeo AI.' },
        ],
      },
      {
        id: 'products-and-destination',
        title: { fr: 'Produits et destination publicitaire', en: 'Products and ad destination' },
        paragraphs: [
          { fr: 'Le parcours de création de campagne associe un produit Chariow à la campagne et dispose d’un champ de destination/URL produit. Vérifiez que le produit, le prix et la page de destination correspondent à l’offre promue. Vendeo ne peut pas garantir le contenu, le stock, le paiement ou le fonctionnement de la page hébergée par Chariow.', en: 'The campaign creation flow associates a Chariow product with the campaign and has a product destination/URL field. Check that the product, price, and landing page match the offer being promoted. Vendeo cannot guarantee the content, availability, checkout, or operation of a page hosted by Chariow.' },
          { fr: 'Une URL de produit et des métadonnées de campagne sur une commande sont des informations distinctes d’une attribution publicitaire confirmée par Meta. Leur présence ne prouve ni qu’une publicité a généré une vente ni qu’un visiteur précis a acheté.', en: 'A product URL and campaign metadata on an order are distinct from attribution confirmed by Meta. Their presence proves neither that an ad generated a sale nor that a particular visitor purchased.' },
        ],
        steps: [
          { fr: 'Dans le parcours de campagne, choisissez la boutique puis le produit concerné.', en: 'In the campaign flow, choose the store and then the relevant product.' },
          { fr: 'Contrôlez l’URL de destination et ouvrez-la séparément pour confirmer qu’elle mène à la bonne page.', en: 'Check the destination URL and open it separately to confirm it leads to the intended page.' },
          { fr: 'Ne partagez pas de lien de suivi comme s’il remplaçait la page de vente du produit.', en: 'Do not use a tracking link as though it replaced the product sales page.' },
        ],
      },
      {
        id: 'store-connection-errors',
        title: { fr: 'Résoudre les problèmes de boutique', en: 'Resolve store connection problems' },
        paragraphs: [
          { fr: 'Un test de connexion Chariow peut échouer si l’autorisation ne permet plus d’obtenir l’instantané. Le serveur retourne alors une erreur et conseille de réautoriser l’accès. Ce diagnostic ne permet pas de conclure que les données de ventes ont été supprimées.', en: 'A Chariow connection test can fail when authorization no longer permits retrieval of the snapshot. The server then returns an error and advises reauthorizing access. This diagnosis does not imply that sales data has been deleted.' },
        ],
        steps: [
          { fr: 'Relancez le test ou le parcours de connexion depuis Mes boutiques.', en: 'Retry the test or connection flow from My stores.' },
          { fr: 'Réautorisez Vendeo dans Chariow si l’accès a expiré ou a été révoqué.', en: 'Reauthorize Vendeo in Chariow if access expired or was revoked.' },
          { fr: 'Si le problème persiste, relevez le message d’erreur sans envoyer de jeton, cookie ou secret dans une demande d’assistance.', en: 'If the problem persists, note the error message without sending a token, cookie, or secret in a support request.' },
        ],
      },
    ],
  },
  {
    id: 'ad-accounts',
    group: 'sell',
    title: { fr: 'Comptes publicitaires Meta, TikTok et Pinterest', en: 'Meta, TikTok, and Pinterest ad accounts' },
    summary: {
      fr: 'Connectez et choisissez les comptes disponibles; les états et rapports varient réellement selon le réseau.',
      en: 'Connect and select available accounts; statuses and reporting genuinely differ by network.',
    },
    articles: [
      {
        id: 'connect-ad-accounts',
        title: { fr: 'Connexion et sélection des comptes', en: 'Connect and select accounts' },
        paragraphs: [
          { fr: 'L’espace Comptes publicitaires et les panneaux Meta, TikTok Ads et Pinterest Ads permettent de consulter les comptes intégrés et de les sélectionner dans le parcours publicitaire. La présence d’un logo ou d’un choix de réseau ne prouve pas qu’un compte est connecté : utilisez les états et messages réellement affichés.', en: 'The Ad accounts area and the Meta, TikTok Ads, and Pinterest Ads panels expose integrated accounts and allow selection in the advertising flow. A platform logo or network choice does not prove an account is connected: rely on the actual states and messages shown.' },
          { fr: 'Les rapports TikTok Ads et Pinterest Ads apparaissent lorsque le compte publicitaire correspondant est connecté et que les données sont accessibles. Si aucun compte n’est relié, ou si la plateforme ne renvoie pas de données, le rapport ne peut pas être chargé; cela ne signifie pas que les dépenses ou résultats sont nuls.', en: 'TikTok Ads and Pinterest Ads reports are available when the relevant ad account is connected and data can be retrieved. If no account is linked, or the platform returns no data, the report cannot load; this does not mean spend or results are zero.' },
        ],
        steps: [
          { fr: 'Ouvrez Comptes publicitaires et vérifiez le réseau et le compte listés.', en: 'Open Ad accounts and check the listed network and account.' },
          { fr: 'Utilisez le parcours d’autorisation de la plateforme si aucun compte actif n’est proposé.', en: 'Use the platform authorization flow if no active account is offered.' },
          { fr: 'Dans une campagne, sélectionnez le compte adéquat; ne supposez pas qu’un réseau est connecté parce qu’il est sélectionnable dans l’interface.', en: 'In a campaign, select the appropriate account; do not assume a network is connected merely because it is selectable in the interface.' },
        ],
      },
      {
        id: 'platform-status-differences',
        title: { fr: 'États TikTok et Pinterest : ce qui est confirmé', en: 'TikTok and Pinterest states: what is verified' },
        paragraphs: [
          { fr: 'Pour Meta et TikTok, Vendeo vérifie le statut communiqué par le réseau. Un statut actif confirmé indique que le réseau signale la campagne comme active; un statut inactif ou en pause signifie qu’elle ne diffuse pas selon ce signal. Si le statut est « inconnu » ou n’a pas pu être vérifié, ne le prenez ni pour une confirmation de diffusion ni pour une preuve de pause : contrôlez la campagne dans le gestionnaire publicitaire du réseau.', en: 'For Meta and TikTok, Vendeo checks the status reported by the network. A confirmed active status means the network reports the campaign as active; an inactive or paused status means it is not delivering according to that signal. If the status is “unknown” or could not be checked, treat neither delivery nor a pause as confirmed: check the campaign in the network’s ads manager.' },
          { fr: 'Les rapports Pinterest peuvent afficher des métriques, mais Vendeo ne confirme pas l’état de diffusion Pinterest dans le contrôle du Pilotage auto. Pour savoir si la campagne est active ou en pause, vérifiez-la dans Pinterest Ads Manager; ne déduisez pas son état à partir des métriques seules.', en: 'Pinterest reports may show metrics, but Vendeo does not confirm Pinterest delivery status in the Autopilot check. To find out whether a campaign is active or paused, check it in Pinterest Ads Manager; do not infer status from metrics alone.' },
        ],
        steps: [
          { fr: 'Pour TikTok, vérifiez le compte, l’état de l’objet et les informations de diffusion; un état local ne remplace pas la réponse live.', en: 'For TikTok, check the account, object status, and delivery information; local status does not replace the live response.' },
          { fr: 'Pour Pinterest, consultez Pinterest Ads pour confirmer l’état effectif; Vendeo peut afficher des métriques sans confirmer le statut actif.', en: 'For Pinterest, check Pinterest Ads to confirm effective status; Vendeo may show metrics without confirming active status.' },
          { fr: 'Si le statut est inconnu ou non vérifiable, traitez-le comme non confirmé et évitez d’automatiser une décision de diffusion sur cette seule base.', en: 'If status is unknown or unverifiable, treat it as unconfirmed and do not automate a delivery decision based on it alone.' },
        ],
      },
      {
        id: 'pixels-and-tags',
        title: { fr: 'Pixels et balises de conversion', en: 'Pixels and conversion tags' },
        paragraphs: [
          { fr: 'Pour mesurer des achats avec une campagne Meta orientée ventes, configurez le pixel Meta sur votre boutique Chariow et vérifiez qu’il reçoit les événements attendus. Si le pixel manque, l’assistant de lancement peut proposer un objectif Trafic plutôt que Ventes; vérifiez l’objectif affiché avant de confirmer.', en: 'To measure purchases with a Meta sales campaign, configure the Meta pixel on your Chariow store and check that it receives the expected events. If the pixel is missing, the launch flow may offer Traffic instead of Sales; check the displayed objective before confirming.' },
          { fr: 'Pour Pinterest, l’objectif Ventes nécessite la Pinterest Tag; si elle est absente, la campagne peut être refusée. Vendeo peut proposer l’objectif Trafic à la place : choisissez cette option uniquement si elle vous convient. Les exigences de suivi diffèrent selon le réseau; ne supposez pas que le pixel Meta ou la Pinterest Tag est automatiquement configuré sur TikTok.', en: 'For Pinterest, the Sales objective requires the Pinterest Tag; without it, the campaign may be rejected. Vendeo may offer Traffic instead: choose it only if it suits your goal. Tracking requirements differ by network; do not assume the Meta pixel or Pinterest Tag is automatically configured for TikTok.' },
        ],
        steps: [
          { fr: 'Avant une campagne orientée ventes, vérifiez pixel Meta ou Pinterest Tag dans la boutique et le compte correspondant.', en: 'Before a sales-oriented campaign, check the Meta pixel or Pinterest Tag on the store and corresponding account.' },
          { fr: 'Si Pinterest signale une balise manquante, installez-la puis réessayez; choisissez le repli Trafic seulement si vous acceptez cette modification d’objectif.', en: 'If Pinterest reports a missing tag, install it and retry; choose Traffic fallback only if you accept that objective change.' },
        ],
      },
    ],
  },
  {
    id: 'launch-campaigns',
    group: 'create',
    title: { fr: 'Créer, lancer et corriger une campagne', en: 'Create, launch, and correct a campaign' },
    summary: {
      fr: 'Préparez le contenu et le budget, comprenez qui facture la publicité, et traitez les erreurs sans relancer à l’aveugle.',
      en: 'Prepare creative and budget, understand who bills for advertising, and handle errors without blindly retrying.',
    },
    articles: [
      {
        id: 'campaign-setup',
        title: { fr: 'Préparer la campagne', en: 'Prepare a campaign' },
        paragraphs: [
          { fr: 'Dans Pub, choisissez le produit et le réseau, puis le compte publicitaire. Renseignez les détails et paramètres affichés pour ce réseau, ajoutez ou choisissez le contenu publicitaire et vérifiez l’aperçu. Les champs varient entre réseaux : relisez le lien de destination, le texte, le média, le budget et le compte avant de lancer.', en: 'In Ads, choose a product and network, then an ad account. Enter the details and settings shown for that network, add or select the ad creative, and review the preview. Fields vary by network: check the destination link, copy, media, budget, and account before launch.' },
          { fr: 'Relisez la destination, le texte, le média et le compte avant de confirmer. Une publicité envoyée à une plateforme peut être soumise à sa validation et à ses règles; Vendeo ne garantit ni approbation ni diffusion.', en: 'Review destination, copy, media, and account before confirming. An ad submitted to a platform may be subject to its review and policies; Vendeo does not guarantee approval or delivery.' },
        ],
        steps: [
          { fr: 'Dans Pub, démarrez la création de campagne et choisissez le produit et le réseau.', en: 'In Ads, start campaign creation and choose the product and network.' },
          { fr: 'Renseignez puis vérifiez les éléments et paramètres proposés pour ce réseau.', en: 'Enter and review the details and settings offered for that network.' },
          { fr: 'Examinez l’étape de paiement/lancement et ne confirmez qu’après avoir compris le budget.', en: 'Review the payment/launch step and confirm only after understanding the budget.' },
        ],
      },
      {
        id: 'budget-and-billing',
        title: { fr: 'Budget, paiement et erreurs', en: 'Budget, payment, and errors' },
        paragraphs: [
          { fr: 'Au lancement, le budget média est facturé directement par la plateforme publicitaire au compte publicitaire sélectionné; Vendeo ne collecte pas ce budget. La devise et les moyens de paiement dépendent du compte et de la plateforme. Vérifiez dans la plateforme les plafonds, taxes, autorisations et conséquences d’un budget quotidien.', en: 'At launch, the selected ad platform charges the media budget directly to the selected ad account; Vendeo does not collect that budget. Currency and payment methods depend on the account and platform. Check limits, taxes, authorization, and daily-budget implications with the platform.' },
          { fr: 'Après une erreur, une campagne peut rester en brouillon, en pause ou nécessiter une correction. Lorsque l’assistant propose une reprise, vérifiez les changements demandés; pour Pinterest, confirmez explicitement si vous acceptez de remplacer l’objectif Ventes par Trafic. Avant de réessayer, vérifiez le statut dans Vendeo et dans la plateforme pour éviter de créer un doublon.', en: 'After an error, a campaign may remain in draft, paused, or need correction. If the flow offers a resume action, review the requested changes; for Pinterest, explicitly confirm if you accept replacing the Sales objective with Traffic. Before trying again, check status in Vendeo and on the platform to avoid creating a duplicate.' },
          { fr: 'Ne transmettez jamais vos mots de passe, jetons d’accès ou informations de paiement dans une demande d’assistance. Utilisez les parcours d’autorisation de chaque plateforme et révoquez les accès dont vous n’avez plus besoin.', en: 'Never send passwords, access tokens, or payment details in a support request. Use each platform’s authorization flow and revoke access you no longer need.' },
        ],
        steps: [
          { fr: 'Confirmez le budget dans la devise affichée et vérifiez que le compte publicitaire a un moyen de paiement valide.', en: 'Confirm the budget in the displayed currency and check that the ad account has a valid payment method.' },
          { fr: 'Après une erreur, lisez le message affiché et corrigez le point signalé (compte, pixel/balise, média ou paiement) avant de réessayer.', en: 'After an error, read the message shown and fix the issue it identifies (account, pixel/tag, creative, or payment) before retrying.' },
          { fr: 'Vérifiez qu’aucune campagne identique n’a déjà été créée ou activée sur la plateforme.', en: 'Check that an identical campaign has not already been created or enabled on the platform.' },
        ],
      },
      {
        id: 'campaign-edit-pause',
        title: { fr: 'Suivre, modifier et mettre en pause', en: 'Monitor, edit, and pause' },
        paragraphs: [
          { fr: 'Dans « Mes campagnes », consultez les campagnes enregistrées et leur statut. Selon son état et le réseau, une campagne peut proposer de reprendre/lancer, corriger ou modifier certains réglages; les options ne sont pas identiques pour chaque campagne. Si Vendeo ne peut pas confirmer l’état reçu du réseau, considérez la diffusion comme non confirmée et vérifiez-la dans le gestionnaire publicitaire.', en: '“My campaigns” lists saved campaigns and their status. Depending on the campaign and network, available actions may include resume/launch, fix, or edit some settings; options differ by campaign. If Vendeo cannot confirm the status returned by the network, treat delivery as unconfirmed and check the ads manager.' },
          { fr: 'Pour modifier une campagne, ouvrez-la dans « Mes campagnes » et utilisez « Modifier » si cette action est proposée; les changements modifiables dépendent du réseau et du statut. Pour arrêter la diffusion, utilisez « Mettre en pause » lorsqu’il est disponible, puis actualisez le statut et contrôlez la campagne dans le gestionnaire du réseau. La plateforme peut mettre un délai à appliquer l’action.', en: 'To edit a campaign, open it in “My campaigns” and use “Edit” if offered; editable fields depend on the network and status. To stop delivery, use “Pause” when available, then refresh the status and verify the campaign in the network’s ads manager. The platform may take time to apply the action.' },
        ],
        steps: [
          { fr: 'Dans Pub (Ads), ouvrez « Mes campagnes » et sélectionnez la campagne pour consulter son statut, ses résultats disponibles ou un message d’erreur.', en: 'In Ads, open “My campaigns” and select a campaign to review its status, available results, or any error message.' },
          { fr: 'Utilisez l’action de pause, reprise ou correction disponible pour son état; évitez de relancer un élément déjà actif.', en: 'Use the pause, resume, or correction action available for its state; do not relaunch an already active item.' },
          { fr: 'Contrôlez l’état effectif et les dépenses dans l’interface de la plateforme publicitaire.', en: 'Check effective status and spend in the ad platform interface.' },
        ],
      },
    ],
  },
  {
    id: 'measurement-attribution',
    group: 'manage',
    title: { fr: 'Suivi, attribution et rapports', en: 'Tracking, attribution, and reports' },
    summary: {
      fr: 'Interprétez correctement les métriques agrégées, distinguez les sources de données et identifiez les limites de chaque réseau.',
      en: 'Interpret aggregate metrics correctly, distinguish data sources, and understand each network’s limitations.',
    },
    articles: [
      {
        id: 'attribution-vs-identities',
        title: { fr: 'Attribution Meta et confidentialité', en: 'Meta attribution and privacy' },
        paragraphs: [
          { fr: 'Les conversions rapportées par Meta sont des mesures agrégées produites selon les règles d’attribution, les fenêtres, les signaux disponibles et les mécanismes de confidentialité de Meta. Elles ne révèlent pas l’identité de chaque personne ayant vu une publicité ni ne prouvent quel acheteur individuel correspond à une commande Chariow.', en: 'Conversions reported by Meta are aggregate measurements produced under Meta’s attribution rules, windows, available signals, and privacy mechanisms. They do not reveal the identity of each person who saw an ad or prove which individual buyer corresponds to a Chariow order.' },
          { fr: 'Dans l’espace Attribution, associez chaque campagne au produit Chariow concerné en le choisissant dans la liste; cette association sert notamment aux comparaisons par produit. Les conversions indiquées par Meta sont des résultats agrégés calculés par Meta selon sa fenêtre et ses règles d’attribution. Les commandes Chariow sont des achats enregistrés dans la boutique; seules certaines peuvent contenir des métadonnées de campagne. L’association campagne-produit dans Vendeo ne prouve pas à elle seule qu’une publicité a généré une commande et ne relie pas l’identité d’un acheteur à une conversion Meta. Les rapports peuvent être incomplets, retardés ou différents entre plateformes.', en: 'In Attribution, link each campaign to the relevant Chariow product by selecting it from the list; this association supports product-level comparisons. Conversions shown by Meta are aggregate results calculated under Meta’s own attribution window and rules. Chariow orders are purchases recorded in the store; only some may contain campaign metadata. Linking a campaign to a product in Vendeo does not by itself prove that an ad generated an order, nor does it connect a buyer’s identity to a Meta conversion. Reports may be incomplete, delayed, or differ across platforms.' },
        ],
        steps: [
          { fr: 'Ouvrez l’espace Attribution, choisissez un produit dans la liste à côté de la campagne, puis enregistrez l’association. Pour dissocier un produit, utilisez l’action de retrait affichée sur cette ligne.', en: 'Open Attribution, choose a product from the list next to the campaign, then save the association. To unlink a product, use the remove action shown on that row.' },
          { fr: 'Comparez séparément les conversions agrégées de la plateforme, les commandes Chariow et les métadonnées disponibles.', en: 'Compare platform aggregate conversions, Chariow orders, and available metadata separately.' },
          { fr: 'N’essayez pas de déduire l’identité d’un acheteur à partir d’une métrique ou d’un lien de campagne.', en: 'Do not try to infer a buyer’s identity from a metric or campaign link.' },
        ],
      },
      {
        id: 'platform-reports',
        title: { fr: 'Rapports par réseau', en: 'Reports by network' },
        paragraphs: [
          { fr: 'Les rapports TikTok Ads et Pinterest Ads affichent, lorsque les données sont accessibles, des indicateurs tels que dépenses, impressions, clics, conversions, coût par acquisition (CPA) et taux de clics (CTR). La période par défaut est de 30 jours; vérifiez les dates sélectionnées. Les données Meta sont consultables dans ses rapports de performance et d’historique. Les chiffres peuvent être incomplets ou retardés et ne sont pas garantis en temps réel.', en: 'TikTok Ads and Pinterest Ads reports show metrics such as spend, impressions, clicks, conversions, cost per acquisition (CPA), and click-through rate (CTR) when account data is available. The default period is 30 days; check the selected dates. Meta data is available in its performance and history reports. Figures may be incomplete or delayed and are not guaranteed in real time.' },
          { fr: 'Rapports est un espace secondaire du tableau de bord et peut présenter des données de campagne; les indicateurs sont dépendants de la connexion et des données disponibles. Une absence de rapport n’est pas la preuve d’une dépense nulle.', en: 'Reports is a secondary dashboard area and may present campaign data; metrics depend on connection and data availability. A missing report is not proof of zero spend.' },
        ],
        steps: [
          { fr: 'Ouvrez Rapports ou le panneau du réseau concerné et vérifiez le compte et la période.', en: 'Open Reports or the relevant network panel and check the account and date range.' },
          { fr: 'Comparez les chiffres à ceux du gestionnaire publicitaire de la plateforme, avec devise et plage de dates identiques.', en: 'Compare figures with the platform’s ads manager using the same currency and date range.' },
          { fr: 'Traitez les erreurs d’accès, données absentes ou valeurs inconnues comme une mesure indisponible, pas comme zéro.', en: 'Treat access errors, missing data, or unknown values as unavailable measurements, not zero.' },
        ],
      },
      {
        id: 'tracking-quality',
        title: { fr: 'Qualité du suivi et limites des métriques', en: 'Tracking quality and metric limits' },
        paragraphs: [
          { fr: 'L’application expose des diagnostics de suivi et des événements de campagne/vente, mais la qualité dépend des pixels, balises, consentements, intégrations et règles de la plateforme. Les navigateurs, bloqueurs, délais et modèles d’attribution peuvent réduire ou décaler la mesure.', en: 'The app exposes tracking diagnostics and campaign/sale events, but quality depends on pixels, tags, consent, integrations, and platform rules. Browsers, blockers, delays, and attribution models can reduce or shift measurement.' },
          { fr: 'Un événement reçu n’identifie pas nécessairement une personne et ne prouve pas seul une vente nette. Conservez une distinction entre événement de suivi, rapport agrégé de la plateforme, commande confirmée par Chariow et calcul de rentabilité.', en: 'A received event does not necessarily identify a person and alone does not prove a net sale. Keep tracking events, aggregate platform reports, confirmed Chariow orders, and profitability calculations distinct.' },
        ],
        steps: [
          { fr: 'Ouvrez les diagnostics de suivi si disponibles et corrigez les balises ou connexions signalées.', en: 'Open tracking diagnostics if available and fix reported tags or connections.' },
          { fr: 'Vérifiez les rapports sur la plateforme et les commandes dans Chariow; notez les écarts de période et de devise.', en: 'Check platform reports and Chariow orders; note period and currency differences.' },
        ],
      },
    ],
  },
  {
    id: 'profitability',
    group: 'manage',
    title: { fr: 'Bénéfices nets et rentabilité', en: 'Net profit and profitability' },
    summary: {
      fr: 'Lisez les estimations avec prudence : revenus nets et coûts connus moins les seules dépenses explicitement liées au produit.',
      en: 'Read estimates carefully: net revenue and known costs less only spend explicitly linked to the product.',
    },
    articles: [
      {
        id: 'profit-calculation',
        title: { fr: 'Comment Vendeo estime le bénéfice', en: 'How Vendeo estimates profit' },
        paragraphs: [
          { fr: 'Le panneau Bénéfices nets calcule une estimation indicative à partir des ventes Chariow nettes après frais Chariow, des coûts disponibles et des dépenses de campagnes explicitement associées au produit. Formule conceptuelle : bénéfice estimé = revenu net après frais − coûts existants − dépenses publicitaires explicitement allouées. Les frais et coûts ne sont pas supposés : si une valeur manque, le résultat peut être incomplet ou indisponible.', en: 'The Net profit panel provides an indicative estimate based on Chariow sales net of Chariow fees, available costs, and campaign spend explicitly linked to the product. Conceptual formula: estimated profit = net revenue after fees − existing costs − explicitly allocated ad spend. Fees and costs are not assumed: if a value is missing, the result may be incomplete or unavailable.' },
          { fr: 'Aucune valeur universelle de frais Chariow, coût produit ou marge n’est affirmée ici : celles-ci dépendent des données accessibles et de votre activité. Le panneau précise que les devises restent séparées, sans conversion automatique. Vérifiez la période, la devise et les hypothèses avant de prendre une décision financière.', en: 'No universal Chariow fee, product cost, or margin value is asserted here: these depend on available data and your business. The panel specifies that currencies remain separate, with no automatic conversion. Check period, currency, and assumptions before making a financial decision.' },
        ],
        steps: [
          { fr: 'Ouvrez Bénéfices nets et sélectionnez la période disponible.', en: 'Open Net profit and select the available period.' },
          { fr: 'Vérifiez les revenus nets, frais/coûts présentés, devises et état des données manquantes.', en: 'Review net revenue, displayed fees/costs, currencies, and missing-data status.' },
          { fr: 'N’interprétez l’estimation comme une comptabilité officielle, un bénéfice garanti ou un conseil fiscal.', en: 'Do not treat the estimate as official accounting, guaranteed profit, or tax advice.' },
        ],
      },
      {
        id: 'explicit-campaign-spend',
        title: { fr: 'Dépenses : association explicite seulement', en: 'Spend: explicit association only' },
        paragraphs: [
          { fr: 'Le calcul par produit ne répartit pas automatiquement l’ensemble des dépenses du compte publicitaire. Il déduit les dépenses des campagnes explicitement liées au produit; les dépenses observées mais non allouées peuvent être affichées séparément. Ne répartissez pas une dépense entre produits sans preuve de lien dans les données.', en: 'Product-level calculation does not automatically allocate all ad-account spend. It deducts spend from campaigns explicitly linked to the product; observed but unallocated spend may be shown separately. Do not distribute spend across products without an explicit link in the data.' },
          { fr: 'Les métadonnées de campagne individuelles sur une commande ne sont pas la même chose que les dépenses liées au produit ni que l’attribution Meta. Le panneau peut signaler les commandes sans ces métadonnées tout en conservant des dépenses de campagne liées au produit.', en: 'Individual campaign metadata on an order is not the same as product-linked campaign spend or Meta attribution. The panel may report orders without that metadata while still having product-linked campaign spend.' },
        ],
        steps: [
          { fr: 'Associez les campagnes au bon produit via les contrôles d’attribution/lien disponibles.', en: 'Link campaigns to the correct product using the available attribution/link controls.' },
          { fr: 'Dans Bénéfices nets, distinguez dépenses explicitement liées, dépenses observées non réparties et données indisponibles.', en: 'In Net profit, distinguish explicitly linked spend, observed unallocated spend, and unavailable data.' },
        ],
      },
      {
        id: 'profit-caveats',
        title: { fr: 'Périodes, frais et incertitudes', en: 'Periods, fees, and uncertainty' },
        paragraphs: [
          { fr: 'Les ventes, dépenses publicitaires, frais et coûts peuvent provenir de systèmes différents et ne pas couvrir la même période. Une estimation qui affiche une valeur indisponible, des coûts incomplets ou plusieurs devises ne doit pas être interprétée comme un total final comparable.', en: 'Sales, ad spend, fees, and costs can come from different systems and cover different periods. An estimate showing unavailable values, incomplete costs, or multiple currencies should not be treated as a final comparable total.' },
          { fr: 'Le calcul est indicatif. Il ne remplace pas le rapprochement des paiements, remboursements, taxes, frais de change ou coûts non enregistrés dans Vendeo.', en: 'The calculation is indicative. It does not replace reconciliation of payouts, refunds, taxes, foreign-exchange fees, or costs not recorded in Vendeo.' },
        ],
        steps: [
          { fr: 'Alignez les périodes et devises des ventes et des dépenses avant toute comparaison.', en: 'Align sales and spend periods and currencies before comparing.' },
          { fr: 'Complétez les coûts manquants dans la source qui les gère puis rechargez l’estimation.', en: 'Complete missing costs in the source that manages them, then refresh the estimate.' },
          { fr: 'Rapprochez les résultats avec vos relevés Chariow, plateformes et comptabilité.', en: 'Reconcile results with Chariow, platform, and accounting statements.' },
        ],
      },
    ],
  },
  {
    id: 'market-radar-autopilot',
    group: 'manage',
    title: { fr: 'Radar marché et Pilotage auto', en: 'Market Radar and Autopilot' },
    summary: {
      fr: 'Utilisez les suggestions de marché comme aide à la recherche; le Pilotage auto applique des garde-fous et dépend de statuts réellement vérifiables.',
      en: 'Use market suggestions as research aids; Autopilot applies safeguards and depends on statuses that can actually be verified.',
    },
    articles: [
      {
        id: 'market-radar',
        title: { fr: 'Explorer le Radar marché', en: 'Explore Market Radar' },
        paragraphs: [
          { fr: 'Radar marché est un espace du tableau de bord qui présente des indicateurs de marché lorsque les données sont disponibles. Utilisez-les comme pistes de recherche, et non comme garantie de demande, de ventes futures, d’exhaustivité des tendances ou de disponibilité d’un produit.', en: 'Market Radar is a dashboard area that presents market indicators when data is available. Use them as research leads, not as a guarantee of demand, future sales, exhaustive trends, or product availability.' },
          { fr: 'Les résultats peuvent varier selon la période et les données chargées. Vérifiez les informations importantes auprès de sources indépendantes; Radar marché ne prédit pas avec certitude les performances futures.', en: 'Results may vary with the selected period and available data. Verify important findings with independent sources; Market Radar cannot predict future performance with certainty.' },
        ],
        steps: [
          { fr: 'Ouvrez Radar marché dans la navigation.', en: 'Open Market Radar from navigation.' },
          { fr: 'Consultez les éléments retournés et leurs indicateurs; vérifiez indépendamment toute hypothèse importante.', en: 'Review returned items and indicators; independently verify any important assumption.' },
          { fr: 'Si le chargement échoue ou qu’aucun résultat n’est disponible, ne l’interprétez pas comme une demande nulle.', en: 'If loading fails or no results are available, do not interpret that as zero demand.' },
        ],
      },
      {
        id: 'autopilot-activation',
        title: { fr: 'Activer et vérifier le Pilotage auto', en: 'Activate and verify Autopilot' },
        paragraphs: [
          { fr: 'Pilotage auto affiche des rapports de campagnes et un réglage de limite budgétaire pour les campagnes compatibles. Avant d’activer le contrôle, Vendeo vérifie le statut de diffusion : si la campagne n’est pas confirmée active, l’activation ou le réglage peut être bloqué. Le statut Pinterest reste non confirmé par ce contrôle, même lorsque des métriques Pinterest sont visibles.', en: 'Autopilot shows campaign reports and a budget-limit setting for compatible campaigns. Before enabling the control, Vendeo checks delivery status: if the campaign is not confirmed active, enabling or changing the limit may be blocked. Pinterest status remains unconfirmed by this check even when Pinterest metrics are visible.' },
          { fr: 'Les commandes de Pilotage auto ne sont proposées que pour les campagnes et comptes compatibles. Une action peut échouer si l’accès à la plateforme a expiré, si le statut ne peut pas être vérifié ou si le réseau refuse la modification. Vérifiez toujours le nouveau statut dans le gestionnaire publicitaire; l’outil ne garantit ni une diffusion ni un résultat commercial.', en: 'Autopilot controls are offered only for compatible campaigns and accounts. An action can fail if platform access has expired, status cannot be checked, or the network rejects the change. Always confirm the new status in the ads manager; the tool guarantees neither delivery nor business results.' },
        ],
        steps: [
          { fr: 'Ouvrez Pilotage auto et sélectionnez une campagne dont l’état est vérifiable.', en: 'Open Autopilot and select a campaign whose status can be verified.' },
          { fr: 'Actualisez la vérification; ne continuez pas si le statut est inconnu ou si l’action est bloquée.', en: 'Refresh the verification; do not proceed if status is unknown or the action is blocked.' },
          { fr: 'Saisissez une limite dans la devise présentée, contrôlez le montant, puis confirmez seulement si vous comprenez l’effet prévu.', en: 'Enter a limit in the displayed currency, check the amount, and confirm only if you understand the intended effect.' },
        ],
      },
      {
        id: 'autopilot-safeguards',
        title: { fr: 'Garde-fous, supervision et limites', en: 'Safeguards, supervision, and limits' },
        paragraphs: [
          { fr: 'Si le rapport indique que l’état n’est pas vérifié, utilisez « Réessayer » lorsqu’il est proposé. N’activez pas une limite sur la seule base d’un ancien statut; contrôlez la campagne dans Meta Ads Manager ou TikTok Ads Manager. La vérification réduit le risque d’agir sur une information périmée, mais ne remplace pas votre contrôle.', en: 'If a report says status is unverified, use “Retry” when offered. Do not set a limit based only on an old status; check the campaign in Meta Ads Manager or TikTok Ads Manager. Rechecking reduces the risk of acting on stale information but does not replace your own review.' },
          { fr: 'Vérifiez périodiquement les campagnes directement sur Meta, TikTok ou Pinterest. Une réponse tardive du réseau, un refus de modification, une autorisation expirée ou un statut différent peut empêcher Vendeo de confirmer une pause ou une limite.', en: 'Periodically check campaigns directly in Meta, TikTok, or Pinterest. A delayed network response, rejected change, expired authorization, or different status can prevent Vendeo from confirming a pause or limit.' },
        ],
        steps: [
          { fr: 'Après activation ou modification d’une limite, relisez le rapport et l’état vérifié.', en: 'After activation or changing a limit, review the report and verified state.' },
          { fr: 'En cas de statut inconnu, erreur ou désaccord avec la plateforme, suspendez toute décision automatique et vérifiez manuellement.', en: 'If status is unknown, an error occurs, or the platform disagrees, stop relying on automatic decisions and check manually.' },
          { fr: 'Utilisez les commandes de pause/reprise de la campagne et vérifiez leur effet dans le gestionnaire publicitaire.', en: 'Use the campaign pause/resume controls and verify their effect in the ads manager.' },
        ],
      },
    ],
  },
];
