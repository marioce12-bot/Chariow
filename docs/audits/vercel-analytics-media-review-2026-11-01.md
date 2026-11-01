# Audit Vercel, analytics et flux média

**Dépôt :** `marioce12-bot/Chariow` · branche `audit/render-portability-analytics-20261101` · base `6bad835`
**Décision d’architecture :** l’application reste sur Vercel. Aucune migration Render, aucun déploiement, aucune modification de variables de production et aucune migration Supabase distante n’ont été effectués.

## Résumé

Les changements de cette branche réduisent les appels répétés vers les données Chariow et les statuts Studio : cache analytique limité par utilisateur/boutique/période, déduplication des lectures concurrentes, invalidations à l’écriture, rafraîchissement analytique uniquement au premier chargement, au retour au premier plan si les données ont plus de 30 minutes, ou à la demande. Le polling rapide des tâches Studio est remplacé par Supabase Realtime et une lecture de réconciliation au focus. La fréquence des autres rafraîchissements a également été abaissée ou rendue dépendante de la visibilité.

Le dépôt contient **137 routes `/api/*`** et **15 pages `page.tsx`**. Le build final marque 11 pages statiques et 4 pages dynamiques (`/admin`, `/login`, `/shop/[slug]`, `/shop/[slug]/[produit]`); `/dashboard` et les formulaires auth sont des pages statiques côté Next. Deux route handlers supplémentaires hors `/api` sont dynamiques : `/auth/confirm` et `/shop/[slug]/buy/[produit]`. Le code permet d’identifier les routes susceptibles de coûter cher, mais **aucun trafic ni relevé de consommation du compte Vercel n’est fourni ici** : les fréquences ci-dessous sont des estimations déduites du code, pas des mesures de production et pas une prévision de facture.

Trois limites empêchent de considérer tous les volets média comme terminés en production : (1) la vidéo est déjà verrouillée dans la base et reste en HTTP 423; aucun producteur actuel ne soumet un job vidéo à fal.ai, donc le quota vidéo et le callback ne sont pas encore reliés à une génération réelle; (2) la voix off du diaporama passe par Gemini et son audio base64 est décodé, traité puis écrit dans un fichier temporaire par la fonction Vercel; (3) le montage final utilise FFmpeg dans une fonction et envoie le MP4 à Supabase depuis cette fonction. Le TTS, les pistes musicales et le MP4 final transitent donc encore par Vercel. Les changements locaux renforcent le callback et son timeout, mais ne remplacent pas le producteur vidéo manquant. Le verrou vidéo est conservé par prudence.

## Réductions de coûts livrées dans le code

- **Analytics Chariow :** cache serveur de 120 s par utilisateur, boutique et période dans `lib/chariow/analytics-cache.ts`, avec déduplication des requêtes simultanées; la réponse reste privée (`max-age=60`, `stale-while-revalidate=120`). Les upserts de ventes, notifications et mises à jour d’état ne sont plus exécutés sur un cache hit. Le résumé compact n’est pas recalculé deux fois dans le même parcours.
- **Navigateur :** `/api/analytics` n’a plus d’intervalle périodique. Les données sont gardées en mémoire pour l’espace de travail; un rechargement de secours intervient au retour au premier plan seulement si la lecture date d’au moins 30 minutes. Le bouton d’actualisation reste disponible. Une nouvelle vente reçue via Realtime invalide les données concernées.
- **Autres rafraîchissements visibles :** statuts de campagnes environ toutes les 10 min au premier plan; rapports Autopilot toutes les 15 min; notifications toutes les 12 min; dépenses par canal toutes les 12 min; heartbeat d’usage toutes les 60 s. Le contrôle Chariow à 30 s est local au navigateur et ne lance pas `/api/analytics`. L’ancien timer de vérification du budget Autopilot par campagne est retiré; l’état est vérifié à l’ouverture, au focus/retour d’onglet et à la demande.
- **Studio :** les lectures de statut image/diaporama utilisent une souscription Realtime à la ligne de génération, avec réconciliation au retour au premier plan plutôt qu’un GET toutes les 4 s. Les logs détaillés répétitifs par produit ont été retirés au profit de messages d’erreur concis.
- **Caches de boutiques :** listes de boutiques et paramètres de vitrine sont mis en cache à court terme, avec clés utilisateur-scopées pour les données privées et invalidation après les écritures, synchronisations et webhooks Chariow.
- **Cron :** le préchauffage hebdomadaire `/api/market/warm` est retiré de `vercel.json`. Quatre tâches restent planifiées sur trois horaires UTC distincts : synchronisation Chariow et expiration d’abonnement à 03:00, Shopify à 03:15 et rétention Shopify à 03:30. Les routes `/api/cron/autopilot` et `/api/cron/meta/sync` existent mais ne figurent pas dans ce fichier; leur éventuel appel par un ordonnanceur externe reste à confirmer.

