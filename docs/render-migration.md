# Checklist de migration vers Render

Cette checklist prépare l’hébergement du site sur Render et laisse les routes `/api/studio/*` ainsi que les tâches durables `workflow` sur Vercel. Le [Blueprint Render](https://render.com/docs/blueprint-spec) du dépôt décrit un Web Service Starter avec déploiement automatique désactivé; il ne crée pas de service, ne déploie rien et ne modifie aucun domaine. Les valeurs des variables restent à saisir dans l’interface Render.

## 1. Variables à saisir

Le manifeste liste les variables détectées dans le code, sans valeur. Commencer par celles nécessaires au démarrage et à l’authentification : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_PASSWORD`, `ADMIN_PASSWORD_SECRET`, `CRON_SECRET`, `VENDEO_DEPLOYMENT_ENV` et `STUDIO_UPSTREAM_URL`.

Pour la production Render, saisir `VENDEO_DEPLOYMENT_ENV=production`. `STUDIO_UPSTREAM_URL` doit être une origine HTTPS directe du projet Vercel, par exemple `https://<projet>.vercel.app` : sans chemin, identifiants, paramètres ni fragment. Ne pas utiliser le domaine public qui pointera vers Render, afin d’éviter une boucle de proxy. Le proxy transmet uniquement les cookies Supabase `sb-*` et l’en-tête `Authorization`; il supprime l’attribut `Domain` des cookies d’authentification renvoyés par Vercel. Les requêtes navigateur doivent rester same-origin; les origines croisées sont refusées, donc aucun CORS permissif n’est prévu.

Renseigner ensuite les variables des intégrations effectivement activées : clés Meta/TikTok/Pinterest/Reddit/Shopify, Chariow et SasPay, Cloudinary, fournisseurs IA, e-mail et SerpAPI. Les entrées sont dans `render.yaml`; ne pas copier une valeur secrète dans le dépôt. Les variables d’URL/callback doivent correspondre exactement aux URL inscrites dans les consoles des fournisseurs. Render fournit `PORT`; ne pas le fixer manuellement. Le proxy coupe une requête après 285 secondes, pour rester sous le plafond de 300 secondes documenté pour une Vercel Function Hobby.

## 2. Studio et Vercel

Avant la bascule, conserver le projet Vercel opérationnel : il héberge encore les routes Studio et le moteur `workflow`. Déployer d’abord le site Render sur son URL temporaire `*.onrender.com`, renseigner `STUDIO_UPSTREAM_URL` avec l’hôte direct `.vercel.app`, puis vérifier une requête authentifiée, un refus 401 sans session, le renouvellement des cookies et une panne upstream. Vérifier aussi que les tâches déjà lancées continuent après la fermeture du navigateur.

Vercel Hobby est réservé à un usage personnel/non commercial selon les [conditions Vercel](https://vercel.com/legal/terms) et la [page du plan Hobby](https://vercel.com/docs/plans/hobby). Le quota Workflows indiqué est de 50 000 événements par mois et une fonction Hobby ne peut dépasser 300 secondes; consulter la [tarification Workflows](https://vercel.com/docs/workflows/pricing) et les [limites Functions](https://vercel.com/docs/functions/limitations). Si Vendeo est exploité commercialement, garder Studio sur Hobby constitue un blocage de conformité : décider d’un plan autorisé avant toute bascule. Aucun achat ni changement de plan n’est inclus ici.

## 3. URLs de callback et webhooks

Choisir d’abord l’origine publique finale, notée ci-dessous `https://<PUBLIC_DOMAIN>`. Pour chaque fournisseur utilisé, remplacer l’ancienne origine dans sa console et dans la variable correspondante, puis tester le retour d’authentification :

| Intégration | URL à enregistrer |
| --- | --- |
| Chariow OAuth — `CHARIOW_OAUTH_REDIRECT_URI` | `https://<PUBLIC_DOMAIN>/api/integrations/chariow/callback` |
| Meta OAuth — `META_OAUTH_REDIRECT_URI` | `https://<PUBLIC_DOMAIN>/api/integrations/meta/callback` |
| TikTok OAuth — `TIKTOK_OAUTH_REDIRECT_URI` | `https://<PUBLIC_DOMAIN>/api/integrations/tiktok/callback` |
| Pinterest OAuth — `PINTEREST_OAUTH_REDIRECT_URI` | `https://<PUBLIC_DOMAIN>/api/integrations/pinterest/callback` |
| Reddit OAuth — `REDDIT_OAUTH_REDIRECT_URI` | `https://<PUBLIC_DOMAIN>/api/integrations/reddit/callback` |
| Shopify OAuth — callback autorisée de l’app | `https://<PUBLIC_DOMAIN>/api/integrations/shopify/callback` |
| Shopify — URL de l’app (`SHOPIFY_APP_URL`) | `https://<PUBLIC_DOMAIN>` |
| Chariow Pulse webhook | `https://<PUBLIC_DOMAIN>/api/webhooks/chariow/pulses` |
| SasPay webhook | `https://<PUBLIC_DOMAIN>/api/webhooks/saspay` |
| Shopify webhook | `https://<PUBLIC_DOMAIN>/api/webhooks/shopify` |
| Supabase Auth Hook | `https://<PUBLIC_DOMAIN>/api/webhooks/supabase/auth` |

Mettre à jour les URI de rappel autorisées dans chaque console OAuth avant la bascule, puis vérifier les scopes, HTTPS et URL de déconnexion. Mettre à jour les webhooks uniquement après un test contrôlé de la route et de sa signature; les secrets restent à saisir dans les réglages sécurisés et ne changent pas automatiquement en changeant d’URL.

## 4. Tâches planifiées

`vercel.json` programme actuellement Chariow sync à `03:00 UTC`, Shopify sync à `03:15 UTC`, expiration des abonnements à `03:00 UTC`, réchauffement du marché le lundi à `04:00 UTC` et rétention Shopify à `03:30 UTC`. Ces tâches restent sur Vercel tant qu’elles ne sont pas explicitement déplacées; ne pas lancer une seconde planification en parallèle, ce qui créerait des doublons. Les routes cron utilisent `CRON_SECRET`.

La purge des événements de vente décrite par la migration SQL est différente : elle utilise Supabase Cron/`pg_cron`, planifié chaque jour à `03:17 UTC`. La [documentation Supabase Cron](https://supabase.com/docs/guides/cron) indique que les jobs sont stockés dans `cron.job` et leurs exécutions dans `cron.job_run_details`. La migration doit pouvoir créer l’extension et la tâche; vérifier ces deux éléments après son application. Les migrations échouent désormais explicitement si la publication `supabase_realtime` manque, plutôt que de laisser la diffusion désactivée sans signalement. Cette migration n’a pas été appliquée à distance.

## 5. DNS et bascule

1. Avant tout changement, exporter ou capturer les enregistrements DNS actuels, les URL de callback/webhook, les valeurs de configuration et la dernière version Vercel fonctionnelle.
2. Créer le Web Service Render seulement après approbation; vérifier `/api/health` et les parcours sur le sous-domaine temporaire Render. La cible DNS exacte et le certificat sont fournis par Render après création; ne pas les deviner ni les inscrire dans ce dépôt.
3. Ajouter le domaine personnalisé dans Render et attendre la validation TLS avant de modifier le DNS. Abaisser le TTL si le fournisseur le permet. Changer uniquement les enregistrements demandés par Render, puis contrôler la résolution DNS et HTTPS.
4. Après propagation, tester connexion, cookies, analytics, webhooks de test, callbacks OAuth, uploads, tâches Studio, e-mails, médias et logs. N’activer les webhooks live qu’après confirmation explicite et test de la signature.
5. Surveiller les erreurs et la latence avant de considérer la migration terminée.

## 6. Retour arrière et données

Garder le déploiement Vercel et les anciennes valeurs DNS disponibles pendant la période de validation. Si le site Render échoue, rétablir les enregistrements DNS sauvegardés vers Vercel, remettre les anciennes URL webhook/callback dans les fournisseurs, et vérifier l’authentification avant de réactiver les écritures. Les tâches Studio peuvent rester servies par Vercel; `STUDIO_UPSTREAM_URL` doit rester l’hôte Vercel direct.

La migration SQL de confidentialité supprime la colonne contenant les payloads bruts de l’ancien journal webhook, enlève les coordonnées/valeurs sensibles des `raw_payload` Chariow et purge les événements de plus de 90 jours. Cette suppression est intentionnelle et n’a pas de rollback qui restaure les données supprimées : réaliser une sauvegarde et valider la politique de conservation avant d’appliquer la migration à distance. Les colonnes de vente agrégées/normalisées de `chariow_sales` restent conservées; seul son JSON allowlisté est vidé après 90 jours. Les dossiers de récupération de paiement, qui ont un flux séparé de coordonnées/consentement, ne sont pas modifiés par cette migration et restent à traiter dans une politique distincte; la relance WhatsApp ne pourra plus extraire un numéro des anciennes ventes assainies. Le cache analytics Next/Vercel conserve actuellement le snapshot brut pendant sa fenêtre de cache de 120 secondes pour afficher les détails d’une vente. Si la règle de minimisation doit aussi couvrir ce cache, il faut retirer les coordonnées de cette réponse et accepter leur disparition de la fenêtre « Détail » avant déploiement.

## État de cette checklist

Aucun service Render, DNS, webhook, callback, production ou base Supabase distante n’a été créé, modifié ou migré pendant l’audit. Les étapes qui impliquent ces systèmes restent à approuver et à exécuter séparément.
