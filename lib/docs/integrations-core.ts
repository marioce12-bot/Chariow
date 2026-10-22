import type { DocSection } from "./types";

export const coreIntegrationSections: DocSection[] = [
  {
    "id": "connect-chariow",
    "group": "sell",
    "title": {
      "fr": "Connecter Chariow",
      "en": "Connect Chariow"
    },
    "summary": {
      "fr": "Reliez une boutique Chariow pour importer son catalogue et ses données de ventes, puis vérifiez la connexion et les liens produits.",
      "en": "Connect a Chariow store to import its catalog and sales data, then check the connection and product links."
    },
    "articles": [
      {
        "id": "chariow-prerequisites",
        "title": {
          "fr": "Avant de connecter votre boutique",
          "en": "Before connecting your store"
        },
        "paragraphs": [
          {
            "fr": "Vous avez besoin d’un compte Vendeo et d’un compte Chariow auquel vous pouvez vous connecter. Pendant le parcours, choisissez Chariow dans la fenêtre de connexion Vendeo, puis autorisez l’accès demandé sur Chariow. La connexion utilise OAuth; Vendeo ne vous demande pas de copier un mot de passe ou une clé API.",
            "en": "You need a Vendeo account and a Chariow account you can sign in to. During the flow, choose Chariow in Vendeo’s connection dialog, then authorize the requested access on Chariow. The connection uses OAuth; Vendeo does not ask you to copy a password or API key."
          },
          {
            "fr": "Le parcours Vendeo affiche d’abord une introduction, puis le choix de plateforme. Chariow est l’option disponible; « Boutique personnalisée » est indiquée comme indisponible. Si vous avez plusieurs boutiques, connectez-les une par une selon les limites de votre abonnement.",
            "en": "Vendeo first shows an introduction, then a platform choice. Chariow is the available option; “Custom store” is marked unavailable. If you have multiple stores, connect them one at a time, subject to your subscription limits."
          }
        ],
        "links": [
          {
            "href": "/docs#stores-products",
            "label": {
              "fr": "Boutiques et produits",
              "en": "Stores and products"
            }
          }
        ]
      },
      {
        "id": "chariow-connect-steps",
        "title": {
          "fr": "Étapes de connexion",
          "en": "Connection steps"
        },
        "steps": [
          {
            "fr": "Connectez-vous à Vendeo. Dans la fenêtre d’accueil, choisissez Connecter une boutique puis Chariow. Pour une boutique supplémentaire, passez par Mes boutiques et l’action d’ajout proposée.",
            "en": "Sign in to Vendeo. In the welcome dialog, choose Connect a store and then Chariow. For another store, open My stores and use the provided add action."
          },
          {
            "fr": "Vous êtes redirigé vers Chariow. Connectez-vous si nécessaire et approuvez l’autorisation demandée; ne fermez pas la fenêtre avant le retour vers Vendeo.",
            "en": "You are redirected to Chariow. Sign in if needed and approve the requested authorization; do not close the window before returning to Vendeo."
          },
          {
            "fr": "À votre retour, ouvrez « Mes boutiques », sélectionnez la boutique et vérifiez que son état est connecté. Vendeo vérifie la connexion et synchronise les données de boutique; vous pouvez relancer une synchronisation si les informations semblent anciennes.",
            "en": "When you return, open “My stores”, select the store, and check that its status is connected. Vendeo verifies the connection and syncs store data; you can run a sync again if information appears out of date."
          }
        ],
        "paragraphs": [
          {
            "fr": "Le bouton exact du consentement Chariow est affiché par Chariow et peut varier. Dans Vendeo, la boîte de dialogue fournit aussi « Retour » et « Se déconnecter »; ces boutons ne remplacent pas l’approbation sur Chariow.",
            "en": "The exact Chariow consent button is supplied by Chariow and may vary. In Vendeo, the dialog also provides “Back” and “Sign out”; these buttons do not replace approval on Chariow."
          }
        ]
      },
      {
        "id": "chariow-imported-data",
        "title": {
          "fr": "Données accessibles et limites",
          "en": "Available data and limits"
        },
        "paragraphs": [
          {
            "fr": "Pour une boutique connectée, Vendeo lit les produits et les ventes Chariow, ainsi que les données analytiques renvoyées par Chariow. Selon les données disponibles, la fiche produit peut présenter nom, description, prix, devise, statut, image et URL; les indicateurs de boutique peuvent inclure chiffre d’affaires, ventes, visites, taux de conversion, clients et produits vendus.",
            "en": "For a connected store, Vendeo reads Chariow products and sales, as well as analytics returned by Chariow. Depending on the available data, a product record can show its name, description, price, currency, status, image, and URL; store metrics can include revenue, sales, visits, conversion rate, customers, and products sold."
          },
          {
            "fr": "Les données dépendent de ce que Chariow renvoie et de la couverture de synchronisation; une absence ou un zéro ne prouve pas toujours qu’il n’y a eu aucune activité. Vendeo ne peut pas modifier à votre place les commandes, le catalogue ou les paramètres de paiement Chariow.",
            "en": "Data depends on what Chariow returns and on sync coverage; a missing value or zero does not always prove there was no activity. Vendeo cannot change Chariow orders, catalog, or payment settings on your behalf."
          }
        ],
        "links": [
          {
            "href": "/docs#stores-products",
            "label": {
              "fr": "Voir les boutiques et produits",
              "en": "See stores and products"
            }
          }
        ]
      },
      {
        "id": "chariow-product-destination",
        "title": {
          "fr": "Vérifier le produit et sa destination",
          "en": "Check the product and its destination"
        },
        "paragraphs": [
          {
            "fr": "Lors de la préparation d’une campagne, sélectionnez le produit de la boutique appropriée et contrôlez son URL de destination. Chariow peut ne pas fournir d’URL directe pour un produit; Vendeo peut alors proposer l’adresse d’accueil de la boutique en repli. Ce repli n’est pas la page du produit : remplacez-le par une URL de produit ou de paiement Chariow valide avant de lancer la publicité.",
            "en": "When preparing a campaign, select the product from the correct store and check its destination URL. Chariow may not provide a direct product URL; Vendeo can then fall back to the store homepage. That fallback is not the product page: replace it with a valid Chariow product or checkout URL before launching the ad."
          },
          {
            "fr": "Vendeo peut utiliser les URL de paiement explicitement présentes dans une vente ou retrouver un lien de produit à partir de son identifiant. Cela aide à associer un clic ou une relance à une destination, mais ne garantit pas que chaque URL soit encore active : vérifiez-la dans votre boutique.",
            "en": "Vendeo can use checkout URLs explicitly present in a sale or resolve a product link from its product identifier. This helps associate a click or follow-up with a destination, but does not guarantee every URL is still active: verify it in your store."
          }
        ],
        "steps": [
          {
            "fr": "Ouvrez le sélecteur de produit dans le parcours de campagne et choisissez le bon produit.",
            "en": "Open the product selector in the campaign flow and choose the correct product."
          },
          {
            "fr": "Lisez l’URL affichée et ouvrez-la pour vérifier qu’elle mène à la page ou au paiement attendus.",
            "en": "Review the displayed URL and open it to confirm that it leads to the expected product page or checkout."
          },
          {
            "fr": "Si Vendeo signale une adresse de repli, remplacez-la par le lien Chariow approprié avant la mise en ligne.",
            "en": "If Vendeo indicates a fallback address, replace it with the appropriate Chariow link before publishing."
          }
        ],
        "links": [
          {
            "href": "/docs#launch-campaigns",
            "label": {
              "fr": "Préparer une campagne",
              "en": "Prepare a campaign"
            }
          }
        ]
      },
      {
        "id": "chariow-pixel-events",
        "title": {
          "fr": "Pixel Meta sur le parcours Chariow",
          "en": "Meta Pixel on the Chariow journey"
        },
        "paragraphs": [
          {
            "fr": "Un pixel Meta est un outil de mesure côté Meta, distinct de la connexion OAuth de la boutique. Vendeo peut récupérer les pixels accessibles à partir d’un compte publicitaire Meta connecté et afficher si un pixel est déclaré configuré sur le parcours de vente Chariow. Dans « Comptes publicitaires », choisissez le compte et le pixel, puis utilisez le contrôle de configuration proposé pour indiquer son état.",
            "en": "A Meta Pixel is a Meta-side measurement tool, separate from the store’s OAuth connection. Vendeo can retrieve pixels accessible from a connected Meta ad account and show whether a pixel is marked as configured on the Chariow sales journey. In “Ad accounts”, choose the account and pixel, then use the configuration control provided to mark its status."
          },
          {
            "fr": "Marquer le pixel comme configuré enregistre une déclaration ; cette action ne l’installe pas dans Chariow et ne prouve pas qu’il envoie des événements. Configurez le suivi dans les outils de votre boutique et de Meta. La connexion Vendeo seule ne permet pas d’affirmer que PageView, ViewContent, InitiateCheckout ou Purchase sont déclenchés à chaque étape : vérifiez-les dans les outils de test Meta.",
            "en": "Marking the Pixel as configured records a declaration; this action does not install it in Chariow or prove that events are being sent. Configure tracking in your store and Meta tools. Connecting Vendeo alone does not establish that PageView, ViewContent, InitiateCheckout or Purchase fires at every step; check them in Meta’s test tools."
          },
          {
            "fr": "Vendeo peut voir les identifiants et noms de pixels récupérés, ainsi que l’état déclaré « configuré sur Chariow ». Il ne peut pas vérifier depuis cet état seul le déclenchement réel, la déduplication, ni l’attribution d’une conversion à une commande précise.",
            "en": "Vendeo can see retrieved Pixel IDs and names, and the declared “configured on Chariow” status. That status alone cannot verify actual firing, deduplication, or attribution of a conversion to a particular order."
          }
        ],
        "links": [
          {
            "href": "/docs#measurement-attribution",
            "label": {
              "fr": "Mesure et attribution",
              "en": "Measurement and attribution"
            }
          }
        ]
      },
      {
        "id": "chariow-reconnect",
        "title": {
          "fr": "Connexion expirée ou synchronisation en erreur",
          "en": "Expired connection or sync error"
        },
        "paragraphs": [
          {
            "fr": "Si la boutique est indiquée comme expirée ou déconnectée, ouvrez « Mes boutiques » et relancez la connexion pour cette boutique. Le parcours Vendeo réutilise une boutique Chariow déjà présente qui n’est pas connectée; autorisez de nouveau l’accès sur Chariow et revenez vérifier l’état.",
            "en": "If the store is shown as expired or disconnected, open “My stores” and restart the connection for that store. Vendeo reuses an existing Chariow store that is not connected; authorize access again on Chariow and return to check its status."
          },
          {
            "fr": "Si le démarrage échoue, vérifiez votre connexion Internet et réessayez. Si Chariow ne répond pas, patientez quelques minutes avant une nouvelle tentative. En cas d’erreur persistante, contrôlez l’accès au compte Chariow et contactez l’assistance avec le nom de boutique, son état et le message affiché; ne partagez pas votre mot de passe.",
            "en": "If the flow will not start, check your internet connection and try again. If Chariow is not responding, wait a few minutes before retrying. For a persistent error, check access to your Chariow account and contact support with the store name, status, and displayed message; do not share your password."
          }
        ],
        "links": [
          {
            "href": "/docs#getting-started",
            "label": {
              "fr": "Prise en main",
              "en": "Getting started"
            }
          }
        ]
      }
    ]
  },
  {
    "id": "connect-meta",
    "group": "sell",
    "title": {
      "fr": "Connecter Meta Ads",
      "en": "Connect Meta Ads"
    },
    "summary": {
      "fr": "Reliez Facebook et Instagram via Meta Ads, préparez pages, compte publicitaire et pixel, puis comprenez les autorisations et les limites du suivi.",
      "en": "Connect Facebook and Instagram through Meta Ads, prepare your Page, ad account and Pixel, then understand permissions and measurement limits."
    },
    "articles": [
      {
        "id": "meta-prerequisites",
        "title": {
          "fr": "Comptes et accès nécessaires",
          "en": "Required accounts and access"
        },
        "paragraphs": [
          {
            "fr": "Vous avez besoin d’un compte Vendeo et d’un compte Meta/Facebook disposant d’un accès au compte publicitaire que vous souhaitez utiliser. Choisissez le profil qui peut autoriser les permissions publicitaires et de gestion d’entreprise demandées par Meta. Les comptes, pages et pixels disponibles dépendent des accès que Meta accorde à ce profil; le fait d’être connecté à Facebook ne garantit pas que chaque actif soit accessible.",
            "en": "You need a Vendeo account and a Meta/Facebook account with access to the ad account you want to use. Choose a profile able to authorize the advertising and business-management permissions requested by Meta. Available accounts, Pages, and Pixels depend on the access Meta grants that profile; being signed in to Facebook does not guarantee access to every asset."
          },
          {
            "fr": "Avant de lancer une campagne, vérifiez aussi les actifs nécessaires dans Meta Business Suite/Ads Manager et assurez-vous que votre compte publicitaire peut diffuser. Vendeo peut signaler certaines erreurs ou restrictions renvoyées par Meta, mais ne peut pas lever une restriction ni attribuer des permissions à votre place.",
            "en": "Before launching a campaign, also check the required assets in Meta Business Suite/Ads Manager and make sure your ad account can deliver. Vendeo can report some errors or restrictions returned by Meta, but cannot remove a restriction or grant permissions for you."
          }
        ],
        "links": [
          {
            "href": "/docs#ad-accounts",
            "label": {
              "fr": "Comptes publicitaires",
              "en": "Ad accounts"
            }
          }
        ]
      },
      {
        "id": "meta-connect-steps",
        "title": {
          "fr": "Autoriser la connexion Meta",
          "en": "Authorize Meta connection"
        },
        "steps": [
          {
            "fr": "Ouvrez « Comptes publicitaires » dans le tableau de bord et choisissez « Connecter Meta »; dans le parcours de création de campagne, utilisez « Connecter un compte Meta Ads » si aucun compte n’est disponible.",
            "en": "Open “Ad accounts” in the dashboard and choose “Connect Meta”; in the campaign creation flow, use “Connect a Meta Ads account” if no account is available."
          },
          {
            "fr": "Sur Meta/Facebook, connectez-vous au profil approprié, examinez les permissions affichées et autorisez l’accès aux comptes publicitaires requis.",
            "en": "On Meta/Facebook, sign in to the appropriate profile, review the permissions shown, and authorize access to the required ad accounts."
          },
          {
            "fr": "Après le retour dans Vendeo, ouvrez l’onglet « Meta » de « Pub », puis vérifiez le compte connecté et ses ressources. Les pixels accessibles sont chargés à la connexion; si aucun compte publicitaire n’est retourné, vérifiez le profil et ses accès puis reconnectez-le.",
            "en": "After returning to Vendeo, open the “Meta” tab in “Ads” and check the connected account and its resources. Accessible Pixels are loaded during connection; if no ad account is returned, check the profile and its access, then reconnect."
          }
        ],
        "paragraphs": [
          {
            "fr": "Les libellés de consentement et les options précises sont fournis par Meta et peuvent changer. Vendeo utilise les permissions ads_read, ads_management et business_management; il ne demande pas à l’utilisateur de saisir un jeton.",
            "en": "Consent labels and exact options are supplied by Meta and may change. Vendeo uses the ads_read, ads_management, and business_management permissions; it does not ask the user to enter a token."
          }
        ],
        "links": [
          {
            "href": "/docs#ad-accounts",
            "label": {
              "fr": "Gérer les comptes publicitaires",
              "en": "Manage ad accounts"
            }
          }
        ]
      },
      {
        "id": "meta-assets-data",
        "title": {
          "fr": "Comptes, pages, pixels et données accessibles",
          "en": "Accessible accounts, Pages, Pixels, and data"
        },
        "paragraphs": [
          {
            "fr": "Selon les autorisations Meta, Vendeo récupère les comptes publicitaires, des pages associées (et, si Meta le renvoie, le compte Instagram professionnel associé), les pixels et certains états/indicateurs de campagnes. La vue des ressources peut inclure l’état du compte et une indication de qualité du compte. Les actifs absents ou les erreurs de lecture ne sont pas la preuve qu’ils n’existent pas : ils peuvent être inaccessibles au profil autorisé ou temporairement indisponibles.",
            "en": "Depending on Meta’s authorization, Vendeo retrieves ad accounts, associated Pages (and, when returned by Meta, the associated Instagram business account), Pixels, and selected campaign status/metrics. The resources view can include account status and an account-quality indicator. Missing assets or read errors do not prove they do not exist: they may be inaccessible to the authorized profile or temporarily unavailable."
          },
          {
            "fr": "La connexion ne donne pas à Vendeo accès à votre mot de passe Meta. Vendeo ne peut pas vous attribuer des rôles Business Manager, lever une restriction de compte ou garantir l’approbation et la diffusion d’une annonce. Pour publier, préparez une Page Facebook et, si le placement l’exige, un compte Instagram professionnel correctement associé. Vérifiez aussi le moyen de paiement et les accès de gestion publicitaire.",
            "en": "The connection does not give Vendeo your Meta password. Vendeo cannot assign Business Manager roles, remove account restrictions or guarantee ad approval and delivery. To publish, prepare a Facebook Page and, where required for the placement, a properly linked Instagram professional account. Also check the payment method and advertising-management access."
          }
        ],
        "links": [
          {
            "href": "/docs#launch-campaigns",
            "label": {
              "fr": "Préparer une campagne",
              "en": "Prepare a campaign"
            }
          }
        ]
      },
      {
        "id": "meta-pixels-events",
        "title": {
          "fr": "Pixel : configuration et événements",
          "en": "Pixel: setup and events"
        },
        "paragraphs": [
          {
            "fr": "Un Pixel Meta sert à mesurer des actions sur un site ou un parcours de paiement. Vendeo récupère les pixels visibles pour le compte publicitaire connecté et propose de les marquer comme configurés sur le parcours Chariow. Pour trouver le Pixel à utiliser, vérifiez son identifiant et son accès dans les outils Meta (par exemple Events Manager), puis configurez-le sur le parcours de vente Chariow avec les outils proposés par ces plateformes.",
            "en": "A Meta Pixel measures actions on a website or checkout journey. Vendeo retrieves Pixels visible to the connected ad account and lets you mark them as configured on the Chariow sales journey. To identify the Pixel, check its ID and access in Meta tools (for example, Events Manager), then configure it on the Chariow sales journey using the tools provided by those platforms."
          },
          {
            "fr": "Dans Vendeo, ouvrez Comptes publicitaires et utilisez le contrôle d’état du pixel pour enregistrer votre déclaration de configuration sur Chariow. Ce contrôle n’est pas un installateur ni un test automatique. Le pixel doit être installé séparément sur la destination réellement utilisée par la publicité, avec une méthode prise en charge par Chariow ou votre site.",
            "en": "In Vendeo, open Ad accounts and use the Pixel status control to record your declaration that it is configured on Chariow. This control is not an installer or an automatic test. Install the Pixel separately on the actual advertising destination using a method supported by Chariow or your site."
          },
          {
            "fr": "PageView, ViewContent, InitiateCheckout et Purchase sont des noms d’événements courants de Meta, mais la présence de ces noms dans Vendeo ne prouve pas qu’ils soient effectivement déclenchés par votre boutique. Vendeo ne peut pas confirmer le déclenchement, la déduplication ou l’exhaustivité; vérifiez l’activité avec Meta Events Manager et faites un parcours de test autorisé.",
            "en": "PageView, ViewContent, InitiateCheckout, and Purchase are common Meta event names, but their mention in Vendeo does not prove your store actually fires them. Vendeo cannot confirm firing, deduplication, or completeness; verify activity with Meta Events Manager and run an authorized test journey."
          }
        ],
        "links": [
          {
            "href": "/docs#measurement-attribution",
            "label": {
              "fr": "Mesure et attribution",
              "en": "Measurement and attribution"
            }
          },
          {
            "href": "https://www.facebook.com/business/help/952192354843755",
            "label": {
              "fr": "Installation officielle du pixel Meta",
              "en": "Official Meta Pixel setup"
            }
          },
          {
            "href": "https://developers.facebook.com/documentation/meta-pixel/reference",
            "label": {
              "fr": "Définition des événements Meta",
              "en": "Meta event definitions"
            }
          }
        ],
        "steps": [
          {
            "fr": "Dans Meta Events Manager (Gestionnaire d’événements), choisissez Connecter des données puis Web, donnez un nom au pixel et créez-le. Son identifiant est visible dans Events Manager. Vérifiez que le compte publicitaire et votre profil ont accès à cette source.",
            "en": "In Meta Events Manager, choose Connect data and Web, name the Pixel and create it. Its ID is visible in Events Manager. Check that the ad account and your profile have access to that source."
          },
          {
            "fr": "Indiquez l’adresse de votre site puis choisissez l’intégration partenaire proposée ou une installation manuelle si votre plateforme l’autorise. Le code de base et les événements sont deux étapes différentes : un pixel créé dans Meta n’est pas automatiquement installé.",
            "en": "Enter your website address, then use an offered partner integration or manual installation if your platform allows it. Base code and events are two separate steps: creating a Pixel in Meta does not automatically install it."
          },
          {
            "fr": "Si Chariow ne propose pas la méthode nécessaire, consultez son aide avant de poursuivre. Ne supposez pas qu’un accès au compte Chariow donne accès au code des pages de paiement. N’utilisez pas un pixel d’une autre boutique ou d’un autre compte par erreur.",
            "en": "If Chariow does not offer the required method, consult its help before continuing. Do not assume that access to a Chariow account grants access to checkout-page code. Avoid accidentally using a Pixel belonging to another store or account."
          },
          {
            "fr": "Dans les outils de test d’Events Manager, vérifiez le parcours réel et les événements attendus. Vérifiez aussi le montant, la devise et l’absence de doublons d’achat ; un événement Purchase déclenché au mauvais moment fausserait l’optimisation.",
            "en": "Use Events Manager testing tools to verify the real journey and expected events. Also check value, currency and duplicate purchases; a Purchase event fired at the wrong stage would distort optimization."
          }
        ],
        "bullets": [
          {
            "fr": "PageView : chargement d’une page équipée du code de base. Une visite n’est pas une vente.",
            "en": "PageView: loading a page carrying the base code. A visit is not a sale."
          },
          {
            "fr": "ViewContent : consultation d’un contenu important, par exemple une fiche produit. Cela ne prouve ni un panier ni un achat.",
            "en": "ViewContent: viewing important content, such as a product page. It proves neither a cart nor a purchase."
          },
          {
            "fr": "InitiateCheckout : démarrage du paiement, qui peut ensuite être abandonné.",
            "en": "InitiateCheckout: starting checkout, which may still be abandoned."
          },
          {
            "fr": "Purchase : achat terminé, avec valeur et devise transmises selon la configuration. Il faut vérifier le moment du déclenchement et la déduplication ; un événement reçu ne remplace pas la commande payée Chariow.",
            "en": "Purchase: a completed purchase, with value and currency sent according to setup. Verify firing time and deduplication; receiving an event does not replace the paid Chariow order."
          }
        ]
      },
      {
        "id": "meta-conversions-spend",
        "title": {
          "fr": "Conversions, commandes Chariow et dépenses",
          "en": "Conversions, Chariow orders, and spend"
        },
        "paragraphs": [
          {
            "fr": "Les conversions rapportées par Meta sont des mesures attribuées par Meta selon ses fenêtres, signaux et règles. Elles ne constituent pas une correspondance certaine, une à une, avec les commandes importées de Chariow : les totaux et périodes peuvent différer. Utilisez les ventes Chariow comme source de commandes et vérifiez séparément la couverture et la période.",
            "en": "Conversions reported by Meta are measurements attributed by Meta under its own windows, signals, and rules. They are not a guaranteed one-to-one match with orders imported from Chariow: totals and periods can differ. Use Chariow sales as the order source and check coverage and date range separately."
          },
          {
            "fr": "Les dépenses publicitaires doivent être lues pour le compte et la campagne Meta auxquels elles se rapportent. Vendeo relie les dépenses à un produit seulement lorsque la campagne porte explicitement le produit associé; ne lisez pas une dépense agrégée de compte comme une dépense certaine d’un seul produit.",
            "en": "Ad spend should be read for the Meta account and campaign it belongs to. Vendeo links spend to a product only when the campaign explicitly carries the associated product; do not treat aggregated account spend as definitely belonging to one product."
          },
          {
            "fr": "Pixel et Conversions API sont deux modes de transmission distincts, l’un depuis le navigateur, l’autre depuis un serveur ou partenaire. N’en déduisez pas qu’une Conversions API est active sur votre boutique. Une bonne mesure nécessite une configuration cohérente, le consentement applicable et la déduplication lorsque les deux sources transmettent le même achat.",
            "en": "The Pixel and Conversions API are distinct transmission methods, one from the browser and the other from a server or partner. Do not infer that Conversions API is active for your store. Reliable measurement needs consistent setup, applicable consent and deduplication when both sources send the same purchase."
          }
        ],
        "links": [
          {
            "href": "/docs#measurement-attribution",
            "label": {
              "fr": "Comprendre la mesure",
              "en": "Understand measurement"
            }
          },
          {
            "href": "/docs#profitability",
            "label": {
              "fr": "Bénéfices et dépenses",
              "en": "Profit and spend"
            }
          }
        ]
      },
      {
        "id": "meta-reconnect-errors",
        "title": {
          "fr": "Reconnexion et diagnostic",
          "en": "Reconnect and troubleshoot"
        },
        "paragraphs": [
          {
            "fr": "Si le compte Meta n’apparaît plus, si Meta renvoie une erreur ou si le jeton a expiré, retournez dans « Comptes publicitaires » et relancez « Connecter Meta ». Choisissez le profil qui possède réellement l’accès au compte publicitaire et réaccordez les permissions demandées. Après le retour, vérifiez la liste des comptes et des ressources; la récupération des pixels peut échouer sans annuler une connexion Meta réussie.",
            "en": "If the Meta account no longer appears, Meta returns an error, or the token has expired, return to “Ad accounts” and restart “Connect Meta”. Choose the profile that actually has access to the ad account and re-authorize the requested permissions. After returning, check the account and resource lists; Pixel retrieval can fail without undoing a successful Meta connection."
          },
          {
            "fr": "Pour une restriction, consultez la qualité du compte dans Meta via le lien proposé dans Vendeo et corrigez le problème auprès de Meta. Si une page ou un pixel manque, contrôlez ses droits d’accès et l’association au compte publicitaire. Si les données restent absentes, notez le message d’erreur, le compte concerné et l’heure, puis contactez l’assistance; ne communiquez pas de mot de passe ni de jeton.",
            "en": "For a restriction, check account quality in Meta using the link offered in Vendeo and resolve the issue with Meta. If a Page or Pixel is missing, check its access rights and association with the ad account. If data remains missing, note the error message, affected account, and time, then contact support; do not share a password or token."
          }
        ],
        "links": [
          {
            "href": "/docs#ad-accounts",
            "label": {
              "fr": "Comptes publicitaires",
              "en": "Ad accounts"
            }
          }
        ]
      }
    ]
  }
];
