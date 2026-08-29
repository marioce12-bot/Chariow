# Configuration Supabase

## 1. Appliquer le schéma

Dans le dashboard Supabase :

1. Ouvre **SQL Editor**.
2. Crée une nouvelle requête.
3. Copie le contenu de `supabase/migrations/20260828010000_initial_schema.sql`.
4. Exécute la requête.

Le script crée `profiles`, `subscriptions`, `stores` et `messages`, le trigger de création de profil, les fonctions de quota et les politiques RLS.

Si le schéma initial a déjà été exécuté, exécute ensuite la migration `supabase/migrations/20260828023000_free_trial_quota.sql`. Elle ajoute 3 requêtes gratuites permanentes par compte.

## 2. Configurer l’authentification

Dans **Authentication > URL Configuration** :

- Site URL : `http://localhost:3000` en développement
- Redirect URLs : `http://localhost:3000/auth/confirm`

Pour la production, remplace ces URLs par le domaine réel.

L’inscription utilise la confirmation email Supabase. Le lien de confirmation doit rediriger vers `/auth/confirm`.

## 3. Variables locales

Crée un fichier `.env.local` à la racine du projet à partir de `.env.example` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://ton-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ta-cle-anon-ou-publishable
SUPABASE_SERVICE_ROLE_KEY=ta-service-role-key
TOKEN_ENCRYPTION_KEY=une-valeur-secrete-longue-et-stable
NEXT_PUBLIC_APP_URL=http://localhost:3000
FEDAPAY_SECRET_KEY=ta-clé-secrète-FedaPay
FEDAPAY_WEBHOOK_SECRET=le-secret-du-webhook-FedaPay
FEDAPAY_ENVIRONMENT=sandbox
```

La clé `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais être préfixée par `NEXT_PUBLIC_`, envoyée au navigateur ou commitée dans Git.

`TOKEN_ENCRYPTION_KEY` sert à chiffrer les tokens MCP avant leur stockage. Elle doit rester identique entre les déploiements, sinon les anciens tokens ne pourront plus être déchiffrés.

## 4. Lancer l’application

```bash
npm install
npm run dev
```

Routes disponibles :

- `/` : landing page
- `/register` : inscription Supabase
- `/login` : connexion Supabase
- `/dashboard` : espace protégé
- `/api/stores` : lister et ajouter une boutique
- `/api/stores/:id` : désactiver une boutique
- `/api/stores/:id/test` : tester la connexion MCP Chariow
- `/api/chat` : historique et messages avec quota
- `/api/subscription` : consulter et changer de plan
- `/api/subscription/checkout` : créer un paiement FedaPay
- `/api/webhooks/fedapay` : activer un plan après paiement confirmé

## Connexion Chariow MCP

Lorsqu’un compte n’a aucune boutique active, Vendeo affiche automatiquement l’onboarding Chariow :

```text
Chariow → Automatisations → Connexion MCP
```

L’URL publique habituelle du serveur MCP est :

```text
https://mcp.chariow.com/public
```

Le parcours principal ouvre Chariow afin que l’utilisateur sélectionne sa boutique et autorise l’accès. Tant que Chariow ne fournit pas à Vendeo une URL OAuth/callback officielle, une saisie manuelle reste disponible en secours pour un token MCP déjà obtenu.

## 5. Configuration du fournisseur IA Imole

Dans Vercel et dans `.env.local`, ajoute :

```env
IMOLE_API_KEY=ta-cle-api-imole
IMOLE_API_URL=https://api.imole.app/v1
IMOLE_MODEL=GPT-5.6 Luna
```

`IMOLE_API_KEY` ne doit jamais être préfixée par `NEXT_PUBLIC_`. Elle est utilisée uniquement par `/api/chat` côté serveur.

La route utilise l’endpoint compatible OpenAI :

```text
POST https://api.imole.app/v1/chat/completions
```

Après toute modification dans Vercel, redéploie l’application pour charger les variables.

## Paiements FedaPay

Les plans utilisent les montants suivants :

```text
Starter : 3 000 XOF
Pro     : 5 000 XOF
```

Le bouton d’abonnement appelle `POST /api/subscription/checkout`, crée une transaction FedaPay et redirige vers sa page de paiement. Le plan n’est activé qu’après réception d’un webhook `transaction.approved` signé.

Dans FedaPay, configure ce webhook :

```text
https://ton-domaine-vercel.app/api/webhooks/fedapay
```

