import type { DocSection } from "./types";

export const socialIntegrationSections: DocSection[] = [
  {
    "id": "connect-pinterest",
    "group": "sell",
    "title": {
      "fr": "Connecter Pinterest Ads",
      "en": "Connect Pinterest Ads"
    },
    "summary": {
      "fr": "Reliez un compte publicitaire Pinterest, préparez une campagne et comprenez les mesures réellement disponibles.",
      "en": "Connect a Pinterest ad account, prepare a campaign, and understand the measurement that is actually available."
    },
    "articles": [
      {
        "id": "pinterest-prerequisites",
        "title": {
          "fr": "Avant de commencer",
          "en": "Before you start"
        },
        "paragraphs": [
          {
            "fr": "Vous devez disposer d’un compte Vendeo connecté et d’un compte publicitaire Pinterest accessible avec le compte Pinterest que vous autorisez. Le profil Pinterest seul ne garantit pas l’accès à un compte publicitaire : assurez-vous que votre utilisateur a les droits nécessaires dans Pinterest Ads.",
            "en": "You need a signed-in Vendeo account and access to a Pinterest ad account through the Pinterest account you authorize. A Pinterest profile alone does not guarantee access to an ad account: make sure your user has the required permissions in Pinterest Ads."
          },
          {
            "fr": "Vendeo demande pendant l’autorisation les accès aux comptes, publicités, tableaux et épingles, en lecture et écriture. Pinterest peut afficher son propre écran de consentement; les libellés et choix de comptes sont ceux de Pinterest et peuvent varier.",
            "en": "During authorization Vendeo requests access to accounts, ads, boards, and Pins, with read and write access. Pinterest displays its own consent screen; labels and account choices are controlled by Pinterest and may vary."
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
        "id": "pinterest-connect-steps",
        "title": {
          "fr": "Connecter le compte",
          "en": "Connect the account"
        },
        "steps": [
          {
            "fr": "Dans Vendeo, ouvrez la zone des comptes publicitaires ou le parcours Pub et choisissez Pinterest Ads, puis « Connecter Pinterest Ads » (le libellé peut varier selon l’écran).",
            "en": "In Vendeo, open Ad accounts or the Ads flow and choose Pinterest Ads, then “Connect Pinterest Ads” (the label may differ by screen)."
          },
          {
            "fr": "Connectez-vous à Pinterest si nécessaire, examinez l’écran d’autorisation Pinterest et accordez l’accès demandé. Revenez ensuite à Vendeo.",
            "en": "Sign in to Pinterest if prompted, review Pinterest’s authorization screen, and grant the requested access. Then return to Vendeo."
          },
          {
            "fr": "Vendeo récupère les comptes publicitaires auxquels l’autorisation donne accès. Vérifiez le nom, la devise et le pays proposés avant de sélectionner le compte dans le parcours publicitaire.",
            "en": "Vendeo retrieves the ad accounts available to the authorization. Check the displayed name, currency, and country before selecting an account in the Ads flow."
          }
        ],
        "notice": {
          "fr": "Un retour « connecté » confirme que l’autorisation a abouti; « aucun compte publicitaire » signifie qu’aucun compte n’a été renvoyé. Le choix d’un compte n’équivaut pas au lancement d’une campagne.",
          "en": "A “connected” return confirms authorization succeeded; “no ad account” means none was returned. Selecting an account does not launch a campaign."
        }
      },
      {
        "id": "pinterest-data-and-permissions",
        "title": {
          "fr": "Ce que Vendeo échange avec Pinterest",
          "en": "What Vendeo exchanges with Pinterest"
        },
        "paragraphs": [
          {
            "fr": "Lors de la connexion, Vendeo enregistre de manière protégée les jetons d’accès et, s’il est fourni, le jeton de renouvellement, ainsi que les autorisations et les identifiants des comptes publicitaires accessibles. Les identifiants servent à agir au nom de votre compte; ils ne constituent pas un accès à votre mot de passe.",
            "en": "When you connect, Vendeo stores access tokens securely and, if provided, a refresh token, together with granted scopes and identifiers for accessible ad accounts. These credentials let Vendeo act for your account; they are not access to your password."
          },
          {
            "fr": "Les fonctions de campagne utilisent le compte sélectionné pour créer une campagne, un groupe d’annonces, une épingle et une annonce, et pour récupérer des informations de rapport lorsque la plateforme les fournit. L’autorisation inclut l’écriture : cette connexion n’est donc pas en lecture seule.",
            "en": "Campaign features use the selected account to create a campaign, ad group, Pin, and ad, and to retrieve reporting information when the platform provides it. The authorization includes write access, so this connection is not read-only."
          }
        ],
        "links": [
          {
            "href": "/docs#launch-campaigns",
            "label": {
              "fr": "Lancer une campagne",
              "en": "Launch campaigns"
            }
          }
        ]
      },
      {
        "id": "pinterest-launch-scope",
        "title": {
          "fr": "Produits, destination et lancement",
          "en": "Products, destination, and launch"
        },
        "paragraphs": [
          {
            "fr": "Dans Pub, choisissez le produit Vendeo et le compte Pinterest, puis contrôlez le texte, le média, le lien de destination, l’objectif, le budget, les pays et les autres champs affichés. Le lien doit mener à une page accessible de votre boutique ou site; Vendeo transmet le lien et le média de la création à Pinterest. Les réglages disponibles dépendent de l’objectif et du parcours affiché.",
            "en": "In Ads, choose the Vendeo product and Pinterest account, then review copy, media, destination link, objective, budget, countries, and other displayed fields. The link should lead to an accessible page on your store or site; Vendeo sends the link and creative media to Pinterest. Available settings depend on the objective and flow shown."
          },
          {
            "fr": "Vendeo crée chez Pinterest une campagne, un groupe d’annonces, une épingle et une annonce. Si une étape échoue après création, il tente d’archiver la campagne incomplète. Pinterest reste responsable de l’examen, de l’acceptation, de la diffusion et de la facturation. Un clic de lancement n’est pas une garantie de diffusion ; vérifiez le statut avant une nouvelle tentative.",
            "en": "Vendeo creates a Pinterest campaign, ad group, Pin and ad. If a later step fails, it attempts to archive the incomplete campaign. Pinterest remains responsible for review, approval, delivery and billing. A launch click does not guarantee delivery; check status before retrying."
          }
        ],
        "links": [
          {
            "href": "/docs#launch-campaigns",
            "label": {
              "fr": "Détails du lancement",
              "en": "Launch details"
            }
          }
        ]
      },
      {
        "id": "pinterest-tag",
        "title": {
          "fr": "Tag Pinterest et événements de conversion",
          "en": "Pinterest Tag and conversion events"
        },
        "paragraphs": [
          {
            "fr": "Un tag de conversion Pinterest mesure des actions sur un site (par exemple visite de page, ajout au panier ou achat) afin d’alimenter les rapports et, selon le type de campagne, l’optimisation. Pour créer un tag, consultez Pinterest Ads Manager, section Conversions; pour une installation manuelle, Pinterest fournit un code de base à placer sur le site et des événements à déclencher sur les actions correspondantes. Vérifiez ensuite les événements dans les outils Pinterest.",
            "en": "A Pinterest conversion tag measures actions on a site (for example page visits, add-to-cart, or checkout) for reporting and, depending on campaign type, optimization. Create a tag in Pinterest Ads Manager under Conversions; for manual installation, Pinterest provides base code to place on the site and event code to trigger for the corresponding actions. Then verify events in Pinterest tools."
          },
          {
            "fr": "La connexion Pinterest à Vendeo n’installe pas ce code sur votre boutique et ne prouve pas que les événements remontent. Configurez le tag séparément dans votre site ou votre plateforme de boutique, selon ses possibilités. Les événements observés, le consentement, les bloqueurs, le navigateur et la fenêtre d’attribution peuvent limiter ou modifier les résultats; les conversions attribuées ne sont pas une mesure exhaustive des ventes.",
            "en": "Connecting Pinterest to Vendeo does not install this code on your store or prove that events are being received. Configure the tag separately on your site or store platform, according to its capabilities. Observed events, consent, blockers, browser behavior, and attribution windows may limit or change results; attributed conversions are not a complete measure of sales."
          },
          {
            "fr": "Le code de base permet de mesurer la visite des pages équipées. Les événements complémentaires correspondent à des étapes métier, par exemple consultation d’un produit, ajout au panier, début de paiement ou achat terminé. Leur disponibilité dépend de votre installation et de la nomenclature Pinterest : ne renommez pas simplement les événements Meta et ne comptez pas une visite comme un achat.",
            "en": "The base code measures visits on equipped pages. Additional events represent business steps such as viewing a product, adding to cart, starting checkout or completing a purchase. Availability depends on your setup and Pinterest event names: do not simply reuse Meta event names or count a visit as a purchase."
          }
        ],
        "links": [
          {
            "href": "https://help.pinterest.com/en/business/article/add-event-codes",
            "label": {
              "fr": "Guide officiel Pinterest : codes d’événement",
              "en": "Official Pinterest guide: event codes"
            }
          },
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
        "id": "pinterest-status-troubleshooting",
        "title": {
          "fr": "États, reconnexion et dépannage",
          "en": "Status, reconnecting, and troubleshooting"
        },
        "paragraphs": [
          {
            "fr": "Un échec de connexion peut venir d’une autorisation refusée, d’un retour OAuth expiré, d’une configuration Pinterest indisponible ou d’une erreur temporaire de la plateforme. Réessayez depuis Vendeo et validez la demande Pinterest; si aucun compte n’apparaît, vérifiez dans Pinterest Ads que le compte publicitaire existe et que votre utilisateur y a accès.",
            "en": "A connection failure may result from declined authorization, an expired OAuth return, unavailable Pinterest configuration, or a temporary platform error. Retry from Vendeo and approve Pinterest’s request; if no account appears, confirm in Pinterest Ads that an ad account exists and your user can access it."
          },
          {
            "fr": "Si une campagne échoue, lisez le message affiché dans Vendeo, vérifiez le compte, le lien, les médias, les paramètres de campagne et les exigences de tag de Pinterest pour l’objectif choisi. Vous pouvez consulter ou déconnecter les connexions dans Paramètres. Après révocation ou expiration, reconnectez Pinterest puis réessayez; ne relancez pas plusieurs fois sans vérifier si une campagne a déjà été créée.",
            "en": "If a campaign fails, read Vendeo’s displayed message and check the account, link, media, campaign settings, and Pinterest tag requirements for the selected objective. You can review or disconnect connections in Settings. After revocation or expiry, reconnect Pinterest and retry; do not repeatedly launch without checking whether a campaign was already created."
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
      }
    ]
  },
  {
    "id": "connect-tiktok",
    "group": "sell",
    "title": {
      "fr": "Connecter TikTok Ads",
      "en": "Connect TikTok Ads"
    },
    "summary": {
      "fr": "Reliez TikTok Ads Manager, choisissez un annonceur et découvrez les prérequis réels au lancement et au suivi.",
      "en": "Connect TikTok Ads Manager, choose an advertiser, and learn the actual launch and measurement prerequisites."
    },
    "articles": [
      {
        "id": "tiktok-prerequisites",
        "title": {
          "fr": "Prérequis et accès nécessaires",
          "en": "Prerequisites and required access"
        },
        "paragraphs": [
          {
            "fr": "Vous avez besoin d’un compte Vendeo et d’un compte publicitaire TikTok Ads Manager (business) auquel vous avez accès. Un compte TikTok personnel seul ne suffit pas pour autoriser la connexion ou lancer une publicité. Avant de continuer, préparez dans Ads Manager un moyen de paiement, une identité publicitaire dans « Actifs > Identités » et, pour les objectifs Ventes ou Prospects, un Pixel dans Events.",
            "en": "You need a Vendeo account and access to a TikTok Ads Manager (business) ad account. A personal TikTok account alone is not enough to authorize the connection or launch an ad. Before continuing, set up a payment method in Ads Manager, an ad identity under “Assets > Identities,” and, for Sales or Leads objectives, a Pixel in Events."
          },
          {
            "fr": "Vendeo affiche d’abord « Avant de connecter TikTok Ads » avec « J’ai un compte publicitaire, continuer », « Créer mon compte TikTok Ads Manager » et « Retour ». L’autorisation TikTok peut ensuite demander les droits associés au compte publicitaire; accordez uniquement l’accès attendu pour l’usage que vous souhaitez.",
            "en": "Vendeo first shows “Before connecting TikTok Ads” with “I have an ad account, continue,” “Create my TikTok Ads Manager account,” and “Back.” TikTok authorization may then request permissions associated with the ad account; grant access only when it matches the use you intend."
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
        "id": "tiktok-connect-steps",
        "title": {
          "fr": "Connecter TikTok Ads",
          "en": "Connect TikTok Ads"
        },
        "steps": [
          {
            "fr": "Dans Vendeo, ouvrez Comptes publicitaires, Paramètres ou Pub, puis choisissez « Connecter TikTok Ads ». L’écran de prérequis vous rappelle ce qu’il faut préparer.",
            "en": "In Vendeo, open Ad accounts, Settings, or Ads, then choose “Connect TikTok Ads.” The prerequisite screen reminds you what to prepare."
          },
          {
            "fr": "Si le compte Ads Manager est prêt, choisissez « J’ai un compte publicitaire, continuer ». Connectez-vous à TikTok si nécessaire et autorisez l’accès dans l’écran TikTok.",
            "en": "If your Ads Manager account is ready, choose “I have an ad account, continue.” Sign in to TikTok if prompted and authorize access on TikTok’s screen."
          },
          {
            "fr": "À votre retour, Vendeo récupère les annonceurs accessibles. Dans le parcours Pub, sélectionnez le compte publicitaire voulu et, si demandé, l’identité à utiliser.",
            "en": "When you return, Vendeo retrieves accessible advertisers. In the Ads flow, select the intended ad account and, if prompted, the identity to use."
          }
        ],
        "notice": {
          "fr": "« Connecté » signifie que l’autorisation a réussi, pas que le pixel est installé ni qu’une campagne est active. Si le compte ne s’affiche pas, vérifiez l’accès dans TikTok Ads Manager.",
          "en": "“Connected” means authorization succeeded; it does not mean the pixel is installed or a campaign is active. If the account is missing, check access in TikTok Ads Manager."
        }
      },
      {
        "id": "tiktok-data-permissions",
        "title": {
          "fr": "Données et actions autorisées",
          "en": "Data and authorized actions"
        },
        "paragraphs": [
          {
            "fr": "Vendeo enregistre de manière protégée le jeton d’accès, les autorisations reçues et les identifiants et détails des comptes annonceurs accessibles (nom, devise et état disponibles). Pour une campagne, il peut aussi lire les identités, les zones géographiques compatibles et les pixels renvoyés par TikTok. Les jetons ne sont pas votre mot de passe.",
            "en": "Vendeo securely stores the access token, granted permissions, and identifiers and details available for accessible advertiser accounts (name, currency, and status). For a campaign, it can also read identities, supported geographic locations, and Pixels returned by TikTok. Tokens are not your password."
          },
          {
            "fr": "L’intégration TikTok n’est pas en lecture seule : le parcours de lancement crée une campagne, un groupe d’annonces, envoie le média et crée une publicité. Vendeo peut lire des rapports publicitaires lorsque TikTok les rend accessibles. Le compte TikTok Ads est facturé directement par TikTok, pas par Vendeo.",
            "en": "The TikTok integration is not read-only: the launch flow creates a campaign and ad group, uploads media, and creates an ad. Vendeo can read advertising reports when TikTok makes them available. TikTok bills the TikTok Ads account directly, not Vendeo."
          }
        ],
        "links": [
          {
            "href": "/docs#ad-accounts",
            "label": {
              "fr": "Comptes publicitaires",
              "en": "Ad accounts"
            }
          },
          {
            "href": "/docs#launch-campaigns",
            "label": {
              "fr": "Lancement des campagnes",
              "en": "Campaign launches"
            }
          }
        ]
      },
      {
        "id": "tiktok-launch-scope",
        "title": {
          "fr": "Produits, formats et lancement",
          "en": "Products, formats, and launch"
        },
        "paragraphs": [
          {
            "fr": "Dans Pub, sélectionnez TikTok, le compte annonceur, le produit Vendeo, l’objectif, le texte, le média, l’URL de destination, le budget, les âges et les pays. Le lancement prend en charge les médias image ou vidéo selon les exigences TikTok et transmet le lien de destination. Les zones non prises en charge par le compte sont refusées avant création. Une identité publicitaire valide est obligatoire.",
            "en": "In Ads, select TikTok, the advertiser account, Vendeo product, objective, copy, media, destination URL, budget, ages and countries. Launch supports image or video media subject to TikTok requirements and sends the destination link. Locations unsupported by the account are rejected before creation. A valid ad identity is required."
          },
          {
            "fr": "Le lancement TikTok est réellement implémenté depuis le parcours Pub. Il vérifie d’abord compte, identité, pays et pixel requis; ensuite il crée campagne, groupe d’annonces, média et annonce. Si une étape échoue après création, Vendeo tente de supprimer la campagne incomplète pour éviter les doublons. Le lancement depuis le chat n’est pas disponible pour TikTok : utilisez « Pub > Lancer une pub > TikTok ». TikTok décide de l’examen et de la diffusion.",
            "en": "TikTok launch is actually implemented in the Ads flow. It checks the account, identity, countries, and required Pixel first; then it creates the campaign, ad group, media, and ad. If a later step fails, Vendeo attempts to delete the incomplete campaign to avoid duplicates. TikTok launch from chat is not available: use “Ads > Launch an ad > TikTok.” TikTok controls review and delivery."
          }
        ],
        "links": [
          {
            "href": "/docs#launch-campaigns",
            "label": {
              "fr": "Guide de lancement",
              "en": "Launch guide"
            }
          }
        ]
      },
      {
        "id": "tiktok-pixel",
        "title": {
          "fr": "Pixel TikTok et événements",
          "en": "TikTok Pixel and events"
        },
        "paragraphs": [
          {
            "fr": "Les objectifs Ventes et Prospects exigent au lancement qu’un Pixel TikTok soit disponible dans Events pour l’annonceur. Dans TikTok Ads Manager, ouvrez Tools > Events Manager > Connect Data Source > Web, saisissez l’URL, puis choisissez une intégration partenaire ou manuelle. La configuration manuelle consiste notamment à créer le Pixel, installer le code de base sur le site et paramétrer les événements. Vérifiez-les avec Test Events, Diagnostics ou Pixel Helper.",
            "en": "Sales and Leads objectives require a TikTok Pixel to be available under Events for the advertiser at launch. In TikTok Ads Manager, open Tools > Events Manager > Connect Data Source > Web, enter the URL, then choose a partner or manual integration. Manual setup includes creating the Pixel, installing base code on the site, and configuring events. Verify them with Test Events, Diagnostics, or Pixel Helper."
          },
          {
            "fr": "Vendeo vérifie qu’un Pixel existe et le transmet au groupe d’annonces pour ces objectifs; cette vérification ne mesure pas si le code est effectivement installé ou si des événements arrivent. Vendeo ne configure pas automatiquement votre site ni votre boutique Chariow. Installez et testez le Pixel séparément sur la destination réelle, si la plateforme permet l’ajout de code ou une intégration partenaire. La mesure dépend aussi du consentement, des bloqueurs et des règles d’attribution TikTok.",
            "en": "For these objectives, Vendeo checks that a Pixel exists and passes it to the ad group; this does not verify that code is installed or that events are arriving. Vendeo does not automatically configure your site or Chariow store. Install and test the Pixel separately on the actual destination, if the platform supports custom code or a partner integration. Measurement also depends on consent, blockers, and TikTok attribution rules."
          },
          {
            "fr": "Les événements décrivent des étapes différentes : consultation de contenu, ajout au panier, début du paiement et achat terminé. Configurez les événements adaptés dans Events Manager avec les noms actuellement proposés par TikTok, puis vérifiez montant et devise pour les achats. Un pixel présent dans la liste ne prouve pas que ces étapes soient mesurées ni qu’un achat attribué corresponde à une commande Chariow identifiable.",
            "en": "Events describe different steps: viewing content, adding to cart, starting checkout and completing a purchase. Configure suitable events in Events Manager using TikTok’s current names, then check purchase value and currency. A Pixel appearing in the list does not prove these steps are measured or that an attributed purchase corresponds to an identifiable Chariow order."
          }
        ],
        "links": [
          {
            "href": "https://ads.tiktok.com/resources/help/article/get-started-pixel",
            "label": {
              "fr": "Guide officiel TikTok : configurer un Pixel",
              "en": "Official TikTok guide: set up a Pixel"
            }
          },
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
        "id": "tiktok-status-troubleshooting",
        "title": {
          "fr": "Statuts, reconnexion et dépannage",
          "en": "Statuses, reconnecting, and troubleshooting"
        },
        "paragraphs": [
          {
            "fr": "Si la connexion échoue, vérifiez que vous avez confirmé l’écran de prérequis, que le compte TikTok Ads Manager existe et que votre utilisateur peut l’autoriser. Le retour TikTok doit intervenir dans le délai de sécurité; recommencez une nouvelle connexion si l’autorisation a expiré. Vendeo affiche les états de connexion sur le tableau de bord et permet de gérer les connexions dans Paramètres.",
            "en": "If connection fails, confirm that you passed the prerequisite screen, that the TikTok Ads Manager account exists, and that your user can authorize it. TikTok must return within the security time window; start a new connection if authorization expired. Vendeo shows connection status on the dashboard and lets you manage connections in Settings."
          },
          {
            "fr": "Au lancement, lisez l’erreur affichée : elle peut signaler un compte absent/inactif, aucune identité (« Actifs > Identités »), un pays non pris en charge ou l’absence de Pixel pour Ventes/Prospects. Corrigez le point dans TikTok Ads Manager, puis réessayez dans Pub. Après révocation ou problème d’accès, déconnectez puis reconnectez TikTok dans Vendeo. Avant un nouvel essai, vérifiez dans Ads Manager si la campagne existe déjà.",
            "en": "At launch, read the displayed error: it may indicate a missing/inactive account, no identity (“Assets > Identities”), an unsupported country, or no Pixel for Sales/Leads. Fix the issue in TikTok Ads Manager, then retry in Ads. After revocation or access problems, disconnect and reconnect TikTok in Vendeo. Before retrying, check Ads Manager to see whether the campaign already exists."
          }
        ],
        "links": [
          {
            "href": "/docs#ad-accounts",
            "label": {
              "fr": "Gérer les comptes",
              "en": "Manage accounts"
            }
          },
          {
            "href": "/docs#measurement-attribution",
            "label": {
              "fr": "Limites de mesure",
              "en": "Measurement limits"
            }
          }
        ]
      }
    ]
  }
];
