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
- `/api/chat` : historique et messages avec quota
- `/api/subscription` : consulter et changer de plan

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

## 6. Limites actuelles

La route `/api/chat` persiste les messages, applique les 3 requêtes gratuites puis le quota du plan, et appelle Imole avec GPT-5.6 Luna. Les offres sont indiquées après consommation des 3 essais. Les données commerciales Chariow doivent encore être ajoutées dans le connecteur MCP pour fournir à l’IA des ventes et produits réels.