Copie le secret du webhook dans `FEDAPAY_WEBHOOK_SECRET`. Utilise d’abord `FEDAPAY_ENVIRONMENT=sandbox`, puis passe à `live` après les tests.

## 6. Limites actuelles

La route `/api/chat` persiste les messages, applique les 3 requêtes gratuites puis le quota du plan, et appelle Imole avec GPT-5.6 Luna. Les offres sont indiquées après consommation des 3 essais. Les données commerciales Chariow doivent encore être ajoutées dans le connecteur MCP pour fournir à l’IA des ventes et produits réels.

## Client MCP Chariow

Vendeo utilise le serveur MCP officiel :

```text
https://mcp.chariow.com/public
```

Le client serveur envoie les requêtes JSON-RPC avec le bearer token obtenu après l’autorisation Chariow et accepte les réponses JSON ou SSE. Les fonctions d’analyse utilisent les outils en lecture seule : `get_store`, `list_products`, `get_sales_analytics` et `get_store_analytics`.

Le test d’une connexion existante se fait avec :

```text
POST /api/stores/:id/test
```

Les tokens ne sont jamais envoyés au navigateur ni au modèle IA.

## Attribution réelle V1

Applique ensuite la migration :

```bash
npx supabase db push
```

ou exécute `supabase/migrations/20260829170000_real_attribution_v1.sql` dans le SQL Editor.

Configure `CHARIOW_PULSE_WEBHOOK_SECRET` avec le secret fourni par Chariow pour vérifier `x-chariow-signature`.

Routes V1 :

- `POST /api/attribution/touch` accepte les visiteurs anonymes et enregistre les UTM par boutique.
- `POST /api/webhooks/chariow/pulses` déduplique les livraisons sur `x-pulse-delivery-id`.
- `GET /api/meta/performance` expose `vendeoAttributedRoas`, basé sur le revenu net attribué.
- `GET /api/cron/meta/sync` synchronise automatiquement les comptes Meta actifs avec `Authorization: Bearer $CRON_SECRET`.

Vendeo ne vend pas de produits et ne crée aucune session de paiement. Chariow reste la plateforme de vente ; Vendeo lit les données de boutique et analyse les ventes, revenus, publicités Meta et indicateurs de rentabilité.

### Modèle d’attribution V1

- Modèle : dernière touch non directe (`last non-direct touch`).
- Fenêtre d’attribution : 30 jours avant la vente.
- Conservation technique des touches : 90 jours.
- Une touch capturée après la vente est toujours exclue.
- Une visite directe sans UTM ne remplace jamais une touch Meta valide existante.
- `successful.sale` est le seul événement Pulse qui crédite une vente dans V1.
- Un test Pulse signé sans `x-pulse-delivery-id` reçoit `200`, mais n’est ni persisté ni attribué financièrement.

Ordre final des migrations :

1. `20260829170000_attribution_touches.sql` et les migrations antérieures déjà listées dans ce dépôt.
2. `20260829173000_public_store_product_slugs.sql` uniquement si les slugs publics d’analyse sont conservés.
3. `20260829180000_fix_real_attribution_v1_compatibility.sql`.
4. `20260829190000_remove_unused_checkout_api_key.sql` pour supprimer l’ancienne colonne de clé Checkout si elle existe.

Sur une base qui a déjà appliqué les migrations précédentes, ne les réapplique pas : applique uniquement les migrations encore absentes. La migration de suppression ne touche pas au token MCP/OAuth utilisé pour l’analyse.

Vendeo ne crée aucun paiement Chariow. Le suivi UTM est enregistré pour l’analyse ; l’attribution financière Chariow nécessite que le webhook fournisse le contexte de boutique et les données de vente correspondantes.

Appliquer aussi les migrations `20260829200000_persist_chariow_sales.sql` et `20260829201000_meta_auto_sync.sql`. Sur Vercel Hobby, `/api/cron/meta/sync` est planifié quotidiennement à 03:00 UTC. La route attend `Authorization: Bearer $CRON_SECRET`.

Le lot rentabilité ajoute `20260829210000_profitability_alerts.sql`, la route `GET /api/profitability/aggregates` et la route `GET/PATCH /api/alerts`. Les agrégats calculent les ventes complétées, abandons, échecs, revenu brut/net, CAC, taux d’abandon et ROAS attribué Vendeo. Les alertes sont persistées et dédupliquées par période.
