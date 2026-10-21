# Diaporama Studio — publication Production

## Publication autorisée
Le diaporama validé est désormais disponible sur Vercel Preview et Production pour les utilisateurs authentifiés. Le contrôle d’abonnement/crédits des nouvelles images, les cinq visuels obligatoires, les contrôles de propriété et les limites de requêtes restent inchangés. Le montage et le remplacement audio réutilisent les images existantes. La génération vidéo par fournisseur et les scènes de personnages restent verrouillées. Aucune génération réelle n’est déclenchée pour ce déploiement.

Les sections suivantes conservent l’historique de préparation ; leurs mentions « Preview uniquement » ne décrivent plus le verrou d’environnement du diaporama publié.

# Historique de préparation vidéo

## État actuel de la préversion — cinq visuels et musique audible

Cette section remplace les anciennes limites de nombre de visuels et de mixage décrites plus bas, qui sont conservées comme historique.

Chaque nouveau diaporama comporte **exactement cinq images**, jamais deux à quatre : une accroche avec une invitation à poursuivre, trois visuels promotionnels issus des informations réelles du produit et un CTA adapté à l’objectif. Le nombre ne dépend pas de la durée. S’il manque trois faits distincts, le storyboard reprend uniquement les faits disponibles ou l’identité du produit avec des compositions différentes et affiche un avertissement ; il n’invente ni fonctionnalités ni bénéfices. Love-pic reste une référence de hiérarchie visuelle, pas un modèle à copier.

L’interface privilégie 10 secondes pour la lisibilité ; 5 secondes reste disponible avec avertissement de rythme rapide. Le serveur recompile les prompts et refuse tout compte différent de cinq avant les opérations payantes. Le montage et le remplacement audio ne génèrent aucune image. Le remix reste compatible avec les anciens rendus de deux à cinq images et conserve le flux vidéo sans le réencoder.

La musique n’est plus atténuée à 35 %. Un traitement commun au rendu, au remix et à l’aperçu vise **-16 LUFS**, avec un plafond true-peak de **-2 dBTP**, un limiteur de sécurité et un fondu de sortie de 0,35 s. Les crédits musicaux, sources et licences restent disponibles et la transformation est mentionnée dans l’attribution. Une vidéo déjà exportée n’est pas modifiée automatiquement : son audio doit être remplacé pour bénéficier du nouveau mixage.

La validation de cette correction n’appelle aucun modèle image ou vidéo et ne consomme aucun crédit Studio : storyboard et parcours UI simulés, refus HTTP de 0 à 4 et plus de 5 images, montage FFmpeg local à cinq images avec les binaires embarqués, mesure de niveau sur source synthétique faible, contrôle des crêtes après AAC et identité du flux vidéo après remix. Un nouveau test réel de génération de cinq images nécessite une autorisation distincte. Le mode personnages et la génération vidéo par modèle restent verrouillés ; aucun changement de Production ni lancement publicitaire.


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
