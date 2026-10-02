# Intégration X Ads

## État

Le backend contient le flux OAuth 1.0a X Ads, le stockage chiffré des tokens et la synchronisation des comptes publicitaires. La fonctionnalité reste volontairement **non activée dans le parcours utilisateur** : le front affiche « X Ads bientôt disponible » et aucun compte X ne peut encore être connecté depuis l’interface.

## Variables Vercel

À configurer dans **Project Settings → Environment Variables** pour Preview et Production :

```env
X_API_KEY=...
X_API_SECRET=...
X_ADS_OAUTH_REDIRECT_URI=https://<domaine-vercel>/api/integrations/x/callback
X_ADS_API_VERSION=12
X_ADS_API_BASE_URL=https://ads-api.x.com/12
```

`X_API_KEY` et `X_API_SECRET` sont les credentials OAuth 1.0a de l’application X. Ne pas les préfixer par `NEXT_PUBLIC_`.

Pour le développement local :

```env
X_ADS_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/x/callback
```

La même URL de callback doit être enregistrée dans le Developer Console X. En production, utiliser l’URL exacte de Vercel sans slash final supplémentaire.

Les variables déjà présentes et nécessaires au stockage restent également obligatoires : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` si utilisé ailleurs, et `TOKEN_ENCRYPTION_KEY`.

## Permissions à demander à X

Dans le formulaire **X Ads API Access**, demander :

- **Standard Access** ;
- Campaign Management : read/write ;
- Creatives : read/write ;
- Analytics : read/write ;
- Custom Audiences : read/write uniquement si cette fonctionnalité sera ajoutée ;
- Conversion endpoints uniquement si le suivi X doit être intégré.

Au niveau du compte publicitaire X, l’utilisateur doit avoir au minimum un rôle de gestion de campagne, typiquement **Ad manager** ou **Account administrator**. Le compte doit aussi disposer d’un moyen de financement configuré dans X Ads.

Pour le flux REST Ads utilisé ici, X documente OAuth 1.0a à trois jambes : il n’y a donc pas de paramètre `scope` OAuth 2 à ajouter à la redirection. Si X active ultérieurement le flux OAuth 2 pour les endpoints utilisés, les scopes documentés à prévoir seront `ads.read ads.write offline.access` ; `media.write` sera nécessaire uniquement pour les uploads ou écritures dans la bibliothèque média.

## Migration

Appliquer la migration Supabase :

```text
supabase/migrations/20261002120000_x_ads_integration.sql
```

Les tokens et secrets OAuth sont chiffrés avec `TOKEN_ENCRYPTION_KEY`. Les tables sont protégées par RLS et filtrées par `user_id`.
