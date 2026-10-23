# Suppression et restauration du compte — Preview uniquement

Cette branche part de `main` au commit `6ed6547d66bf32d8a85771998ddf06b9dda41543`. Elle n’est pas à fusionner ou déployer en Production en l’état. Aucune migration n’a été appliquée à un projet distant et aucun compte réel n’a servi aux tests.

## Parcours

La demande de suppression suspend immédiatement l’accès applicatif et fixe une échéance de 90 jours en UTC. Répéter la demande ne repousse pas l’échéance. Le compte Auth, son UUID et ses données sont conservés pendant ce délai. La restauration exige une action explicite et une vérification récente de l’adresse par lien e-mail ; elle ne recrée pas de compte et ne modifie ni les dates ni la consommation de l’essai. À l’échéance exacte, la restauration n’est plus possible.

La purge du compte est réservée à une route serveur protégée. Le marqueur minimal HMAC-SHA-256 de l’adresse normalisée (`trim` puis minuscules, sans règles propres à Gmail) est indépendant du compte. Une réinscription après purge est possible mais ne donne pas un nouvel essai. Ce marqueur ne contient pas d’adresse en clair. Il reste une donnée pseudonymisée à protéger, pas une anonymisation garantie.

## Isolation et configuration manquante

Les trois clients Supabase et le middleware refusent les projets réels actuellement connus et refusent l’environnement Vercel `production`. Un nouvel hôte isolé doit être explicitement défini dans `NEXT_PUBLIC_RETENTION_ISOLATED_HOST` et correspondre à `NEXT_PUBLIC_SUPABASE_URL`. Ne jamais y mettre l’hôte de Production. Les clés anon/service-role doivent appartenir à cette base neuve, sans copie de données réelles.

La migration nécessite une clé HMAC dédiée d’au moins 32 octets dans la configuration privée SQL `private.account_retention_config`. Aucune clé de déploiement n’est fournie ou générée dans le dépôt. La création et le provisionnement de cette clé ont été demandés à la coordinatrice. Sans configuration, les inscriptions et les accès aux données échouent volontairement. Ne pas réutiliser une clé de Production ou une clé de chiffrement OAuth.

La clé doit rester stable pendant toute la durée de l’offre. Ne pas la remplacer sans stratégie explicite de transition : une rotation naïve rendrait les marqueurs existants inopérants. Les marqueurs doivent être supprimés et le déclencheur d’attribution d’essai adapté lors du retrait définitif de l’offre de 15 jours ; cette décision métier ne peut pas être déduite automatiquement par la base.

## Démonstration et vraie intégration

`/preview/account-retention` affiche le composant de restauration avec des données fictives explicites. Ses boutons ne créent pas de compte, n’envoient pas d’e-mail et ne font aucun appel à une base. Ce n’est pas une preuve de fonctionnement de l’authentification hébergée.

Le vrai parcours est `/register` ou `/login` → lien de récupération sans création d’utilisateur → `/auth/confirm` → `/account/restore` → confirmation explicite. La base Supabase isolée devra autoriser l’URL de retour exacte de la Preview et avoir la confirmation e-mail activée. L’AMR des liens magiques Supabase doit être vérifié en intégration hébergée avant activation.

## Purge non activée

Aucun nouveau cron Vercel n’est enregistré. La route `POST /api/cron/accounts/purge` est inactive par défaut. Sur une Preview isolée seulement, son exécution exige `ACCOUNT_RETENTION_PURGE_ENABLED=true`, `VERCEL_ENV=preview`, un `ACCOUNT_RETENTION_PREVIEW_CRON_SECRET` dédié d’au moins 32 caractères et le même secret en Bearer. Elle traite au plus 100 comptes fictifs par appel. L’ordonnancement durable et le délai opérationnel maximal après échéance restent à valider avant une mise en service ; une route non planifiée ne garantit pas une purge automatique au 90e jour.

La purge SQL concerne la base active et ses relations inventoriées. Elle ne démontre pas la suppression dans les sauvegardes, journaux, e-mails ou chez des fournisseurs tiers (générations et médias externes notamment). Les tâches serveur existantes qui utilisent `service_role` contournent RLS : leur exclusion exhaustive des comptes suspendus reste une condition avant activation réelle. Ne pas promettre un effacement total de toutes les copies tant que ces points ne sont pas couverts.

## Vérifications reproductibles

```sh
npx vitest run tests/account-retention-access.test.ts tests/account-retention-routes.test.ts tests/account-retention-ui.test.ts components/Auth.acceptance.test.tsx
npx tsc --noEmit
npm run build
```

Les scénarios SQL de cycle de vie sont exécutés seulement sur une instance PostgreSQL locale jetable, avec identités et clé de test fictives. Ils ne doivent jamais être dirigés vers un projet distant ou une base contenant des comptes réels.
