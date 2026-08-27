# Configuration Supabase

## 1. Appliquer le schéma

Dans le dashboard Supabase :

1. Ouvre **SQL Editor**.
2. Crée une nouvelle requête.
3. Copie le contenu de `supabase/migrations/20260828010000_initial_schema.sql`.
4. Exécute la requête.

Le script crée `profiles`, `subscriptions`, `stores` et `messages`, le trigger de création de profil, les fonctions de quota et les politiques RLS.

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

## 5. Limites actuelles

La route `/api/chat` persiste les messages et applique le quota, mais renvoie encore une réponse temporaire. L’orchestrateur LLM et les appels MCP Chariow doivent être branchés ensuite dans cette route ou dans un module de service dédié.
