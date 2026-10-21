# Préparation vidéo — branche Preview uniquement

La génération vidéo reste verrouillée : onglet désactivé, garde interface et `POST /api/studio/video` renvoyant 423 après authentification. Aucun fournisseur image/vidéo n'a été appelé pour développer ou tester ces changements. Aucun changement sur main ou en Production n'est autorisé dans cette livraison. Le choix « Scènes avec personnages » est lui-même désactivé.

## Deux formats

**Diaporama animé** : compilation de prompts fidèles aux informations produit, destinés au modèle image configuré lors d'une future utilisation. Quatre images distinctes pour 60 s, transitions fondues enchaînées dont les chevauchements sont comptés dans la durée finale. Le worker préparé reçoit un générateur d'images et un assembleur par injection; pas d'appel caché depuis le panneau Preview.

**Scènes avec personnages** : sélection contextualisée entre présentation en main, conversation, interview publicitaire scénarisée, démonstration ou film produit. Les scénarios respectent les citations produit confirmées, les demandes sans personne et la référence réelle. Un ebook apparaît sur téléphone/tablette, pas comme une édition physique inventée. Une interview ne devient pas un faux témoignage.

Le fournisseur configuré par défaut et sans override vidéo présent dans les variables du projet est fal, Grok Imagine Video 1.5. Une génération est limitée à 15 s : pour 60 s, quatre prompts distincts de 15 s, progression accroche / présentation / intérêt confirmé / conclusion. Le pipeline séquentiel transmet une référence initiale optionnelle, puis la dernière image entre clips, et partage une continuité de casting, vêtements, lumière, décor et voix. Il refuse une continuité manquante, un clip trop court ou un échec partiel; pas de relance automatique payante. Ces consignes ne garantissent pas la fidélité visuelle du modèle réel : elle n'a pas été testée.

Sources de capacité : [API texte vers vidéo](https://fal.ai/models/xai/grok-imagine-video/v1.5/text-to-video/api), [API image vers vidéo](https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video/api), [limite 15 s](https://fal.ai/grok-imagine-video-1.5). L'API précise le champ durée et les résolutions. Les overrides de modèles non vérifiés sont refusés par le planificateur de capacités.

## Musique

Le panneau recherche dans les métadonnées publiques Wikimedia Commons, sans achat ni clé API, avec filtres d'ambiance, aperçu audio sur action explicite et informations source/licence/attribution par piste. Seules les licences déclarées CC0 ou domaine public passent le filtrage. Aucun fichier audio n'a été copié durant ce travail. Le catalogue est extensible mais ne constitue pas une grande collection de musiques publicitaires prévalidée et aucun nombre de pistes n'est garanti. Voir [les limites de licence](./studio-music-catalog.md).

L'identifiant musical choisi est conservé dans le plan diaporama. Avant toute image potentiellement payante, le futur worker doit résoudre cet identifiant, revérifier les droits du fichier et de l'enregistrement, puis fournir un chemin local autorisé. L'orchestrateur transmet ce chemin au montage et retourne l'attribution. Ce résolveur de téléchargement n'est pas installé : aucune copie automatique ou diffusion commerciale n'est activée.

## Tests réellement effectués

Les tests unitaires et routes utilisent uniquement des réponses simulées. Les tests d'assemblage utilisent ffmpeg/ffprobe localement : quatre clips de couleurs de 15 s, contrôle de l'ordre et durée finale d'environ 60 s; quatre images synthétiques avec un vrai fondu vérifié par échantillon de pixel, musique synthétique et durée finale d'environ 60 s. Aucune image ou vidéo IA ni musique commerciale n'a été générée pour ces tests. Après autorisation spécifique, un seul rendu représentatif supplémentaire a assemblé deux affiches préexistantes du « Pack spécial Promo » : 5,000 s, 720 × 900, fondu de 0,5 s, sans musique. Temps local : 9,131 s. Consommation nouvelle : zéro image, zéro appel fournisseur et zéro seconde vidéo IA. Ce test valide le montage avec des visuels produit existants, pas le générateur d’images ni un rendu de personnages.

Les tests historiques de fidélité image et de progression Studio sont inclus dans la validation. La suite globale comporte dix échecs préexistants dans `marketing-carousel.test.tsx` et `platform-marquee.test.tsx`, reproduits sur le commit main d'origine `130582d`. Ils ne sont pas corrigés par cette branche.

## Avant une activation ultérieure

Provisionner un worker durable avec ffmpeg/ffprobe, la persistance/reprise des jobs, le stockage des références entre segments, un adaptateur réel fal et modèle image, le téléchargement musical après contrôle de licence, les réservations/remboursements de crédits et la supervision. Les fonctions d'assemblage sont testées localement, mais ces composants ne sont pas raccordés au runtime Vercel. Aucun rendu fournisseur ni assemblage en Production n'est déclaré fonctionnel.
