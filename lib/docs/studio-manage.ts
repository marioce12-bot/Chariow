import type { DocSection } from "./types";

export const studioManageSections: DocSection[] = [
  {
    "id": "studio-assistant",
    "group": "create",
    "title": {
      "fr": "Studio Photo : préparer et créer",
      "en": "Studio Photo: prepare and create"
    },
    "summary": {
      "fr": "Préparez une création à partir d’un produit ou d’une description ; distinguez la suggestion de texte de la génération d’image.",
      "en": "Prepare a creation from a product or description; distinguish text suggestions from image generation."
    },
    "articles": [
      {
        "id": "choose-product",
        "title": {
          "fr": "Choisir un produit ou démarrer librement",
          "en": "Choose a product or start freely"
        },
        "paragraphs": [
          {
            "fr": "Pour accéder à l’espace Vendeo, vous devez d’abord connecter une boutique Chariow. Une fois dans le Studio, le champ « Produit (optionnel) » permet de sélectionner une fiche du catalogue : sa couverture peut servir de référence visuelle et sa description fournir le contexte. Si le choix est proposé, vous pouvez sélectionner « Aucun produit » et rédiger votre propre description ; cette option ne remplace pas la connexion de boutique demandée à l’ouverture de l’espace.",
            "en": "You must first connect a Chariow store to access the Vendeo workspace. In Studio, the optional Product field lets you select an item from your catalogue; its cover can serve as a visual reference and its description can provide context. If offered, you can choose “No product” and write your own description; this does not replace the store connection required to enter the workspace."
          },
          {
            "fr": "La couverture est une référence d’identité, pas une source permettant de déduire les côtés ou éléments invisibles. Pour une image, elle sert de référence ; pour la vidéo dans l’écran principal, le texte d’interface dit qu’elle peut servir d’image de départ, mais la génération vidéo de cet écran reste verrouillée (voir « Vidéo indisponible »).",
            "en": "The cover is an identity reference, not evidence for unseen sides or details. For an image it is used as a reference; the main screen says it can serve as a video starting frame, but video generation in that screen remains locked (see “Video unavailable”)."
          }
        ],
        "steps": [
          {
            "fr": "Ouvrez Studio puis l’onglet Photo. Choisissez une fiche dans Produit (optionnel), ou conservez Aucun produit. Le champ de recherche apparaît lorsque le catalogue contient plus de six produits.",
            "en": "Open Studio and the Photo tab. Select an item under Product (optional), or keep No product. The search field appears when the catalogue has more than six products."
          },
          {
            "fr": "Vérifiez que les informations de la fiche décrivent bien les caractéristiques que vous souhaitez montrer ; complétez la description si nécessaire avant de lancer.",
            "en": "Check that the product information describes the details you want to show; add to the description if needed before starting."
          }
        ]
      },
      {
        "id": "prompt-assistant",
        "title": {
          "fr": "Faire rédiger un prompt par l’IA",
          "en": "Ask AI to draft a prompt"
        },
        "paragraphs": [
          {
            "fr": "La rédaction d’un prompt avec l’IA prépare les consignes de création ; elle ne génère pas l’image. Relisez le texte proposé dans le champ de description, corrigez les faits, les prix, les textes à afficher et les contraintes visuelles. La génération payante n’est lancée qu’avec le bouton de création d’image.",
            "en": "AI prompt writing prepares creative instructions; it does not generate the image. Review the suggested text in the description field and correct facts, prices, text to display and visual constraints. Paid generation starts only with the image creation button."
          },
          {
            "fr": "N’ajoutez pas de résultats, avis clients, garanties, statistiques, prix ou fonctionnalités absents de vos sources. Un prompt bien rédigé reste une proposition à vérifier ; il n’atteste ni la vérité d’une promesse commerciale ni les droits d’utilisation d’une image.",
            "en": "Do not add outcomes, customer reviews, guarantees, statistics, prices or features absent from your sources. A well-written prompt is still a proposal to review; it does not establish that a commercial claim is true or that an image is cleared for use."
          }
        ],
        "steps": [
          {
            "fr": "Sélectionnez un produit si vous souhaitez fournir son contexte, puis cliquez sur « Générer le prompt avec l’IA ».",
            "en": "Select a product if you want to provide its context, then click “Generate prompt with AI.”"
          },
          {
            "fr": "Relisez le texte proposé, remplacez les formulations inexactes et confirmez vous-même la description avant « Créer l’image ».",
            "en": "Review the suggested text, correct anything inaccurate, and verify the description before clicking “Create image.”"
          }
        ]
      },
      {
        "id": "image-setup",
        "title": {
          "fr": "Préparer une image dans le Studio",
          "en": "Prepare an image in Studio"
        },
        "paragraphs": [
          {
            "fr": "Pour l’image, les contrôles de l’interface comprennent « Qualité » (Moyenne, Haute, Très haute, Maximum), « Résolution », « Format » (Carré, Paysage, Portrait) et « Fond » (Auto, Opaque, Transparent PNG). Vous pouvez ajouter jusqu’à trois images de référence PNG/JPEG/WebP. La référence doit être accessible et dans un format accepté ; si toutes les images de référence échouent à être récupérées, la création peut être refusée.",
            "en": "For images, the interface offers “Quality” (Medium, High, Very high, Maximum), “Resolution,” “Format” (Square, Landscape, Portrait), and “Background” (Auto, Opaque, Transparent PNG). You may add up to three PNG/JPEG/WebP reference images. References must be accessible and in a supported format; if none can be fetched, creation is rejected."
          }
        ],
        "steps": [
          {
            "fr": "Rédigez une description précise et sélectionnez qualité, résolution, format et fond adaptés à l’usage.",
            "en": "Write a specific description and choose the appropriate quality, resolution, format, and background."
          },
          {
            "fr": "Ajoutez éventuellement des références PNG/JPEG/WebP, puis contrôlez le coût et le Solde Studio : le prix dépend de la qualité et de la résolution.",
            "en": "Optionally add “Reference images,” then check “Studio balance”: cost depends on quality and resolution."
          },
          {
            "fr": "Cliquez sur « Créer l’image » pour lancer la génération payante. Le bouton de rédaction du prompt ne la lance pas.",
            "en": "Click “Create image” to start paid generation. The prompt-drafting button does not start it."
          }
        ]
      },
      {
        "id": "photo-review-edit",
        "title": {
          "fr": "Vérifier, télécharger ou modifier une image",
          "en": "Review, download or edit an image"
        },
        "paragraphs": [
          {
            "fr": "À la fin, vérifiez les textes, l’orthographe, les prix, les éléments de marque et les détails produit avant publication. Une génération peut produire des erreurs. Une barre de progression est une estimation ; le média doit être réellement affiché avant d’être considéré comme prêt.",
            "en": "When generation finishes, review wording, spelling, prices, branding and product details before publishing. Generated images can contain errors. A progress bar is an estimate; the media must actually be available before it is considered ready."
          },
          {
            "fr": "Le résultat et l’historique permettent de télécharger une image et d’ouvrir Modifier. Décrivez la retouche souhaitée, relisez le coût annoncé et confirmez seulement si vous souhaitez une nouvelle opération payante. Réutiliser un prompt ne réutilise pas gratuitement la génération précédente.",
            "en": "The result and history let you download an image and open Edit. Describe the change you want, review the displayed cost and confirm only if you want a new paid operation. Reusing a prompt does not reuse the previous generation free of charge."
          }
        ],
        "steps": [
          {
            "fr": "Téléchargez l’image validée avant de supprimer une création dont vous pourriez avoir besoin.",
            "en": "Download an approved image before deleting a creation you might need."
          },
          {
            "fr": "Sur iPhone ou iPad, utilisez le partage proposé pour enregistrer l’image dans Photos lorsque cette option est disponible.",
            "en": "On iPhone or iPad, use the provided share action to save the image to Photos when that option is available."
          }
        ]
      }
    ]
  },
  {
    "id": "studio-slideshow",
    "group": "create",
    "title": {
      "fr": "Diaporama animé",
      "en": "Animated slideshow"
    },
    "summary": {
      "fr": "Le format proposé dans le Studio est un diaporama de cinq images publicitaires structurées, avec durées prédéfinies et contrôles de cohérence.",
      "en": "The available format is a five-image advertising slideshow with a structured narrative, preset durations, and factuality safeguards."
    },
    "articles": [
      {
        "id": "slideshow-structure",
        "title": {
          "fr": "Cinq images et un rôle précis pour chacune",
          "en": "Five images, each with a defined role"
        },
        "paragraphs": [
          {
            "fr": "Le diaporama est actif et produit exactement cinq visuels : une accroche d’ouverture, trois arguments distincts issus de la fiche produit, puis un appel à l’action final. Changer la durée ne change pas le nombre d’images. Il s’agit de cinq images animées et assemblées en MP4, pas d’une vidéo libre avec acteurs.",
            "en": "Slideshow is active and produces exactly five visuals: an opening hook, three distinct points from the product details, and a final call to action. Changing duration does not change image count. This is five animated images assembled into an MP4, not free-form video with actors."
          },
          {
            "fr": "Chaque visuel reçoit des consignes propres au produit et à son rôle : accroche, argument et composition ne doivent pas être répétées à l’identique. Les trois arguments doivent être étayés par des faits distincts. Le système ne doit pas inventer témoignages, statistiques, garanties, interface ou emballage absent des références.",
            "en": "Each visual receives product-specific instructions for its role: hook, argument and composition should not simply repeat. The three arguments must be grounded in distinct facts. The system must not invent testimonials, statistics, guarantees, interfaces or packaging absent from the references."
          }
        ],
        "steps": [
          {
            "fr": "Dans Studio, sélectionnez un produit puis ouvrez Diaporama. Relisez la description et assurez-vous qu’elle contient au moins trois informations distinctes, utiles et vérifiables.",
            "en": "In Studio, select a product and open Slideshow. Review the description and make sure it contains at least three distinct, useful, verifiable points."
          },
          {
            "fr": "Choisissez l’objectif : Découvrir, Acheter, En savoir plus ou Contacter. Ce choix adapte l’appel à l’action ; il ne garantit aucune conversion.",
            "en": "Choose a goal: Discover, Buy, Learn more or Contact. This adapts the call to action; it does not guarantee conversions."
          }
        ]
      },
      {
        "id": "slideshow-duration",
        "title": {
          "fr": "Durée, format et temps de lecture",
          "en": "Duration, format and reading time"
        },
        "paragraphs": [
          {
            "fr": "Les durées proposées sont 25, 30 et 40 secondes. Le format du diaporama est vertical 9:16. Les cinq visuels restent chacun lisibles pendant au moins quatre secondes, avec des transitions de 0,8 seconde intégrées au montage. Vérifiez que ce format convient au placement publicitaire prévu.",
            "en": "Available durations are 25, 30 and 40 seconds. The slideshow is vertical 9:16. Each of the five visuals remains readable for at least four seconds, with 0.8-second transitions included in the render. Check that this format suits your intended advertising placement."
          },
          {
            "fr": "Une durée plus longue donne davantage de temps de lecture, pas davantage d’images. Si vous choisissez un autre objectif ou une autre durée, relisez vos choix avant de démarrer ; ces réglages ne constituent pas une commande de génération à eux seuls.",
            "en": "A longer duration gives more reading time, not more images. If you choose another goal or duration, review your choices before starting; selecting these settings does not itself trigger generation."
          }
        ]
      },
      {
        "id": "slideshow-explicit-create",
        "title": {
          "fr": "Lancer uniquement avec Créer",
          "en": "Start only with Create"
        },
        "paragraphs": [
          {
            "fr": "Choisir le produit, la durée, l’objectif ou la musique ne lance pas la génération. Le bouton Créer est la validation explicite. Le coût actuellement affiché est de 100 crédits Studio pour les cinq images HD de qualité moyenne ; les réglages Photo ne changent pas ce tarif du diaporama.",
            "en": "Choosing a product, duration, goal or music does not start generation. Create is the explicit confirmation. The currently displayed cost is 100 Studio credits for five medium-quality HD images; Photo settings do not change this slideshow cost."
          },
          {
            "fr": "Au lancement, les informations produit sont vérifiées avant les images. Si les détails sont insuffisants, complétez la description temporaire proposée avec des faits réels. Cette précision sert au diaporama ; ce n’est pas une modification automatique de votre fiche Chariow. Le message de validation indique lorsqu’aucune image ni dépense de crédits n’a eu lieu.",
            "en": "On launch, product details are checked before images. If details are insufficient, add real facts in the provided temporary description. That clarification is for the slideshow; it does not automatically edit your Chariow listing. The validation message states when no images have been generated and no credits spent."
          }
        ],
        "steps": [
          {
            "fr": "Vérifiez le produit, le format, la durée, la musique et le coût affiché avant de cliquer sur Créer.",
            "en": "Review the product, format, duration, music and displayed cost before clicking Create."
          },
          {
            "fr": "Cliquez une seule fois et laissez le suivi s’établir. Attendez les cinq visuels puis l’assemblage du MP4 ; une progression proche de 100 % ne prouve pas que le fichier final est disponible.",
            "en": "Click once and allow tracking to start. Wait for the five visuals and MP4 assembly; progress close to 100% does not establish that the final file is available."
          },
          {
            "fr": "Si le lancement est non confirmé, n’appuyez pas de nouveau : consultez l’historique et les tâches en cours avant toute nouvelle tentative.",
            "en": "If launch is unconfirmed, do not press again: check history and in-progress tasks before trying again."
          }
        ]
      },
      {
        "id": "slideshow-final-mp4",
        "title": {
          "fr": "Retrouver le résultat complet",
          "en": "Find the complete result"
        },
        "paragraphs": [
          {
            "fr": "Le résultat final comprend un lecteur vidéo et le téléchargement du MP4. Les cinq images sources ne sont pas le résultat vidéo final : une étape d’assemblage supplémentaire est nécessaire. Retrouvez le diaporama terminé dans Tout ou Vidéos / Diaporamas, et les sources dans Images.",
            "en": "The final result provides a video player and MP4 download. The five source images are not the final video: an additional assembly step is required. Find the completed slideshow under All or Videos / Slideshows, and the sources under Images."
          }
        ],
        "steps": [
          {
            "fr": "Ouvrez la carte du diaporama final et lancez sa lecture pour contrôler l’ordre, les textes, la durée et la musique.",
            "en": "Open the final slideshow card and play it to review order, text, duration and music."
          },
          {
            "fr": "Téléchargez le MP4 et conservez le crédit musical à publier si une piste en exige un. Si seul un aperçu image est visible, vérifiez l’état de l’assemblage avant de recommencer.",
            "en": "Download the MP4 and retain any required music attribution for publication. If only an image preview is visible, check assembly status before starting again."
          }
        ]
      }
    ]
  },
  {
    "id": "studio-music",
    "group": "create",
    "title": {
      "fr": "Musique, licences et crédits",
      "en": "Music, licenses, and attribution"
    },
    "summary": {
      "fr": "Choisissez une piste du catalogue du diaporama ou Sans musique, vérifiez la synchronisation et conservez les crédits nécessaires à la publication.",
      "en": "Choose a track from the slideshow catalogue or No music, review synchronization and keep the credits needed for publication."
    },
    "articles": [
      {
        "id": "music-catalog",
        "title": {
          "fr": "Choisir et écouter une piste",
          "en": "Choose and preview a track"
        },
        "paragraphs": [
          {
            "fr": "Dans Studio > Diaporama, le sélecteur Musique propose Sans musique et les pistes disponibles. Le catalogue peut être vide ou certaines pistes indisponibles : ne supposez pas qu’un titre restera toujours accessible. Choisir une piste ne crée ni les images ni le MP4.",
            "en": "In Studio > Slideshow, the Music selector offers No music and the available tracks. The catalogue may be empty or tracks unavailable; do not assume a title will remain available indefinitely. Selecting a track creates neither images nor an MP4."
          },
          {
            "fr": "L’aperçu musical est une prévisualisation synchronisée, pas un lien de téléchargement MP3 indépendant. Le titre, l’artiste, la licence, la page source et le crédit associés sont à consulter avant publication.",
            "en": "Music preview is a synchronized preview, not an independent MP3 download. Review the track title, artist, license, source page and attribution before publication."
          }
        ],
        "steps": [
          {
            "fr": "Choisissez une piste dans Musique et lancez l’aperçu proposé. Contrôlez le volume et l’ambiance pour votre publicité.",
            "en": "Choose a track under Music and play the provided preview. Check the volume and mood for your advertisement."
          },
          {
            "fr": "Si aucune piste ne convient, choisissez Sans musique. Après un changement de piste sur un résultat terminé, utilisez l’action de mise à jour proposée et contrôlez le nouveau MP4.",
            "en": "If no track fits, choose No music. After changing a track on a completed result, use the provided update action and review the new MP4."
          }
        ]
      },
      {
        "id": "music-cc-by",
        "title": {
          "fr": "Licence, attribution et publication",
          "en": "License, attribution and publication"
        },
        "paragraphs": [
          {
            "fr": "Le catalogue interne comprend des pistes de Scott Buckley sous licence CC BY 4.0 avec un texte d’attribution. Conservez le crédit exact fourni, avec le nom de l’artiste, la source et le lien de licence. Pour YouTube, placez ce crédit dans la description de la vidéo. Une mention visible dans Vendeo ne l’ajoute pas automatiquement à votre publication.",
            "en": "The internal catalogue includes Scott Buckley tracks under CC BY 4.0 with supplied attribution text. Keep the exact credit, including artist, source and license link. For YouTube, place it in the video description. Showing attribution in Vendeo does not automatically add it to your publication."
          },
          {
            "fr": "La piste est destinée à accompagner les images : ne la revendez pas isolément, ne la redistribuez pas comme fichier musical et ne la soumettez pas à Content ID. Vérifiez aussi les restrictions et conditions d’utilisation de la source. La disponibilité d’une piste dans un outil n’est pas une garantie juridique universelle pour tous les usages.",
            "en": "The track is meant to accompany the visuals: do not sell it separately, redistribute it as a music file or submit it to Content ID. Also review the source’s restrictions and usage terms. Availability in a tool is not universal legal clearance for every use."
          }
        ],
        "links": [
          {
            "href": "https://creativecommons.org/licenses/by/4.0/",
            "label": {
              "fr": "Licence CC BY 4.0",
              "en": "CC BY 4.0 license"
            }
          },
          {
            "href": "https://www.scottbuckley.com.au/library/using-this-music/",
            "label": {
              "fr": "Conditions Scott Buckley",
              "en": "Scott Buckley usage terms"
            }
          }
        ]
      },
      {
        "id": "music-troubleshoot",
        "title": {
          "fr": "Musique absente ou désynchronisée",
          "en": "Missing or unsynchronized music"
        },
        "paragraphs": [
          {
            "fr": "Si l’aperçu ne se charge pas, vérifiez votre connexion et essayez Sans musique. Si le rendu final contient une ancienne piste, comparez la piste sélectionnée à celle du résultat puis utilisez l’action de mise à jour de musique proposée. Ne relancez pas les cinq images pour résoudre un simple problème d’aperçu.",
            "en": "If preview does not load, check your connection and try No music. If the final render contains an older track, compare the selected track to the result and use the offered music-update action. Do not regenerate all five images to solve a preview-only problem."
          }
        ]
      }
    ]
  },
  {
    "id": "studio-history",
    "group": "manage",
    "title": {
      "fr": "Historique, téléchargements et récupération",
      "en": "History, downloads, and recovery"
    },
    "summary": {
      "fr": "L’historique distingue les images sources du MP4 final et protège contre les relances payantes lorsque l’acceptation d’une tâche est incertaine.",
      "en": "History distinguishes source images from the final MP4 and guards against paid relaunches when task acceptance is uncertain."
    },
    "articles": [
      {
        "id": "history-view",
        "title": {
          "fr": "Retrouver images et MP4 final",
          "en": "Find source images and the final MP4"
        },
        "paragraphs": [
          {
            "fr": "L’historique affiche jusqu’à 20 éléments à la fois et un bouton « Charger plus » lorsqu’il reste des résultats. Un diaporama final est présenté comme un seul élément vidéo dans « Tout »/« Vidéo » ; ses images sources restent consultables dans « Images ». Les images déjà utilisées sont masquées des vues agrégées pour éviter les doublons, mais demeurent dans Images.",
            "en": "History loads items in pages, up to 20 per request, with “Load more” when more results remain. A finished slideshow appears as one video item in “All”/“Video”; its source images remain available under “Images.” Source images already represented by a slideshow are hidden from aggregate views to avoid duplicates but remain in Images."
          },
          {
            "fr": "Quand le média est disponible, Ouvrez la carte et utilisez « Télécharger l’image » ou « Télécharger la vidéo ». Un lien signé peut expirer ou ne pas être disponible ; un état absent ne signifie pas qu’une nouvelle génération est automatiquement lancée.",
            "en": "When media is available, open its card and use “Download image” or “Download video.” A signed link can expire or be unavailable; a missing media state does not automatically start another generation."
          }
        ],
        "steps": [
          {
            "fr": "Ouvrez l’historique Studio et filtrez par Images ou Vidéo si ces filtres sont affichés.",
            "en": "Open Studio history and filter by Images or Video if those filters are shown."
          },
          {
            "fr": "Ouvrez la carte finale du diaporama pour récupérer le MP4  ; ouvrez Images pour retrouver ses cinq sources.",
            "en": "Open the slideshow’s final card to retrieve the MP4; open Images to find its five sources."
          },
          {
            "fr": "Utilisez « Charger plus » pour poursuivre l’historique, puis « Télécharger » depuis la création voulue.",
            "en": "Use “Load more” to continue through history, then choose “Download” on the desired creation."
          }
        ]
      },
      {
        "id": "history-delete-reopen",
        "title": {
          "fr": "Réutiliser ou supprimer une création",
          "en": "Reuse or delete a creation"
        },
        "paragraphs": [
          {
            "fr": "Les cartes d’historique permettent de reprendre le prompt ; pour une image, l’action « Modifier » ouvre le parcours d’édition. La suppression d’une création est une action explicite, à confirmer dans une boîte de dialogue. Considérez la suppression comme définitive : le média supprimé n’est pas restauré automatiquement.",
            "en": "History cards allow you to reuse a prompt; for an image, “Edit” opens the editing flow. Deleting a creation is an explicit action that must be confirmed in a dialog. Treat it as permanent: deleted media is not automatically restored."
          }
        ],
        "steps": [
          {
            "fr": "Pour réutiliser, cliquez sur l’action de reprise du prompt sur la carte puis ajustez la description avant une nouvelle création.",
            "en": "To reuse, click the prompt-reuse action on the card and edit the description before creating again."
          },
          {
            "fr": "Pour une image, choisissez « Modifier » si cette action est disponible. Pour supprimer, choisissez « Supprimer » et confirmez ; considérez la suppression comme définitive.",
            "en": "For an image, choose “Edit” if available. To delete, choose “Delete” and confirm; treat deletion as permanent."
          }
        ]
      },
      {
        "id": "paid-recovery",
        "title": {
          "fr": "Étapes payées et lancement non confirmé",
          "en": "Paid stages and unconfirmed launches"
        },
        "paragraphs": [
          {
            "fr": "Un diaporama est traité comme une tâche en plusieurs étapes : images, puis assemblage. Si le suivi semble incertain, vérifiez l’historique avant de recommencer : une nouvelle tentative peut consommer des crédits supplémentaires.",
            "en": "A slideshow is processed as a multi-stage task: images, then assembly. The system records stage IDs, status, and credit state to avoid losing an image already produced if a response fails. Paid stages should not be treated as a free restart request."
          },
          {
            "fr": "Si le lancement n’est pas confirmé, ne relancez pas immédiatement la création : vérifiez d’abord l’historique et le solde Studio. L’interface demande de vérifier l’historique avant toute nouvelle tentative. Un état de crédit « incertain » nécessite vérification plutôt que des répétitions.",
            "en": "If launch is unconfirmed, do not immediately restart the creation; check history and your Studio balance first. The interface asks you to check history before retrying. An “uncertain” credit state requires verification rather than repeated attempts."
          }
        ],
        "steps": [
          {
            "fr": "Après un message « Lancement non confirmé », ne recliquez pas immédiatement sur créer et ne rechargez pas la page pour contourner l’attente.",
            "en": "After an “unconfirmed launch” message, do not immediately click Create again or reload to bypass the wait."
          },
          {
            "fr": "Ouvrez l’historique et attendez la récupération de la tâche. Si elle reste absente ou échouée et que le solde ne correspond pas, contactez l’assistance en indiquant l’heure approximative et l’identifiant visible, sans envoyer de secret.",
            "en": "Open history and allow the task to recover. If it remains missing or failed and the balance does not match, contact support with the approximate time and visible ID; do not send secrets."
          }
        ]
      }
    ]
  },
  {
    "id": "studio-video-lock",
    "group": "create",
    "title": {
      "fr": "Vidéo indisponible dans le Studio principal",
      "en": "Video unavailable in the main Studio"
    },
    "summary": {
      "fr": "Photo et Diaporama sont proposés ; l’onglet Vidéo reste verrouillé. Un diaporama exporté en MP4 ne déverrouille pas la génération vidéo libre.",
      "en": "Photo and Slideshow are offered; the Video tab remains locked. An MP4 slideshow does not unlock free-form video generation."
    },
    "articles": [
      {
        "id": "video-lock-state",
        "title": {
          "fr": "Pourquoi Vidéo est grisé",
          "en": "Why Video is greyed out"
        },
        "paragraphs": [
          {
            "fr": "L’onglet Vidéo est désactivé et marqué comme à venir. Il ne permet pas actuellement de créer une vidéo libre, des scènes avec personnages ou un clip à partir d’un prompt. N’achetez pas des crédits dans l’espoir de déverrouiller cet onglet : le solde ne change pas sa disponibilité.",
            "en": "The Video tab is disabled and marked as coming later. It does not currently create free-form video, character scenes or a clip from a prompt. Do not buy credits expecting to unlock this tab: your balance does not change its availability."
          }
        ]
      },
      {
        "id": "video-available-path",
        "title": {
          "fr": "Le parcours disponible pour un MP4",
          "en": "The available MP4 workflow"
        },
        "paragraphs": [
          {
            "fr": "Pour obtenir un MP4 depuis le Studio, utilisez Diaporama : cinq images publicitaires, une durée prédéfinie et une musique facultative. Utilisez Photo pour créer ou retoucher une image indépendante. Ce sont des parcours différents, avec des coûts et résultats distincts.",
            "en": "To create an MP4 in Studio, use Slideshow: five advertising images, a preset duration and optional music. Use Photo to create or edit an individual image. These are different workflows with distinct costs and results."
          }
        ],
        "steps": [
          {
            "fr": "Ouvrez Studio puis Diaporama pour le montage de cinq images ; consultez le guide Diaporama pour le déroulé complet.",
            "en": "Open Studio and Slideshow for a five-image render; see the Slideshow guide for the full workflow."
          }
        ]
      },
      {
        "id": "video-no-claims",
        "title": {
          "fr": "Disponibilité et résultat attendu",
          "en": "Availability and expected result"
        },
        "paragraphs": [
          {
            "fr": "Une mention à venir n’est pas une date de mise à disposition. Le diaporama ne promet ni acteurs animés, ni synthèse vocale, ni animation libre de toutes les scènes. Avant un achat ou une campagne, vérifiez le type de média réellement créé et relisez le fichier final.",
            "en": "Coming later is not a release date. Slideshow does not promise animated actors, generated speech or unrestricted scene animation. Before a purchase or campaign, check the actual media type being created and review the final file."
          }
        ]
      }
    ]
  },
  {
    "id": "studio-credits",
    "group": "manage",
    "title": {
      "fr": "Abonnement et crédits Studio",
      "en": "Studio subscription and credits"
    },
    "summary": {
      "fr": "Le forfait Vendeo est affiché à 2 000 XOF pour 30 jours, avec un essai de 5 jours pour les nouvelles inscriptions ; les créations Studio utilisent un solde de crédits distinct.",
      "en": "The Vendeo plan is listed at XOF 2,000 for 30 days, with a 5-day trial for new sign-ups; Studio uses a separate credit balance."
    },
    "articles": [
      {
        "id": "subscription-access",
        "title": {
          "fr": "L’abonnement requis pour créer dans le Studio",
          "en": "Subscription required to create in Studio"
        },
        "paragraphs": [
          {
            "fr": "Le forfait actuellement proposé s’appelle Vendeo : 2 000 XOF pour une période de 30 jours. Les nouvelles inscriptions bénéficient d’un essai de 5 jours. L’abonnement donne accès au service selon l’état et la période indiqués dans l’application ; les crédits Studio sont séparés et servent aux créations.",
            "en": "The currently listed plan is Vendeo: XOF 2,000 for a 30-day period. New sign-ups receive a 5-day trial. Service access depends on the status and period shown in the app; Studio credits are separate and are used for creations."
          }
        ],
        "steps": [
          {
            "fr": "Si un message PLANS_REQUIRED apparaît, ouvrez « Abonnement » et vérifiez l’état et les conditions affichés avant de reprendre.",
            "en": "If PLANS_REQUIRED appears, open “Subscription” and review the displayed status and terms before continuing."
          },
          {
            "fr": "Ne confondez pas crédits Studio et abonnement : avoir un solde positif ne contourne pas l’accès abonnement.",
            "en": "Do not confuse Studio credits with a subscription: a positive credit balance does not bypass subscription access."
          }
        ]
      },
      {
        "id": "exact-credit-costs",
        "title": {
          "fr": "Coûts exacts des images",
          "en": "Exact image costs"
        },
        "paragraphs": [
          {
            "fr": "Le coût affiché est par image et tient compte de la qualité et de la résolution sélectionnées. Valeurs calculées : HD — Moyenne 20, Haute 51, Très haute 151, Maximum 300 crédits ; Full HD — 31, 71, 200, 451 ; 2K — 40, 100, 300, 600 ; 4K — 71, 171, 500, 1 000. Ces montants sont les coûts finaux, après application du multiplicateur tarifaire et arrondi supérieur ; ils ne sont pas la grille de base. La modification d’image peut également coûter des crédits : vérifiez le montant affiché avant de confirmer.",
            "en": "The displayed cost is per image and depends on the selected quality and resolution. Calculated values: HD—Medium 20, High 51, Very high 151, Maximum 300 credits; Full HD—31, 71, 200, 451; 2K—40, 100, 300, 600; 4K—71, 171, 500, 1,000. These are final costs after the pricing multiplier and round-up; they are not the base grid. Image editing may also use credits: check the displayed amount before confirming."
          },
          {
            "fr": "Le diaporama actuel utilise cinq images HD de qualité moyenne et affiche 100 crédits Studio au total. Changer sa durée parmi 25, 30 et 40 secondes ne change pas ce nombre d’images. Vérifiez toujours le coût affiché avant de confirmer, en particulier pour une retouche ou une nouvelle génération.",
            "en": "The current slideshow uses five medium-quality HD images and displays a total of 100 Studio credits. Choosing 25, 30 or 40 seconds does not change image count. Always check the displayed cost before confirming, especially for an edit or a new generation."
          }
        ]
      },
      {
        "id": "credit-topups",
        "title": {
          "fr": "Recharge : minimum 200 crédits, 2,5 XOF par crédit",
          "en": "Top up: 200-credit minimum, 2.5 XOF per credit"
        },
        "paragraphs": [
          {
            "fr": "Le tarif de recharge est de 2,5 XOF par crédit ; la recharge minimale est de 200 crédits, soit 500 XOF. Le montant est calculé par arrondi au XOF le plus proche. Exemples calculés : 200 crédits = 500 XOF ; 1 000 crédits = 2 500 XOF. Ce sont les valeurs de la logique de calcul, pas une indication de frais de paiement tiers éventuels.",
            "en": "The top-up rate is XOF 2.5 per credit; the minimum top-up is 200 credits, or 500 XOF. The amount is rounded to the nearest XOF. Calculated examples: 200 credits = 500 XOF; 1,000 credits = 2,500 XOF. These are the calculation values, not a statement about possible third-party payment fees."
          }
        ],
        "steps": [
          {
            "fr": "Dans « Solde Studio », cliquez sur « Recharger », saisissez un entier d’au moins 200 crédits et vérifiez le montant XOF affiché.",
            "en": "Under “Studio balance,” click “Top up,” enter a whole number of at least 200 credits, and check the displayed XOF amount."
          },
          {
            "fr": "Continuez vers le prestataire de paiement uniquement si le montant vous convient. Après paiement, vérifiez la confirmation et le solde ; si le résultat est incertain, vérifiez l’opération existante avant de payer une seconde fois.",
            "en": "Proceed to the payment provider only if you accept the amount. After payment, check confirmation and balance; if the result is uncertain, check the existing transaction before paying again."
          }
        ]
      },
      {
        "id": "credits-budgets-distinct",
        "title": {
          "fr": "Abonnement, crédits et budget publicitaire",
          "en": "Subscription, credits and advertising budget"
        },
        "paragraphs": [
          {
            "fr": "L’abonnement ouvre l’accès au service, les crédits financent les créations Studio et le budget média est facturé par le réseau publicitaire au compte sélectionné. Payer l’un ne crédite pas automatiquement les deux autres. Les frais réels et les éventuels frais de paiement sont à relire dans chaque récapitulatif.",
            "en": "The subscription provides access to the service, credits fund Studio creations, and media spend is billed by the ad platform to the selected ad account. Paying for one does not automatically fund the other two. Review actual charges and any payment fees in each summary."
          },
          {
            "fr": "Les crédits peuvent être réservés pendant une création puis confirmés selon les étapes réalisées. Un échec de connexion ne prouve ni que rien n’a été produit ni que les crédits ont été rendus. Consultez l’historique et le solde avant une nouvelle tentative, puis demandez une vérification avec l’identifiant visible si nécessaire.",
            "en": "Credits may be reserved while a creation runs and then confirmed according to completed stages. A connection failure does not prove that nothing was produced or that credits were restored. Check history and balance before trying again, and request a review using the visible ID if needed."
          }
        ]
      }
    ]
  },
  {
    "id": "studio-notifications-recovery",
    "group": "manage",
    "title": {
      "fr": "Relances WhatsApp et notifications",
      "en": "WhatsApp follow-ups and notifications"
    },
    "summary": {
      "fr": "Préparez les relances de ventes dans WhatsApp et choisissez les notifications de cet appareil, sans confondre message préparé et message envoyé.",
      "en": "Prepare sales follow-ups in WhatsApp and choose notifications for this device, without confusing a prepared message with a sent one."
    },
    "articles": [
      {
        "id": "whatsapp-scope",
        "title": {
          "fr": "WhatsApp : périmètre réel",
          "en": "WhatsApp: actual scope"
        },
        "paragraphs": [
          {
            "fr": "Ouvrez Relances WhatsApp pour consulter les ventes ou abandons proposés à la relance. Lorsqu’un téléphone et un lien de paiement exploitables sont présents, l’action prépare un message et ouvre WhatsApp. Vous devez relire puis envoyer le message vous-même ; préparer le brouillon n’enregistre ni consentement du destinataire ni preuve d’envoi.",
            "en": "Open WhatsApp follow-ups to review sales or abandoned checkouts offered for follow-up. When a usable phone number and payment link are present, the action prepares a message and opens WhatsApp. You must review and send it yourself; preparing the draft records neither recipient consent nor proof of delivery."
          },
          {
            "fr": "Dans la création publicitaire, « Statut WhatsApp » est un placement Meta. L’interface indique que sa diffusion est accompagnée des Stories Instagram et que le clic ouvre le lien de destination, pas une conversation WhatsApp. Ne le confondez pas avec une alerte personnelle.",
            "en": "In ad creation, “WhatsApp Status” is a Meta placement. The interface explains it runs alongside Instagram Stories and clicks open the destination link, not a WhatsApp conversation. Do not confuse it with a personal alert."
          }
        ],
        "steps": [
          {
            "fr": "Vérifiez la vente concernée, le destinataire et le lien de paiement. Ne contactez que les personnes pour lesquelles vous disposez d’une base et des permissions appropriées.",
            "en": "Check the sale, recipient and payment link. Contact only people for whom you have an appropriate basis and permissions."
          },
          {
            "fr": "Ouvrez le brouillon WhatsApp, personnalisez-le et envoyez-le seulement après vérification. Respectez toute demande de désinscription ; ne multipliez pas les relances.",
            "en": "Open the WhatsApp draft, personalize it and send only after review. Respect opt-outs and avoid repeated follow-ups."
          },
          {
            "fr": "Si la fenêtre est bloquée, utilisez l’aperçu du brouillon proposé et vérifiez les réglages de fenêtres surgissantes. Un téléphone ou lien absent peut rendre l’action indisponible.",
            "en": "If the window is blocked, use the provided draft preview and check popup settings. A missing phone number or payment link can make the action unavailable."
          }
        ]
      },
      {
        "id": "notifications-permissions",
        "title": {
          "fr": "Notifications et autorisations",
          "en": "Notifications and permissions"
        },
        "paragraphs": [
          {
            "fr": "Vendeo peut proposer d’activer les notifications sur cet appareil. Si vous acceptez, le navigateur demande son autorisation et l’appareil peut s’inscrire aux notifications push. La demande n’apparaît que lorsque le navigateur et l’appareil sont compatibles et que la page est sécurisée. Vous pouvez choisir « Plus tard » ; ce choix est mémorisé pendant sept jours. Refuser ou différer n’empêche pas d’utiliser le Studio.",
            "en": "Vendeo may offer to enable notifications on this device. If you agree, the browser asks for permission and the device can subscribe to push notifications. The prompt appears only when the browser and device support it and the page is secure. You can choose “Later”; that choice is remembered for seven days. Declining or deferring does not prevent Studio use."
          }
        ],
        "steps": [
          {
            "fr": "Pour activer, choisissez « Activer » dans la demande puis acceptez l’autorisation du navigateur. Si vous avez déjà accordé l’autorisation, mais que l’inscription échoue, vérifiez la connexion et réessayez depuis le message affiché.",
            "en": "To enable notifications, choose “Enable” in the prompt and then allow them in your browser. If permission is already granted but registration fails, check your connection and retry from the message shown."
          },
          {
            "fr": "Sur iPhone ou iPad, l’activation peut nécessiter d’ajouter Vendeo à l’écran d’accueil et d’ouvrir l’application depuis cette icône. Les notifications restent propres à l’appareil : vérifiez aussi les réglages de notifications de votre navigateur ou de votre système.",
            "en": "On iPhone or iPad, enabling notifications may require adding Vendeo to the Home Screen and opening it from that icon. Notifications are device-specific; also check your browser or system notification settings."
          },
          {
            "fr": "Le suivi d’une création reste accessible dans l’historique Studio. N’interprétez pas la permission push comme une promesse de SMS, de message WhatsApp ou de livraison garantie d’une création.",
            "en": "Creation tracking remains available in Studio history. Push permission is not a promise of SMS, WhatsApp messages, or guaranteed delivery of a completed creation."
          },
          {
            "fr": "N’accordez que les autorisations demandées par une fonctionnalité que vous avez choisie ; aucune permission de notifications n’est nécessaire au simple suivi Studio décrit ici.",
            "en": "Grant only permissions requested by a feature you chose; no notification permission is needed for the Studio tracking described here."
          }
        ]
      },
      {
        "id": "recover-work",
        "title": {
          "fr": "Reprendre après fermeture ou interruption",
          "en": "Resume after closing or interruption"
        },
        "paragraphs": [
          {
            "fr": "Si vous fermez le Studio pendant une création, rouvrez-le dans le même navigateur et vérifiez l’historique avant de recommencer. Cela évite une seconde génération payante lorsque le résultat de la première tentative est encore en cours. Une progression peut rester estimée et ralentir jusqu’à l’assemblage final.",
            "en": "If you close Studio during a creation, reopen it in the same browser and check history before restarting. This helps avoid a second paid generation while the first result is still processing. Progress may be estimated and slow while final assembly completes."
          }
        ],
        "steps": [
          {
            "fr": "Rouvrez le Studio avec le même navigateur si vous venez de fermer l’onglet, puis laissez la vérification du suivi se terminer.",
            "en": "Reopen Studio in the same browser if you just closed the tab, then let task recovery finish."
          },
          {
            "fr": "Si le résultat n’est pas immédiatement visible, consultez l’historique avant de relancer. Ne videz pas les données du navigateur avant d’avoir vérifié le statut.",
            "en": "If the result is not immediately visible, check history before retrying. Do not clear browser data before checking the status."
          }
        ]
      }
    ]
  },
  {
    "id": "studio-account-settings",
    "group": "manage",
    "title": {
      "fr": "Paramètres du compte",
      "en": "Account settings"
    },
    "summary": {
      "fr": "La section Paramètres regroupe langue, boutiques et abonnement, connexions de réseaux, session et suppression du compte.",
      "en": "Settings brings together language, stores and subscription, social connections, session, and account deletion."
    },
    "articles": [
      {
        "id": "settings-language",
        "title": {
          "fr": "Changer la langue de Vendeo",
          "en": "Change Vendeo’s language"
        },
        "paragraphs": [
          {
            "fr": "Dans Paramètres, ouvrez Apparence et choisissez Français ou English. Le choix actualise la langue de l’interface ; il ne traduit pas automatiquement les textes publicitaires ou prompts que vous avez déjà rédigés.",
            "en": "In Settings, open Appearance and choose Français or English. This changes the interface language; it does not automatically translate ad copy or prompts you have already written."
          }
        ],
        "steps": [
          {
            "fr": "Ouvrez Paramètres, puis Apparence et sélectionnez la langue souhaitée.",
            "en": "Open Settings, then Appearance, and select your preferred language."
          },
          {
            "fr": "Revenez à votre espace : les libellés de l’application s’affichent dans la langue choisie.",
            "en": "Return to your workspace; the app labels will use the selected language."
          }
        ]
      },
      {
        "id": "settings-profile-password",
        "title": {
          "fr": "Profil et mot de passe",
          "en": "Profile and password"
        },
        "paragraphs": [
          {
            "fr": "Les paramètres visibles permettent notamment de régler la langue, gérer les comptes de réseaux connectés, accéder aux boutiques et à l’abonnement, se déconnecter ou supprimer le compte. Aucun formulaire de modification du profil ou du mot de passe n’est proposé dans cette vue Paramètres ; n’y cherchez pas une fonction de changement de mot de passe.",
            "en": "The visible settings let you change the language, manage connected social accounts, open stores and subscription, sign out, or delete your account. This Settings view does not offer a profile-edit or password-change form; do not expect a password-change control here."
          },
          {
            "fr": "Pour retrouver l’accès si vous avez oublié votre mot de passe, utilisez Mot de passe oublié sur la page de connexion, puis le lien reçu par e-mail. Ne transmettez jamais ce lien ni un code de connexion à une autre personne.",
            "en": "If you forgot your password, use Forgot password on the login page, then follow the link sent by email. Never share that link or a sign-in code."
          }
        ]
      },
      {
        "id": "settings-social-connections",
        "title": {
          "fr": "Gérer les comptes de réseaux connectés",
          "en": "Manage connected social accounts"
        },
        "paragraphs": [
          {
            "fr": "Dans Paramètres, les connexions Meta, TikTok et Pinterest peuvent être consultées et déconnectées. La connexion ou la déconnexion d’un réseau est distincte de la suppression de votre compte Vendeo. Si une connexion échoue, vérifiez le message affiché et réessayez plus tard.",
            "en": "Settings lets you view and disconnect Meta, TikTok, and Pinterest connections. Connecting or disconnecting a social network is separate from deleting your Vendeo account. If a connection fails, check the message shown and try again later."
          }
        ]
      },
      {
        "id": "settings-delete-account",
        "title": {
          "fr": "Supprimer le compte Vendeo",
          "en": "Delete your Vendeo account"
        },
        "paragraphs": [
          {
            "fr": "La suppression du compte se trouve dans Paramètres, section Session. Elle est irréversible et demande une confirmation dans une fenêtre dédiée. Avant de confirmer, récupérez les fichiers ou informations dont vous avez besoin. Si la suppression échoue, le message d’erreur s’affiche dans les paramètres ; ne répétez pas la demande sans vérifier son état.",
            "en": "Account deletion is in Settings, under Session. It is irreversible and requires confirmation in a dedicated dialog. Before confirming, save any files or information you need. If deletion fails, an error appears in Settings; check the status before trying again."
          }
        ],
        "steps": [
          {
            "fr": "Ouvrez Paramètres puis Session et choisissez « Supprimer le compte ».",
            "en": "Open Settings, then Session, and choose “Delete account.”"
          },
          {
            "fr": "Lisez l’avertissement, puis confirmez uniquement si vous souhaitez réellement supprimer votre compte.",
            "en": "Read the warning, then confirm only if you truly want to delete your account."
          }
        ]
      }
    ]
  },
  {
    "id": "studio-privacy-security",
    "group": "manage",
    "title": {
      "fr": "Confidentialité et sécurité",
      "en": "Privacy and security"
    },
    "summary": {
      "fr": "Votre historique et vos créations sont associés à votre compte. Protégez vos contenus et vos moyens d’accès.",
      "en": "Your history and media are associated with your account. Download links may be temporary; protect your content and sign-in details."
    },
    "articles": [
      {
        "id": "privacy-storage",
        "title": {
          "fr": "Accès à l’historique et aux médias",
          "en": "History and media access"
        },
        "paragraphs": [
          {
            "fr": "Votre historique et vos médias sont associés à votre compte. Les liens de téléchargement peuvent expirer ou être temporairement indisponibles ; cela ne signifie pas que le fichier a été supprimé. Cette protection ne garantit pas une conservation permanente ni l’absence d’incident.",
            "en": "Your history and media are associated with your account. Download links can expire or be temporarily unavailable; that does not mean the file has been deleted. This safeguard does not guarantee permanent storage or freedom from incidents."
          }
        ]
      },
      {
        "id": "privacy-inputs",
        "title": {
          "fr": "Ce qu’il est prudent de fournir",
          "en": "What to provide safely"
        },
        "paragraphs": [
          {
            "fr": "Fournissez uniquement des descriptions et images que vous avez le droit d’utiliser. Évitez les données personnelles sensibles, mots de passe, jetons, données clients ou secrets dans les prompts et références. Les images de référence doivent être accessibles et respectent les formats indiqués ; pour le diaporama, toute référence est utilisée seulement pour les éléments visibles et ne justifie pas d’inférer des détails cachés.",
            "en": "Provide only descriptions and images you have the right to use. Avoid sensitive personal data, passwords, tokens, customer data, or secrets in prompts and references. Reference images must be accessible and use the stated formats; for slideshows, references are used only for visible details and do not justify inferring hidden information."
          }
        ],
        "steps": [
          {
            "fr": "Retirez les données confidentielles d’un prompt avant de le soumettre ; partagez uniquement les faits nécessaires à la création.",
            "en": "Remove confidential data from a prompt before submitting; share only facts needed for the creation."
          },
          {
            "fr": "N’envoyez jamais votre mot de passe ou un code de connexion à l’assistance ; communiquez plutôt l’identifiant de création visible et l’heure approximative.",
            "en": "Never send your password or a sign-in code to support; share the visible creation ID and approximate time instead."
          }
        ]
      },
      {
        "id": "privacy-content-rights",
        "title": {
          "fr": "Droits sur les images, textes et musique",
          "en": "Rights in images, text, and music"
        },
        "paragraphs": [
          {
            "fr": "Vous devez disposer des droits nécessaires sur les images importées, le texte et les marques que vous fournissez. Une licence musicale CC0, domaine public ou CC BY ne garantit pas à elle seule que tous droits sur un enregistrement, une composition, une interprétation ou une synchronisation commerciale sont validés. Vérifiez la page source et les restrictions de la piste avant publication.",
            "en": "You need the necessary rights to supplied images, text, and marks. A CC0, public-domain, or CC BY music label does not by itself guarantee that every right in a recording, composition, performance, or commercial synchronization is cleared. Check the source page and track restrictions before publishing."
          }
        ],
        "links": [
          {
            "href": "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
            "label": {
              "fr": "Réutiliser le contenu Wikimedia Commons",
              "en": "Reusing Wikimedia Commons content"
            }
          },
          {
            "href": "https://creativecommons.org/licenses/by/4.0/",
            "label": {
              "fr": "Résumé CC BY 4.0",
              "en": "CC BY 4.0 deed"
            }
          }
        ]
      }
    ]
  },
  {
    "id": "studio-troubleshooting",
    "group": "manage",
    "title": {
      "fr": "Dépannage et FAQ",
      "en": "Troubleshooting and FAQ"
    },
    "summary": {
      "fr": "Vérifiez le message exact, l’historique et le solde avant de réessayer ; ne lancez pas plusieurs créations lorsqu’une opération payante est incertaine.",
      "en": "Check the exact message, history, and balance before retrying; do not launch duplicate creations when a paid operation is uncertain."
    },
    "articles": [
      {
        "id": "insufficient-details",
        "title": {
          "fr": "Le diaporama indique que les détails sont insuffisants",
          "en": "The slideshow says product details are insufficient"
        },
        "paragraphs": [
          {
            "fr": "Le plan exige assez d’arguments distincts issus de la description pour composer les trois images produit, en plus de l’accroche. Si ces éléments manquent, ajoutez des caractéristiques vérifiables et différentes dans la fiche ou le champ de description. Le contrôle est conçu pour éviter des affirmations inventées ; ne remplissez pas le texte avec des avis, statistiques ou résultats non sourcés.",
            "en": "The plan needs enough distinct arguments from the description to create the three product images, in addition to the hook. If details are missing, add distinct, verifiable features to the product record or description. This check prevents invented claims; do not fill the text with unsourced reviews, statistics, or outcomes."
          }
        ],
        "steps": [
          {
            "fr": "ajoutez trois faits ou contenus produit distincts, exacts et étayés ; conservez séparément un éventuel objectif explicite pour l’accroche.",
            "en": "Add three distinct, accurate, supported product facts or contents; keep any explicit objective for the hook separate."
          },
          {
            "fr": "Relancez seulement après avoir vérifié l’historique et confirmé qu’aucune génération payante précédente n’est en cours.",
            "en": "Retry only after checking history and confirming no previous paid generation is still in progress."
          }
        ]
      },
      {
        "id": "insufficient-balance",
        "title": {
          "fr": "Solde insuffisant ou coût inattendu",
          "en": "Insufficient balance or unexpected cost"
        },
        "paragraphs": [
          {
            "fr": "Une image exige le coût associé à la qualité et résolution choisies ; le diaporama produit cinq visuels. Vérifiez la résolution, la qualité et le nombre de créations antérieures dans l’historique. Des crédits peuvent être temporairement réservés séparément du solde disponible pendant le traitement.",
            "en": "An image requires the cost associated with the chosen quality and resolution; a slideshow produces five visuals. Check resolution, quality, and earlier creations in history. Reserved credits can also be shown separately from the available balance while work is processing."
          }
        ],
        "steps": [
          {
            "fr": "Vérifiez les crédits disponibles et réservés dans « Solde Studio ».",
            "en": "Check available and reserved credits under “Studio balance.”"
          },
          {
            "fr": "Si vous choisissezsez de recharger, vérifiez le minimum et le montant calculé avant de poursuivre vers le paiement ; si le débit semble incorrect, contactez le support avec des informations non sensibles.",
            "en": "If you choose to top up, check the minimum and calculated amount before proceeding to payment; if a debit looks incorrect, contact support with non-sensitive information."
          }
        ]
      },
      {
        "id": "task-error-faq",
        "title": {
          "fr": "Une tâche échoue, reste bloquée ou un aperçu manque",
          "en": "A task fails, stalls, or a preview is missing"
        },
        "paragraphs": [
          {
            "fr": "Un aperçu ou un lien de média peut être temporairement inaccessible alors qu’une tâche a bien été acceptée. Le pourcentage de progression est estimé et l’assemblage peut prendre plus longtemps que les images. Ne déduisez pas d’une attente ou d’une erreur réseau que la création doit être relancée.",
            "en": "A preview or media link can be temporarily unavailable even though a task was accepted. Progress is estimated and assembly can take longer than the images. Do not infer from a delay or network error that generation must be restarted."
          },
          {
            "fr": "Le Studio restaure les tâches et les étapes déjà enregistrées. Rouvrez-le et attendez la vérification ; vérifiez ensuite les images sources et le résultat final dans l’historique. Si un état reste incertain ou un crédit est consommé sans résultat accessible, conservez l’identifiant et demandez une vérification avant une nouvelle opération payante.",
            "en": "Studio restores recorded tasks and stages. Reopen it and allow the check to finish, then review source images and the final result in history. If status remains uncertain or credits were used without an accessible result, keep the ID and request a review before another paid operation."
          }
        ],
        "steps": [
          {
            "fr": "Actualisez l’historique ou rouvrez le Studio, puis attendez que le suivi se rétablisse. Pour « Visuel inaccessible », consultez l’historique sans relancer.",
            "en": "Refresh history or reopen Studio, then allow tracking to recover. For “Image unavailable,” check history without regenerating."
          },
          {
            "fr": "Si la tâche est échouée et qu’aucun résultat n’apparaît, conservez son identifiant, vérifiez le solde, puis contactezz l’assistance avant une nouvelle tentative si un crédit a été consommé ou demeure incertain.",
            "en": "If the task failed and no result appears, keep its ID, check your balance, and contact support before retrying if credits were consumed or remain uncertain."
          }
        ]
      }
    ]
  }
];