Ces changements suppriment des requêtes connues et évitent des fetchs Chariow et des écritures redondantes. **Le gain en CPU, invocations et dollars n’est pas quantifiable sans les métriques avant/après du projet.**

## Mesurer Vercel chaque semaine

La documentation officielle Vercel décrit les métriques Fluid Compute et leur tarification dans [Functions usage and pricing](https://vercel.com/docs/functions/usage-and-pricing), les vues de fonctions dans [Observability](https://vercel.com/docs/observability), les durées dans [Function limitations](https://vercel.com/docs/functions/limitations) et les événements dans [Workflow pricing](https://vercel.com/docs/workflows/pricing).

Sur le plan Pro visé, les fonctions sont facturées à l’usage pour les invocations, le CPU actif et la mémoire provisionnée; l’attente d’I/O suspend le CPU actif, mais la mémoire continue d’être mesurée jusqu’à la fin de l’instance. Les erreurs comptent comme des invocations. La durée par défaut d’une fonction Fluid Compute est de 300 s; le plafond standard Pro peut être configuré jusqu’à 800 s (et une extension à 1 800 s est documentée en bêta). Nous ne relevons pas ces plafonds pour cette tâche : une fonction courte et bornée reste préférable. La tarification Workflow couvre exécutions, événements et données; une étape standard produit trois événements. Vérifier la grille et les quotas inclus au moment de l’activation du plan, sans supposer qu’un quota Hobby reste valable en Pro.

**Routine hebdomadaire proposée — elle n’est pas automatisée ici :**

1. Dans le projet Vercel, ouvrir **Observability → Functions**, choisir les 7 derniers jours et exporter/consigner pour chaque route : invocations, durée p50/p95/max, Active CPU, mémoire provisionnée, erreurs, région et APIs externes visibles. Comparer à la semaine précédente et au nombre d’utilisateurs actifs.
2. Trier d’abord `/api/analytics`, `/api/ad-campaigns/[id]/status`, les routes de synchronisation, les routes Studio/rendu/upload, `/api/chat`, le beacon public `/api/shop/track`, puis les webhooks. `/api/track` exige un utilisateur connecté. Distinguer invocations par visite de celles par campagne suivie ou événement reçu.
3. Examiner séparément la consommation Workflow : exécutions, événements par tâche, reprises et données écrites/rétenues. Une tâche qui refait la même étape ou se relance après une réponse perdue est un levier de coût.
4. Enregistrer l’évolution hebdomadaire des invocations, du CPU actif, de la mémoire provisionnée, des transferts médias et des coûts de fournisseurs (fal.ai, Cloudinary, Supabase, Meta/Shopify). Une forte attente réseau peut coûter peu en CPU tout en prolongeant la mémoire de fonction.

**Seuils d’alerte suggérés à créer dans Vercel et à ajuster après deux semaines de référence** (ce sont des seuils de pilotage, pas des alertes Vercel déjà configurées) :

- alerte budgétaire à 75 % du plafond de dépense choisi, puis critique à 90 %;
- invocations ou CPU d’une route en hausse de plus de 2× par rapport à sa médiane hebdomadaire, après comparaison avec les utilisateurs actifs;
- erreurs 5xx supérieures à 1 % sur 15 min pour une route authentifiée, ou taux de reprise fal/webhook qui monte;
- p95 supérieur à 10 s pour une route interactive non média; alerte à 60 s pour un traitement média et critique à 180 s, sans dépasser les durées de fonction configurées;
- consommation Workflow supérieure à 50 % du budget mensuel avant le milieu du cycle, ou à 80 % à tout moment.

Les chiffres observés doivent venir de Vercel et des fournisseurs, pas être déduits du code. Il n’existe pas dans le dépôt de télémétrie par route suffisante pour calculer le prix réel. Les règles Firewall/bot doivent être configurées manuellement : commencer par un débit raisonnable pour les endpoints publics `/api/shop/track` et `/api/attribution/touch` (dont la limite IP actuelle est en mémoire par instance); `/api/track` et `/api/push/subscription` exigent une authentification. Ne pas mettre de challenge navigateur sur les webhooks fal.ai, Chariow, Shopify ou SasPay, qui doivent recevoir leurs callbacks serveur et restent protégés par signature/idempotence.

## Inventaire des routes API

**La fréquence est une estimation du déclencheur visible dans le code, pas une mesure.** Le coût CPU indique le travail relatif d’une invocation; l’attente fournisseur et la mémoire provisionnée sont à suivre séparément. La plupart des données privées et mutations ne doivent pas recevoir de cache partagé.

| Groupe et chemins concernés | Fréquence probable | Dépendances / CPU estimé | Cache sûr |
|---|---|---|---|
| Analytics et commerce : `/api/analytics`, `/api/stores*`, `/api/tracking-quality`, `/api/recovery*`, `/api/sales/celebration` | Chargement/changement de boutique ou période; célébration sur événement; analytics désormais sans timer | Supabase + Chariow/Shopify; moyen à élevé aux cache miss, faible à moyen au cache hit | Analytics privé, 60 s HTTP / 120 s serveur; boutique liée à l’utilisateur; aucune cache partagée de réponse personnalisée |
| Performance publicitaire : `/api/meta/*` (dont `/api/meta/daily-spend`), `/api/tiktok/performance`, `/api/pinterest/performance`, `/api/ad-performance/geography`, `/api/creative-performance*`, `/api/attribution/*` sauf `/api/attribution/touch` | À l’ouverture, changement de période ou clic; statuts campagne environ toutes les 10 min par campagne active | Supabase + APIs Meta/TikTok/Pinterest; moyen, parfois élevé par lots ou agrégation | Résultats personnalisés : `private/no-store` ou cache privé bref si invalidation fiable; jamais partagé |
| Campagnes/Autopilot : `/api/ad-campaigns*`, `/api/autopilot/reports`, `/api/overview/campaign-history` | Clics et affichage; statuts au premier plan toutes les 10 min; rapports Autopilot toutes les 15 min | Supabase, Meta/TikTok; moyen, potentiellement élevé quand plusieurs campagnes sont surveillées | No-store pour statut, rapports et mutations |
| Connexions et synchronisation manuelle : 30 routes `/api/integrations/*`, `/api/stores/[id]/test`, `/api/market/radar`, `/api/market/warm` | Rare : clic, OAuth, test ou synchronisation déclenchée; `market/warm` n’est plus planifiée | Fournisseur connecté + Supabase; faible à moyen, synchronisations pouvant durer davantage | OAuth/secrets et résultats personnalisés non partagés; idempotence/limites fournisseur à surveiller |
| Studio (21 routes `/api/studio/*`) et uploads `/api/uploads/*` | Création par clic; reads d’historique/quota au chargement; tâches progressives; upload par fichier | fal.ai, Supabase Storage/Realtime, Cloudinary selon configuration; moyen à élevé; rendu FFmpeg peut être élevé | Statut/historique/quota `private/no-store`; médias privés et URL signées; éviter de mettre en cache les mutations |
| Chat et IA : `/api/chat*`, `/api/ai/*`, `/api/conversations*` | Par message/action utilisateur | Fournisseur IA, Supabase et plateformes publicitaires; CPU variable, latence fournisseur souvent dominante | Réponses individualisées; pas de cache partagé |
| Webhooks : `/api/webhooks/chariow/pulses`, `/api/webhooks/fal`, `/api/webhooks/saspay`, `/api/webhooks/shopify`, `/api/webhooks/supabase/auth` | À chaque événement provider; volume réel dépend du trafic | Supabase + fournisseur correspondant; faible à moyen, variable avec les effets secondaires | Jamais cachés; signature, corrélation, idempotence et réponses rapides |
| Crons : `/api/cron/chariow/sync`, `/api/cron/shopify/sync`, `/api/cron/shopify/retention`, `/api/cron/subscriptions/expire`, plus routes non planifiées `/api/cron/autopilot`, `/api/cron/meta/sync` | Quatre exécutions quotidiennes déclarées dans `vercel.json`, sur trois horaires UTC; fréquence externe des deux autres inconnue | Supabase + Shopify/Chariow/Meta/IA selon tâche; moyen à élevé | Écritures non cachées; vérifier pagination, durée, idempotence et déclencheur effectif |
| Boutique publique et suivi : `/api/shop/*` (dont le beacon public `/api/shop/track`), `/api/attribution/touch` (public, limite IP en mémoire), `/api/track` et `/api/push/subscription` (authentifiés) | Proportionnel aux visiteurs/événements; un coût unitaire faible peut s’accumuler | Supabase et stockage d’événements; faible par appel | Paramètres publiés peuvent avoir un cache très court et être invalidés; POST/beacons jamais cachés |
| Admin, compte, notifications et divers : `/api/admin/*`, `/api/account*`, `/api/notifications`, `/api/alerts`, `/api/onboarding`, `/api/subscription*`, `/api/feedback`, `/api/emails/signup`, `/api/csp-report` | Admin par visite/clic; notifications au plus toutes les 12 min au premier plan; reste rare ou événementiel | Principalement Supabase; paiement/email sur mutations; faible à moyen | Privé/no-store pour les données de compte et admin; pas de cache partagé |

L’inventaire exhaustif suivant liste chaque chemin détecté sous `app/api/**/route.ts` :

<details>
<summary>137 chemins API, par famille</summary>

- **account (2) :** `/api/account/preferences`, `/api/account`
- **ad-campaigns (7) :** `/api/ad-campaigns/[id]/autopilot/budget-limit`, `/api/ad-campaigns/[id]/autopilot`, `/api/ad-campaigns/[id]/launch`, `/api/ad-campaigns/[id]`, `/api/ad-campaigns/[id]/status`, `/api/ad-campaigns/previews`, `/api/ad-campaigns`
- **ad-performance (1) :** `/api/ad-performance/geography`
- **admin (13) :** `/api/admin/audit`, `/api/admin/credits`, `/api/admin/feedback`, `/api/admin/notifications`, `/api/admin/overview`, `/api/admin/password-login`, `/api/admin/password-logout`, `/api/admin/payouts`, `/api/admin/revenue`, `/api/admin/status`, `/api/admin/subscriptions`, `/api/admin/usage`, `/api/admin/users`
- **ai (3) :** `/api/ai/ad-copy`, `/api/ai/launch-campaign`, `/api/ai/poster`
- **alerts (1) :** `/api/alerts`
- **analytics (1) :** `/api/analytics`
- **attribution (3) :** `/api/attribution/campaigns/[id]/link`, `/api/attribution/campaigns`, `/api/attribution/touch`
- **autopilot (1) :** `/api/autopilot/reports`
- **campaign-mappings (1) :** `/api/campaign-mappings`
- **chat (3) :** `/api/chat/campaign-actions`, `/api/chat`, `/api/chat/upload`
- **conversations (2) :** `/api/conversations/[id]`, `/api/conversations`
- **creative-performance (3) :** `/api/creative-performance/ideas`, `/api/creative-performance/placements/[id]`, `/api/creative-performance`
- **cron (6) :** `/api/cron/autopilot`, `/api/cron/chariow/sync`, `/api/cron/meta/sync`, `/api/cron/shopify/retention`, `/api/cron/shopify/sync`, `/api/cron/subscriptions/expire`
- **csp-report (1) :** `/api/csp-report`
- **emails (1) :** `/api/emails/signup`
- **feedback (1) :** `/api/feedback`
- **integrations (30) :** `/api/integrations/chariow/callback`, `/api/integrations/chariow/connect/check`, `/api/integrations/chariow/connect`, `/api/integrations/chariow/disconnect`, `/api/integrations/chariow/sync`, `/api/integrations/meta/accounts`, `/api/integrations/meta/callback`, `/api/integrations/meta/connect`, `/api/integrations/meta/disconnect`, `/api/integrations/meta/geo-search`, `/api/integrations/meta/pixels/configure`, `/api/integrations/meta/resources`, `/api/integrations/pinterest/accounts`, `/api/integrations/pinterest/callback`, `/api/integrations/pinterest/connect`, `/api/integrations/pinterest/disconnect`, `/api/integrations/reddit/callback`, `/api/integrations/reddit/connect`, `/api/integrations/reddit/test-campaign`, `/api/integrations/shopify/callback`, `/api/integrations/shopify/connect/check`, `/api/integrations/shopify/connect`, `/api/integrations/shopify/disconnect`, `/api/integrations/shopify/install`, `/api/integrations/shopify/sync`, `/api/integrations/tiktok/accounts`, `/api/integrations/tiktok/callback`, `/api/integrations/tiktok/connect`, `/api/integrations/tiktok/disconnect`, `/api/integrations/tiktok/resources`
- **market (2) :** `/api/market/radar`, `/api/market/warm`
- **meta (7) :** `/api/meta/active-campaigns`, `/api/meta/backfill`, `/api/meta/daily-spend`, `/api/meta/diagnostic`, `/api/meta/history`, `/api/meta/performance`, `/api/meta/sync`
- **notifications (1) :** `/api/notifications`
- **onboarding (1) :** `/api/onboarding`
- **overview (1) :** `/api/overview/campaign-history`
- **pinterest (1) :** `/api/pinterest/performance`
- **push (1) :** `/api/push/subscription`
- **recovery (2) :** `/api/recovery/launch`, `/api/recovery`
- **sales (1) :** `/api/sales/celebration`
- **shop (4) :** `/api/shop/logo`, `/api/shop/storefronts/[id]`, `/api/shop/storefronts`, `/api/shop/track`
- **stores (3) :** `/api/stores/[id]`, `/api/stores/[id]/test`, `/api/stores`
- **studio (21) :** `/api/studio/credits/checkout`, `/api/studio/credits`, `/api/studio/history/[id]`, `/api/studio/history`, `/api/studio/image/edit`, `/api/studio/image`, `/api/studio/music`, `/api/studio/prompt`, `/api/studio/slideshow/config`, `/api/studio/slideshow/music/[id]/preview`, `/api/studio/slideshow/preflight`, `/api/studio/slideshow/remix`, `/api/studio/slideshow/render`, `/api/studio/tasks/[id]/continue`, `/api/studio/tasks/fixture`, `/api/studio/tasks`, `/api/studio/tasks/worker`, `/api/studio/video/[jobId]/content`, `/api/studio/video/[jobId]`, `/api/studio/video/quota`, `/api/studio/video`
- **subscription (2) :** `/api/subscription/checkout`, `/api/subscription`
- **tiktok (1) :** `/api/tiktok/performance`
- **track (1) :** `/api/track`
- **tracking-quality (1) :** `/api/tracking-quality`
- **uploads (2) :** `/api/uploads/campaign-media`, `/api/uploads/campaign-media/sign`
- **webhooks (5) :** `/api/webhooks/chariow/pulses`, `/api/webhooks/fal`, `/api/webhooks/saspay`, `/api/webhooks/shopify`, `/api/webhooks/supabase/auth`

</details>

## Pages et rendu

Les 15 pages sous `app/**/page.tsx` sont : `/`, `/about`, `/admin`, `/admin/login`, `/dashboard`, `/data-deletion`, `/docs`, `/forgot-password`, `/login`, `/privacy`, `/register`, `/reset-password`, `/shop/[slug]`, `/shop/[slug]/[produit]`, `/terms`. Le build marque `/admin`, `/login` et les deux pages de boutique comme dynamiques; les 11 autres pages, dont `/dashboard`, sont statiques côté Next. En dehors de `/api`, `app/auth/confirm/route.ts` et `app/shop/[slug]/buy/[produit]/route.ts` sont deux route handlers dynamiques. Les API clientes du dashboard représentent la consommation répétée à mesurer, même quand la page-shell est statique.

## Flux média et garde-fous

- **Images fal.ai :** les routes image appellent `generateStudioImage`/`lib/ai/fal.ts`; l’appel `fal.subscribe` attend le résultat dans la requête/étape serveur. Le client n’interroge plus le statut toutes les quelques secondes, mais ce parcours image n’a pas été transformé en callback asynchrone complet. Sans métriques de fonction, ne pas supposer que l’attente fournisseur est gratuite en mémoire provisionnée.
- **Import privé d’image :** `lib/studio/cloudinary-media.ts` peut demander à Cloudinary d’importer directement l’URL fal.ai en HTTPS; Vercel signe la requête, mais ne télécharge pas les octets source. Les assets utilisent le type `authenticated` et des URL de téléchargement signées à durée limitée. La documentation source est [Upload API](https://cloudinary.com/documentation/image_upload_api_reference) et [contrôle d’accès](https://cloudinary.com/documentation/control_access_to_media). Le mode est désactivé par défaut avec `STUDIO_MEDIA_CLOUDINARY_IMPORT=false`; si le mode est désactivé, le chemin Supabase actuel peut faire transiter l’image par la fonction Vercel.
- **Voix off et musique :** la narration n’utilise pas fal.ai. `synthesizeSlideshowVoice` appelle l’API Gemini depuis la dernière étape durable du Workflow; la réponse PCM/WAV base64 est décodée en mémoire (limite de 5 Mo), écrite en WAV temporaire et normalisée par FFmpeg. Les pistes musicales officielles sont téléchargées par Vercel, mises en cache dans le bucket privé Supabase Storage, puis relues dans le répertoire temporaire pour le montage. Ces octets audio transitent donc par la fonction. Le TTS est soumis à des gardes d’environnement et au palier gratuit Gemini confirmé; le code enregistre un coût de crédit nul pour la voix. Un diaporama complet conserve jusqu’à 7 étapes durables (préflight, 5 images, rendu); au tarif documenté de 3 événements par étape standard, cela représente environ 21 événements Workflow avant reprises. Le découpage par image est conservé pour isoler les échecs, les crédits et les reprises sans régénérer les étapes terminées; valider le coût réel dans Observability avant de le regrouper.
- **Diaporama :** `lib/studio/slideshow-server.ts` télécharge les sources et compose le MP4 localement avec FFmpeg/ffprobe, puis transmet le fichier à Supabase Storage depuis la fonction. Cette étape consomme CPU/durée, et les octets du rendu passent encore par Vercel. Le rendu a un plafond applicatif de 300 s; le binaire, la mémoire et le stockage temporaire doivent être vérifiés sur le runtime de production. Une suppression complète du transit nécessite de revoir l’architecture de rendu, pas seulement le cache Cloudinary.
- **Vidéo fal.ai :** `/api/studio/video` renvoie HTTP 423 depuis la base `6bad835`, et `STUDIO_VIDEO_LOCKED` reste `true`. Aucune route active n’appelle `createFalVideo`, ne réserve réellement un slot vidéo ou ne persiste le `provider_request_id`; les RPC de quota n’encadrent donc toujours pas une soumission réelle. Le callback vérifie la signature Ed25519/JWKS, borne le corps, corrèle le request ID et l’identité signés, puis réclame un bail SQL exclusif. Les statuts contradictoires sont refusés; l’import Cloudinary déjà persisté est réutilisé en cas de reprise. La RPC `complete_studio_video_callback` verrouille la génération, exige un bail non expiré et applique débit, consommation de quota et état `completed` dans une transaction unique. Si le bail expire ou si le timeout gagne la course, la finalisation refuse avant de facturer; si une étape SQL échoue, la transaction annule les changements précédents. Le timeout et les compensations restent protégés par des RPC idempotents. La migration locale `20261101163000_studio_video_callback_leases.sql` et les tests SQL/concurrence sont ajoutés, mais non appliqués à une base locale ou distante. Références : [fal.ai Webhooks](https://fal.ai/docs/documentation/model-apis/inference/webhooks) et [Queue API](https://fal.ai/docs/documentation/model-apis/inference/queue). Le verrou reste activé jusqu’à livraison et test d’un producteur complet — réservation, débit, soumission async, persistance du request ID, callback, compensation et rejeu.

## Données Chariow, RLS et rétention

Les migrations ajoutées limitent les événements `sales_events`, l’accès client aux lignes du propriétaire, et les écritures aux fonctions de confiance; la migration de confidentialité reconstruit le payload de vente sur une liste blanche et prévoit une purge quotidienne après 90 jours via `pg_cron`. Les données personnelles de livraison sont supprimées; le `customer_id` dérivé de `raw_payload` est recalculé quand ce payload est vidé, ce qui reste à confirmer par le test SQL. Une migration ajoute les quotas atomiques par utilisateur (2 vidéos/jour et 50 images/jour par défaut, dates UTC) et les permissions de lecture propriétaires. Une migration complémentaire protège les transitions de crédit contre `refunded → completed` et rend le remboursement répétable. La nouvelle migration de callback réserve ses RPC au rôle serveur `service_role`, sérialise claim/asset/clôture et rend débit, quota et état final atomiques sous un jeton de bail non expiré.

**Aucune migration n’a été appliquée à un projet distant.** Docker et la CLI Supabase sont absents; aucun environnement PostgreSQL local Supabase n’est configuré. Les scripts `scripts/tests/20261101_sales_events_privacy.sql`, `scripts/tests/20261101_studio_generation_quota.sql`, `scripts/tests/20261101_credit_transition_guards.sql`, `scripts/tests/20261101_fal_callback_leases.sql`, `scripts/tests/test-generation-quota-concurrency.sh` et `scripts/tests/test-fal-callback-concurrency.sh` restent donc à exécuter après `supabase db reset` dans un environnement local autorisé. Le test de concurrence fal couvre désormais dix claims, l’expiration d’un bail et la course succès/timeout avec assertion d’absence de débit ou consommation de quota.

## Vérifications effectuées

La base `6bad835` passe **1 976 tests sur 1 976**, TypeScript et build Next.js. La branche avec ces ajouts passe **2 038 tests sur 2 038** (293 fichiers), dont les 29 tests ciblés de callback et timeout vidéo; `npx tsc --noEmit` et `npm run build` réussissent aussi. Le build confirme 15 pages, dont 11 statiques et 4 dynamiques, ainsi que deux route handlers dynamiques hors `/api`. Le nombre historique de 2 016 tests n’a pas été reproduit sur ces deux arbres. Aucun test SQL Supabase n’a été exécuté, faute de Docker, de CLI Supabase et d’instance locale Supabase configurée. `npm ci` a signalé 50 avis sur les dépendances verrouillées (16 modérés, 30 élevés, 4 critiques); aucune mise à jour de dépendances n’a été faite dans cette tâche. Le dépôt n’a pas été déployé et aucune PR n’a été fusionnée.

## Actions de production à faire après revue

1. Passer à Pro et fixer un plafond de dépense dans le compte Vercel; confirmer qu’il s’applique au bon projet/équipe. Consulter les métriques une fois par semaine selon la routine ci-dessus.
2. Ajouter les variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` dans les environnements Vercel pertinents. Garder d’abord `STUDIO_MEDIA_CLOUDINARY_IMPORT=false`, tester import privé et URL signée, puis activer le flag si les résultats sont vérifiés. Aucun secret n’est inclus dans ce dépôt.
3. Exécuter et vérifier les migrations SQL dans un projet/local autorisé, dans l’ordre chronologique, puis lancer les scripts de confidentialité, quota, transition de crédits et concurrence. Ne pas considérer les fichiers locaux comme déployés.
4. Ne pas configurer ni ouvrir la génération vidéo à l’utilisateur avant le raccordement réel du submitter fal.ai et les tests de callbacks simultanés/rejoués, de timeout et de compensation. En particulier, le webhook seul ne crée pas de job.
5. Si l’objectif absolu devient « aucun octet média via Vercel », déplacer ou remplacer le rendu FFmpeg du diaporama par un mécanisme compatible; le mode Cloudinary actuel ne supprime que le transit de l’import fal.ai, pas le montage final.
6. Créer manuellement les règles Firewall/bot suggérées et les alertes budget/usage; aucune règle ni alerte n’a été modifiée depuis ce dépôt.

**Choix prudents appliqués :** aucun volet Render; aucune action de production; flag Cloudinary désactivé par défaut; verrou vidéo préexistant maintenu; les limites opérationnelles et tests non exécutés sont explicitement signalés plutôt que masqués.
