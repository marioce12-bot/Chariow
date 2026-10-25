import type { DocSection } from './types';

export const assistantSections: DocSection[] = [
  {
    id: 'ai-assistant',
    group: 'create',
    title: { fr: 'Vendeo AI', en: 'Vendeo AI' },
    summary: {
      fr: 'Discutez avec l’assistant depuis Vendeo AI pour examiner les données de la boutique sélectionnée, préparer des idées et demander des actions. Vérifiez les informations et les étapes proposées avant toute action.',
      en: 'Talk with the assistant in Vendeo AI to review information for the selected store, explore ideas, and request actions. Check the information and proposed steps before anything is carried out.',
    },
    articles: [
      {
        id: 'start-chat-with-store-context',
        title: { fr: 'Démarrer une conversation et choisir le contexte', en: 'Start a conversation and choose its context' },
        paragraphs: [
          { fr: 'Ouvrez Vendeo AI depuis le tableau de bord. Le sélecteur de boutique du tableau de bord indique la boutique active; l’assistant utilise ce contexte pour accéder aux informations de boutique disponibles. Si vous gérez plusieurs boutiques, vérifiez la sélection avant de poser une question et changez-la dans le sélecteur si nécessaire.', en: 'Open Vendeo AI from the dashboard. The dashboard store selector shows the active store; the assistant uses that context to access available store information. If you manage more than one store, check the selection before asking a question and change it in the selector if needed.' },
          { fr: 'Saisissez votre demande dans le champ de conversation puis envoyez-la. Vous pouvez commencer une nouvelle discussion avec « Nouvelle conversation » (« New conversation ») ou retrouver les précédentes avec « Historique » (« History »).', en: 'Type your request in the conversation field and send it. Start a fresh thread with “New conversation” (« Nouvelle conversation »), or find earlier ones under “History” (« Historique »).' },
          { fr: 'Les réponses dépendent des données accessibles pour la boutique et, pour les questions publicitaires, des comptes publicitaires reliés et sélectionnés. Une donnée absente ou une connexion non disponible peut empêcher une réponse précise; indiquez ce que vous cherchez et vérifiez que la bonne boutique et les bons comptes sont configurés.', en: 'Answers depend on the data available for the store and, for advertising questions, on connected and selected ad accounts. Missing data or an unavailable connection can prevent a precise answer; say what you want to know and check that the right store and ad accounts are configured.' },
        ],
      },
      {
        id: 'sales-and-ad-analysis',
        title: { fr: 'Analyser les ventes et la publicité', en: 'Analyze sales and advertising' },
        paragraphs: [
          { fr: 'Vous pouvez demander une lecture des ventes, des résultats ou des campagnes à partir des données disponibles dans Vendeo. Précisez la boutique, la période et l’indicateur qui vous intéressent; pour une question publicitaire, nommez la plateforme ou la campagne si vous la connaissez.', en: 'You can ask for an interpretation of sales, results, or campaigns using the data available in Vendeo. Specify the store, time period, and metric you care about; for an advertising question, name the platform or campaign if you know it.' },
          { fr: 'L’assistant peut expliquer une tendance ou comparer les chiffres fournis, mais sa réponse n’est pas une garantie de résultat ni une source comptable indépendante. Les résultats peuvent être incomplets, retardés ou dépendre de l’attribution et des connexions disponibles. Vérifiez les chiffres dans les espaces Rapports, Bénéfices nets ou Pub et dans la plateforme concernée avant de prendre une décision.', en: 'The assistant can explain a trend or compare the figures provided, but its answer is not a guarantee of results or an independent accounting source. Results may be incomplete, delayed, or depend on available attribution and connections. Verify figures in Reports (« Rapports »), Net profit (« Bénéfices nets »), or Ads (« Pub »), and in the relevant platform before making a decision.' },
          { fr: 'Ne déduisez pas qu’une publicité a été lancée, modifiée ou arrêtée du seul fait que l’assistant en parle: une action doit être explicitement proposée puis confirmée lorsque l’interface le demande.', en: 'Do not infer that an ad was launched, changed, or stopped just because the assistant discussed it: an action must be explicitly offered and then confirmed when the interface asks.' },
        ],
      },
      {
        id: 'useful-requests',
        title: { fr: 'Exemples de demandes utiles', en: 'Examples of useful requests' },
        paragraphs: [
          { fr: 'Une demande précise, limitée à un objectif et accompagnée des éléments connus, facilite une réponse exploitable. Par exemple : « Résume les ventes de cette boutique sur les 30 derniers jours »; « Compare les résultats des campagnes Meta de cette période »; « Quels produits semblent contribuer le plus au revenu net disponible? »', en: 'A focused request with one goal and the details you know makes an answer easier to use. For example: “Summarize this store’s sales over the last 30 days”; “Compare the Meta campaign results for this period”; “Which products appear to contribute most to the available net revenue?”' },
          { fr: 'Pour retrouver tes créations, ouvre « Studio ». Pour consulter une recommandation et préparer une campagne, ouvre « Recommandation » : le coût de l’image apparaît avant « Appliquer », puis tu relis le brouillon et cliques sur « Lancer maintenant » seulement quand tout est correct. Ne demande pas d’inventer un lien, un chiffre ou une information produit.', en: 'To find your creations, open “Studio.” To review a recommendation and prepare a campaign, open “Recommendations”: the image cost appears before “Apply,” then review the draft and select “Launch now” only when everything is correct. Do not ask it to invent a link, figure, or product fact.' },
          { fr: 'Vous pouvez aussi joindre des fichiers pertinents et poser une question explicite à leur sujet, par exemple : « Résume ce document et relève les chiffres de ventes ». Le texte extrait d’un document sert de contexte à la réponse; vérifiez les données importantes dans leur source.', en: 'You can also attach relevant files and ask a direct question about them, for example: “Summarize this document and identify the sales figures.” Text extracted from a document is used as context for the answer; verify important figures against their source.' },
        ],
      },
      {
        id: 'proposed-actions-and-confirmation',
        title: { fr: 'Actions proposées : vérifier et confirmer', en: 'Proposed actions: review and confirm' },
        paragraphs: [
          { fr: 'Dans « Recommandation », « Appliquer » génère l’image au coût affiché et prépare un brouillon modifiable; cette action ne publie pas la campagne. Relis le produit, la plateforme, le budget, le texte, le lien et les autres détails avant de choisir « Lancer maintenant ».', en: 'In “Recommendations,” “Apply” generates the image at the displayed credit cost and prepares an editable draft; it does not publish the campaign. Review the product, platform, budget, copy, link, and other details before selecting “Launch now.”' },
          { fr: 'La carte de gestion d’une campagne peut présenter un aperçu des changements et signaler qu’une confirmation est requise. Utilisez le contrôle de confirmation affiché seulement après avoir vérifié l’aperçu. Tant qu’une action n’est pas confirmée et que l’interface n’en indique pas la réussite, considérez-la comme proposée ou en brouillon, pas comme terminée.', en: 'A campaign-management card may show a preview of changes and indicate that confirmation is required. Use the displayed confirmation control only after checking the preview. Until an action is confirmed and the interface reports success, treat it as proposed or a draft—not completed.' },
          { fr: 'Les actions disponibles dépendent de la demande, de la configuration et des autorisations du compte. Si aucun aperçu ou contrôle de confirmation n’apparaît, la conversation seule ne prouve pas qu’une modification externe a eu lieu.', en: 'Available actions depend on the request, account setup, and permissions. If no preview or confirmation control appears, the conversation alone does not prove that an external change took place.' },
        ],
      },
      {
        id: 'history-attachments-privacy',
        title: { fr: 'Historique, pièces jointes et données', en: 'History, attachments, and data' },
        paragraphs: [
          { fr: '« Historique » (« History ») liste les conversations enregistrées; sélectionnez-en une pour la rouvrir, ou choisissez « Nouvelle conversation » (« New conversation ») pour repartir sur une discussion vide. L’historique peut être momentanément indisponible; vous pouvez alors continuer la conversation en cours.', en: '“History” (« Historique ») lists saved conversations; select one to reopen it, or choose “New conversation” (« Nouvelle conversation ») to start with an empty thread. History may be temporarily unavailable; you can still continue the current conversation.' },
          { fr: 'Un message accepte jusqu’à cinq pièces jointes. Les formats proposés sont les images et vidéos, ainsi que les documents PDF et DOCX. Le contenu textuel des documents pris en charge est extrait pour fournir du contexte; une image ou une vidéo peut être jointe, mais l’assistant ne garantit pas l’interprétation de tous les contenus. Les fichiers encore en cours d’envoi doivent avoir fini de charger avant l’envoi du message.', en: 'A message accepts up to five attachments. Supported input types offered are images and videos, plus PDF and DOCX documents. Text from supported documents is extracted to provide context; an image or video can be attached, but the assistant does not guarantee interpretation of every file’s contents. Files still uploading must finish before the message can be sent.' },
          { fr: 'Les messages, données de boutique, pièces jointes et budget peuvent contenir des informations sensibles. Partagez seulement ce qui est nécessaire et évitez les secrets, mots de passe ou données personnelles qui ne sont pas utiles. Examinez et confirmez vous-même toute action qui engage un budget publicitaire; une suggestion de budget n’est pas une autorisation de dépense.', en: 'Messages, store data, attachments, and budgets can contain sensitive information. Share only what is needed and avoid secrets, passwords, or unnecessary personal data. Review and personally confirm any action that commits advertising spend; a suggested budget is not authorization to spend.' },
          { fr: 'Pour examiner les données de vente ou de campagne en détail, utilisez aussi les espaces Rapports, Bénéfices nets et Pub. La réponse de l’assistant est un appui à la lecture des informations disponibles, pas un remplacement des sources de la boutique ou de la plateforme publicitaire.', en: 'For detailed sales or campaign data, also use Reports (« Rapports »), Net profit (« Bénéfices nets »), and Ads (« Pub »). The assistant helps interpret available information; it does not replace the store or advertising platform as the source of record.' },
        ],
      },
    ],
  },
];
