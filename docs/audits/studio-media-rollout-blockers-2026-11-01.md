# Blocages avant activation du flux média Studio

**État au 1 novembre 2026 :** aucun secret, compte Cloudinary, webhook fal.ai, projet Vercel ou base distante n’a été utilisé ni modifié. L’import Cloudinary reste désactivé par défaut et `POST /api/studio/video` reste verrouillé en HTTP 423.

## Vidéo fal.ai : le verrou reste nécessaire

Le dépôt a déjà les fonctions SQL de quota vidéo, les gardes de crédit, la corrélation par identifiant provider, la vérification de signature fal.ai, les leases de callback, la finalisation atomique et des tests de compensation. Mais le producteur réel n’existe pas : `app/api/studio/video/route.ts` retourne toujours `STUDIO_VIDEO_LOCKED` et aucun chemin d’application n’appelle actuellement `createFalVideo()`.

Le point bloquant n’est pas l’absence d’un simple test unitaire. Une file distante et PostgreSQL ne partagent pas de transaction. Si fal.ai accepte `queue.submit()` puis que le client perd la réponse, que l’instance s’arrête ou que la sauvegarde locale de `request_id` échoue, le job peut tourner sans corrélation persistée. Le callback actuel cherche strictement `provider_request_id`; un callback avant cette écriture obtient `not_found`. Une nouvelle soumission peut créer un doublon facturable; rembourser ou libérer la place peut être incorrect si le job distant a bien démarré. Le statut expiré n’est repris que lorsqu’une route de lecture est appelée, pas par un réconciliateur périodique général.

Avant d’implémenter ou d’activer le producteur, il faut un protocole de soumission durable : écriture d’intention/outbox avant l’appel distant, worker qui réconcilie les états inconnus, clé d’idempotence provider vérifiée ou corrélation de callback récupérable, et règles explicites qui ne remboursent pas une soumission ambiguë. Il faut également un balayeur périodique des états bloqués, puis des tests injectant une panne après chaque frontière (réservation, acceptation provider, retour d’ID, écriture DB, callback précoce, import média, remboursement). Tant que ces mécanismes ne sont pas définis et testés, la route doit rester en 423; un mock du fournisseur ne prouverait pas l’atomicité distante.

Une validation de bout en bout nécessitera ensuite une clé fal.ai et un callback sur un environnement de prévisualisation isolé, ainsi que l’application et la validation des migrations sur une base locale/preview autorisée. Ces opérations n’ont pas été faites ici.

## Cloudinary : tests privés ajoutés, basculement global non autorisé

L’import testé en mock envoie l’URL fal.ai à l’API Cloudinary au lieu de télécharger les octets média dans la route; l’asset demandé est de type `authenticated`, et la sortie est un lien de téléchargement signé et éphémère. Le descripteur local est signé par HMAC et lié à l’utilisateur. Les réponses du fournisseur sont recoupées avec le type, l’identifiant attendu et le format. Le chemin Supabase historique rejette désormais les hôtes non fal.ai, les schémas non HTTPS, les redirections, les réponses sans MIME explicite, les contenus dont la signature binaire ne correspond pas au PNG/JPEG attendu et les corps trop volumineux.

Cependant, le drapeau `STUDIO_MEDIA_CLOUDINARY_IMPORT` couvre aussi les images consommées par le rendu des diaporamas. `lib/studio/slideshow-server.ts` charge encore les sources depuis Supabase Storage et attend des chemins de la forme `<userId>/<asset>`; il n’a pas de chemin de lecture des nouveaux descripteurs Cloudinary. Activer le drapeau sans adapter et tester ce consommateur casserait les diaporamas. Le drapeau doit rester `false` jusqu’à ce que le rendu lise les médias Cloudinary privés (ou qu’une stratégie de stockage séparée soit définie) et qu’une migration de données existantes soit décidée. Aucun objet ni compte Cloudinary réel n’a été migré ou modifié.

## Vérifications à effectuer avant Production

- Ne pas activer `STUDIO_MEDIA_CLOUDINARY_IMPORT` ni lever le verrou vidéo sur la base des seuls tests mockés.
- Concevoir la soumission vidéo durable, les reprises et la purge des objets importés en double; tester ces transitions sur PostgreSQL local isolé.
- Adapter et tester le lecteur des images Cloudinary dans le montage diaporama; définir la migration/compatibilité des anciens chemins Supabase privés.
- Provisionner les secrets et URL de callback uniquement dans l’environnement de prévisualisation autorisé, puis faire un test de bout en bout avant toute décision Production.
- Garder séparées les validations suivantes : tests locaux, revue de PR, configuration preview, puis autorisation distincte de déploiement Production.

## Audit des dépendances

Les dépendances directes vulnérables ont été mises à jour dans des versions corrigées compatibles avec leurs plages, notamment Next.js 15.5.28, Vitest 4.1.12 et Vite 7.3.7. `npm audit` et `npm audit --omit=dev` ne signalent plus d’avis élevé ou critique, mais affichent encore 23 avis modérés dans l’arbre Workflow 5.x (`@workflow/*`, `@oclif/*`, `ejs`, `minimatch`, etc.). Le correctif automatique proposé par npm rétrograderait Workflow vers 2.0.6 (changement majeur); cette rétrogradation n’a pas été appliquée sans revue de compatibilité.

Avis `minimatch` cité par l’audit : [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Les résultats d’audit sont locaux et ne signifient pas que des secrets ou services de Production ont été utilisés.
