# Connexion Shopify dans Vendeo

## État de l’intégration

L’intégration est en lecture seule : OAuth, reconnexion/déconnexion, catalogue, commandes, remboursements, synchronisation, notifications de nouvelles ventes, attribution quand Shopify fournit les paramètres UTM, sélection des produits dans le chat et le wizard publicitaire, diagnostics et vitrines Vendeo. Aucun paiement Shopify, commande test payante, création de campagne publicitaire ni dépense n’est exécuté par les tests.

Chariow garde ses routes, ses jetons et sa normalisation. La connexion « boutique personnalisée » reste désactivée. Gumroad est hors périmètre.

La connexion réelle n’est pas activée sans identifiants d’application Shopify. Une compilation ou un déploiement réussi n’est pas une validation OAuth sur une boutique réelle.

## Configuration requise

Dans les variables serveur Vercel de Production :

- `SHOPIFY_CLIENT_ID` : identifiant de l’application Shopify autorisée.
- `SHOPIFY_CLIENT_SECRET` : secret de cette application, à collecter uniquement par formulaire sécurisé.
- `SHOPIFY_APP_URL=https://www.vendeo-studio.site`.
- Clé de chiffrement des jetons Shopify : `SHOPIFY_TOKEN_ENCRYPTION_KEY` (dédiée, au moins 32 caractères) est facultative si `TOKEN_ENCRYPTION_KEY` (clé maître, au moins 32 caractères) est configurée. La clé dédiée a priorité; sa transformation SHA-256 est conservée pour compatibilité avec les jetons existants. Sinon, Vendeo dérive la clé Shopify par HMAC-SHA-256 de la clé maître avec le contexte `vendeo:shopify:token-encryption:v1`, afin de séparer cryptographiquement Shopify des autres usages de la clé maître. Il n’est donc pas nécessaire de créer une nouvelle clé si la clé maître existe déjà. Garder la clé choisie stable et secrète : sa rotation exige de rechiffrer les jetons stockés avant de remplacer l’ancienne clé; ne pas simplement substituer la clé, sous peine de rendre les jetons existants illisibles.
- `CRON_SECRET` : secret déjà utilisé pour les tâches Vercel; le nouveau cron refuse toute requête s’il est absent.

Les variables serveur ne doivent jamais être préfixées `NEXT_PUBLIC_`. Les jetons offline expirables et leur refresh token sont stockés chiffrés en AES-256-GCM dans `shopify_connections`, table sans accès client. Les nonces OAuth sont consommés atomiquement dans `shopify_oauth_states`.

**URL de retour OAuth exacte :**

`https://www.vendeo-studio.site/api/integrations/shopify/callback`

**Adresse des webhooks :**

`https://www.vendeo-studio.site/api/webhooks/shopify`

Scopes demandés : `read_products,read_orders` uniquement. API Admin GraphQL : `2026-10`. Pas de permissions d’écriture, `read_customers`, `read_all_orders`, Shopify Payments, Storefront session ou pixel ajouté automatiquement.

## Application Shopify : décision du propriétaire

Pour connecter plusieurs boutiques indépendantes, utiliser une application à **distribution publique** conformément au [modèle de distribution Shopify](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method), pas une application custom prévue pour une seule boutique ou organisation autorisée. Les autorisations d’accès aux commandes et aux données protégées peuvent nécessiter l’approbation Shopify.

Aucune application partenaire n’a été créée, soumise ou publiée par cette implémentation. Le propriétaire doit fournir une application existante appropriée, ou autoriser explicitement sa création/configuration. Ne jamais transmettre les secrets dans un message ou un dépôt.

Configurer l’application externe avec l’URL de retour ci-dessus et les événements `orders/create`, `orders/updated`, `orders/cancelled`, `orders/paid`, `app/uninstalled`, ainsi que les événements de conformité `customers/data_request`, `customers/redact`, `shop/redact`. Vendeo vérifie la signature HMAC du corps brut avant toute lecture métier. Le code reçoit les webhooks mais ne crée pas ces abonnements à distance.

## Parité et limites à ne pas masquer

- Les commandes sont limitées aux 60 derniers jours avec `read_orders`. La couverture historique reste explicitement incomplète; les périodes plus anciennes ne sont pas présentées comme complètes. Chaque collection est bornée à 20 pages de 100 éléments. Les commandes ayant plus de 100 lignes signalent un détail produit incomplet, sans inventer les quantités manquantes.
- Le montant Shopify représente le total original moins les remboursements, **avant les frais de règlement**. Aucun taux Chariow de 15 % n’est appliqué à Shopify. Net de règlement, frais et bénéfices restent inconnus sans données autoritatives.
- Les commandes test ou annulées ne produisent pas de ventes confirmées. Les commandes intégralement remboursées ne sont pas comptées comme ventes actives. Le détail financier par produit reste inconnu quand un remboursement ne peut pas être alloué précisément.
- Les visites, taux de conversion, clients uniques et taux de réachat ne sont pas importés avec ces scopes. `null` signifie indisponible, pas zéro.
- L’attribution publicitaire n’est disponible que si des paramètres UTM identifiables sont réellement présents. Elle n’est pas garantie pour toutes les commandes.
- Les paniers abandonnés et coordonnées client ne sont pas importés : les relances WhatsApp Shopify sont explicitement indisponibles. Une parité complète de cette fonction nécessite une extension distincte, les approbations de données protégées et le traitement du consentement.
- Aucun pixel n’est installé dans Shopify par cette connexion. Les pixels présents dans une vitrine Vendeo ne prouvent pas une installation sur le checkout Shopify. Une intégration Shopify Customer Events / canal Meta approprié est à configurer séparément.

## Synchronisation et validation

Le cron applicatif `/api/cron/shopify/sync` est configuré à `03:15 UTC` chaque jour, en complément des événements Shopify. Il traite au plus 20 boutiques par exécution, les plus anciennes/non synchronisées en premier. Ce plafond doit être revu avant un usage à grande échelle; ce n’est pas une promesse de synchronisation quotidienne de toutes les boutiques au-delà de ce volume.

Avant activation réelle : tests unitaires, TypeScript, build Preview, migration additive testée, puis test OAuth sur une boutique autorisée non payante. Vérifier catalogue, commandes multi-produits, annulation, remboursement partiel/total, accès refusé, désinstallation répétée et absence de jeton dans les réponses navigateur. Ne pas utiliser les identifiants d’un compte de Preview sur une autre origine.

Sources : [OAuth Shopify](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant), [permissions](https://shopify.dev/docs/api/usage/access-scopes), [modèle Order](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order), [CustomerVisit et attribution](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/CustomerVisit).
