# Préparation Studio avant toute décision de mise en production

**État au 1 novembre 2026.** Aucun secret n’a été lu ou exposé; aucun upload média réel, webhook live, paramètre Vercel, domaine, variable Production, merge ou migration distante n’a été utilisé ou modifié. Après autorisation explicite, les pushes de cette branche ont déclenché les seules préversions Vercel de `chariow` et `vendeo`; les checks des deux projets ont réussi sur la révision `9147b70`. Aucun déploiement Production n’a été fait. `STUDIO_MEDIA_CLOUDINARY_IMPORT` reste désactivé par défaut, et `POST /api/studio/video` renvoie toujours `423 STUDIO_VIDEO_LOCKED`.

## Ce qui est désormais validé localement

Les six migrations ventes/Studio du 1er novembre s’appliquent dans un cluster PostgreSQL 16.15 jetable et isolé, avec WAL logique et `pg_cron`. Les quatre suites SQL rollback-only — confidentialité/Realtime, quotas, transitions débit-remboursement et leases/callbacks — passent. Les deux scripts de concurrence passent : dix réservations simultanées n’en acceptent que deux pour les images (limite 2) et une pour la vidéo (limite 2 avec une place déjà occupée); dix callbacks concurrents ne produisent qu’un lease, et un callback expiré en course avec le timeout ne débite pas et ne consomme pas de quota. Les tests prouvent les politiques RLS visées, l’appartenance des tables à la publication Realtime, les transitions atomiques de crédit/quota et les reprises idempotentes des callbacks. Ils ne remplacent pas la stack Supabase complète : aucun client Realtime ou flux d’événements Supabase n’a pu être démarré ici.

La suppression des données client après 90 jours efface `raw_payload`; `customer_id`, généré à partir de ce JSON, devient donc nul pour ces ventes. Les colonnes de vente, montant, devise, statut, produit et date restent distinctes et ne sont pas supprimées par cette minimisation. Les totaux de ventes/chiffre d’affaires restent calculables, mais les métriques d’identification client — clients uniques/récurrents et rapprochements par client — deviennent incomplètes au-delà de 90 jours; les comparaisons historiques qui traversent cette fenêtre peuvent sous-compter les clients. Toute présentation de ces métriques doit signaler cette limite de rétention.

## Cloudinary privé et diaporamas

Le rendu de diaporama sait maintenant résoudre un descripteur Cloudinary HMAC lié au propriétaire, demander un téléchargement `authenticated` signé, vérifier exactement l’origine et le chemin API Cloudinary, refuser les redirections, contrôler MIME/signature du fichier et borner sa taille. Les anciens chemins `<userId>/<asset>` de Supabase Storage restent acceptés. Quatre tests ajoutés couvrent le téléchargement privé, la compatibilité Supabase, les descripteurs forgés/propriétaires étrangers et les réponses de mauvais type ou contenu. Aucun média réel n’a été envoyé ni téléchargé : la compatibilité avec un compte Cloudinary réel reste à valider sur un environnement de prévisualisation autorisé avant d’activer le drapeau.

## Soumission vidéo fal.ai : blocage documenté, verrou maintenu

Le dépôt possède les migrations de quota, gardes de crédit, corrélation par `provider_request_id`, vérification de signature, leases et finalisation atomique des callbacks. En revanche, la route vidéo ne soumet aucun job : elle renvoie toujours HTTP 423. Il n’existe pas de worker durable/outbox, de réconciliateur général ni de chemin testé avec fal.ai réel. Le flux de callback ne peut retrouver une génération qu’à partir de l’identifiant provider déjà enregistré; une livraison avant cette écriture échoue à corréler.

