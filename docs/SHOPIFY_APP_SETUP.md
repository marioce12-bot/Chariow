# Ouvrir la connexion Shopify au public : checklist

Complète `docs/SHOPIFY_INTEGRATION.md` (le code est déjà en place ; il manque l'application Shopify et sa configuration).

## 1. Créer l'application

- Compte Partner Shopify, puis Dev Dashboard (dev.shopify.com/dashboard).
- Distribution **publique** (choix définitif). Une app publique, même non listée, passe par la revue Shopify.
- Ne pas mettre « Shopify » dans le nom de l'app.

## 2. Paramètres de l'app dans Shopify

| Champ | Valeur |
| --- | --- |
| App URL | `https://www.vendeo-studio.site/api/integrations/shopify/install` |
| URL de redirection autorisée | `https://www.vendeo-studio.site/api/integrations/shopify/callback` |
| Scopes | `read_products`, `read_orders` |
| Webhooks (une seule adresse) | `https://www.vendeo-studio.site/api/webhooks/shopify` |

Topics webhooks : `orders/create`, `orders/updated`, `orders/cancelled`, `orders/paid`, `app/uninstalled`, plus les webhooks de conformité `customers/data_request`, `customers/redact`, `shop/redact`.

L'App URL pointe vers la route d'installation (`/install`) : Shopify l'appelle avec `shop`, `timestamp`, `host` et `hmac`. La route vérifie la signature puis relance le flux `connect`. `SHOPIFY_APP_URL` (variable Vercel) reste la racine `https://www.vendeo-studio.site` : le code la valide strictement et en déduit l'URL de callback.

## 3. Données client protégées

Demander l'accès aux données client protégées dans les paramètres de l'app. Sans cette approbation, l'API ne renvoie pas les commandes des boutiques hors développement.

## 4. Variables Vercel (Production, projet `vendeo`)

- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET` (32 caractères minimum)
- `SHOPIFY_APP_URL=https://www.vendeo-studio.site`
- `TOKEN_ENCRYPTION_KEY` et `CRON_SECRET` : déjà utilisés par l'app

Puis redéployer.

## 5. Tester sur une boutique de développement

Connexion depuis le dashboard, installation depuis l'admin Shopify (App URL), catalogue, commande, annulation, remboursement, désinstallation puis réinstallation.

## 6. Soumettre à la revue Shopify

Une fois le test concluant.

## Limite connue

Si le marchand n'a pas de session Vendeo ouverte quand il installe depuis Shopify, la route d'installation l'envoie vers `/login` sans mémoriser la boutique : il doit relancer l'ouverture depuis Shopify après connexion, ou ajouter la boutique depuis le dashboard.