La [documentation officielle de la queue fal.ai](https://fal.ai/docs/documentation/model-apis/inference/queue) décrit une queue durable, un `request_id` renvoyé par le submit, la reprise de l’exécution provider jusqu’à dix fois après certains échecs de runner, ainsi que les opérations de statut/résultat/annulation qui requièrent ce `request_id`. Elle précise qu’un `client_timeout` arrête l’attente du client, mais ne garantit pas l’arrêt du job. Je n’y ai trouvé aucune garantie documentée de clé d’idempotence pour `queue.submit()` ni de récupération d’un job lorsqu’on a perdu le `request_id`. La [politique officielle des webhooks](https://fal.ai/docs/documentation/model-apis/inference/webhooks) prévoit des livraisons répétées — jusqu’à 31 retries jusqu’à expiration du résultat, environ une heure, ou environ six minutes pour les résultats d’au moins 10 Ko — et recommande l’idempotence par `request_id`. Elle ne garantit ni la livraison permanente ni la facturation exactement une fois en cas de retries.

Le protocole requis avant de déverrouiller la route doit donc :

1. enregistrer une intention/outbox et réserver une seule fois crédits et quota avant tout appel distant; un worker détient un lease par génération;
2. utiliser une URL de callback corrélable à l’intention (jeton opaque stocké côté serveur) afin qu’un callback précoce puisse rattacher atomiquement `request_id` avant import/résultat;
3. rendre les transitions génération, débit, quota et remboursement idempotentes; un résultat terminal `ERROR` ou l’absence de sortie peut compenser une fois, mais un submit ambigu ne doit ni être resoumis automatiquement, ni être remboursé, ni libérer son quota sans preuve que le provider n’a pas accepté/terminé le travail;
4. ajouter un réconciliateur périodique et une file d’exceptions opérateur pour les intentions « acceptation inconnue » sans callback. Sans clé provider ou identifiant récupérable, ces dernières ne peuvent pas être résolues automatiquement de manière sûre;
5. tester l’arrêt après chaque frontière : intention, acceptation provider, retour/persistance de l’ID, callback avant persistance, livraison répétée, import média, timeout, compensation et concurrence. Le débit fal.ai lié aux retries provider reste à confirmer dans les conditions du compte; aucune garantie financière n’est supposée ici.

Les tests SQL actuels prouvent les leases et transitions après qu’un `request_id` existe. Ils ne prouvent pas la soumission distante, la déduplication provider, le recouvrement d’un identifiant perdu, le worker/outbox ou le callback réel. Ces mécanismes ne sont pas implémentés; le verrou HTTP 423 ne doit pas être levé.

## Dépendances

`npm audit` et `npm audit --omit=dev` comptent 23 avis modérés, zéro élevé et zéro critique. L’avis direct Workflow et ses dépendances transitives couvrent notamment `minimatch` (GHSA-g3hv-75wg-m249). Le `npm audit fix --dry-run` ne propose aucun changement de lockfile compatible; les versions Workflow 5.x verrouillées sont celles publiées actuellement (`workflow`/`@workflow/core` 5.2.3, `@workflow/next`/`@workflow/cli` 5.0.6). L’option automatique indiquée pour la chaîne principale est `workflow@2.0.6`, rétrogradation majeure. Aucun downgrade ni override non validé n’a été appliqué. Aucun correctif supplémentaire n’est actuellement démontré sûr et testable dans cette branche.

## Résultats et étapes encore nécessaires

- Vitest complet sur la branche : **1 985 tests réussis, 287 fichiers**; `origin/main` (base `6bad835`) : **1 976 tests, 281 fichiers**, tous réussis.
- TypeScript : `npx tsc --noEmit` réussi sur la branche et sur `origin/main`.
- PostgreSQL 16.15 temporaire, avec bootstrap minimal des rôles/auth/storage/publication : **102/102 migrations** appliquées. Suites SQL crédit, leases fal.ai, confidentialité/RLS ventes et quotas réussies; courses quota (10 réservations image/vidéo), callback (10 callbacks), et rétention Shopify (SQL et course à deux sessions) réussies. `pg_cron`, la publication et les politiques RLS sont vérifiés. Ce n’est pas la stack Supabase complète : le transport Realtime réel et la réception côté client restent à valider.
- Build : `npm run build` réussi sur la branche et sur `origin/main` (Next.js 15.5.28, compilation, lint/type checks et génération des pages statiques compris).
- Cloudinary : lecteur privé local et compatibilité legacy testés; intégration réelle non testée; drapeau toujours fermé.
- Vidéo fal.ai : producteur/outbox/réconciliateur non implémentés; route toujours verrouillée HTTP 423.
- Dépendances : `npm audit` et `npm audit --omit=dev` donnent **23 avis modérés, zéro élevé/critique** sur la branche. Sur `origin/main`, l’audit complet trouve 50 avis (16 modérés, 30 élevés, 4 critiques) et les dépendances de production 42 (12 modérés, 28 élevés, 2 critiques); l’audit courant se termine avec un code non nul à cause des 23 avis restants.

Avant toute décision Production, il reste à valider la stack Supabase/Realtime complète, à tester le lecteur via un compte Cloudinary de prévisualisation, à concevoir puis tester le protocole durable fal.ai sur un environnement isolé, et à obtenir une autorisation séparée pour tout déploiement Production. Aucune de ces étapes Production n’a été exécutée ici.
