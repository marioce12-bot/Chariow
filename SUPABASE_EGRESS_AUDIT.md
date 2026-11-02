# Audit Supabase — réduction de l’egress

## Constats vérifiés

- Le composant `NotificationCenter` interroge `/api/notifications` avec un minuteur de 12 minutes dans la branche auditée, et suspend déjà ses lectures lorsque l’onglet est masqué ou sans focus.
- Le dashboard possède déjà un cache mémoire par URL. Cependant, la Vue d’ensemble utilisait `/api/ad-campaigns` tandis que `AdCampaignsList` utilisait une URL avec fragment (`/api/ad-campaigns#store=...`) : le cache considérait donc ces deux lectures comme différentes.
- `meta_insights_daily` n’a en Production qu’une policy RLS `SELECT`; la synchronisation Meta écrivait avec le client lié à la session utilisateur. Cela explique les erreurs `42501` sur les upserts.
- `/api/meta/performance` téléchargeait toutes les lignes campagne/jour de `meta_insights_daily` avant de les sommer en JavaScript.
- `/api/analytics` et plusieurs autres routes téléchargent encore des lignes `chariow_sales` pour des besoins mixtes : certains écrans ont besoin de détails, mais les totaux et séries temporelles peuvent être agrégés côté Postgres.

## Changements réalisés sur la branche

1. `components/NotificationCenter.tsx` : polling foreground ramené à 60 secondes minimum, avec pause maintenue hors premier plan.
2. `components/dashboard/OverviewHome.tsx` et `components/vendeo/AdCampaignsList.tsx` : même clé de cache `/api/ad-campaigns?store_id=...`, ce qui déduplique le chargement de la boutique courante.
3. `app/api/meta/sync/route.ts` : vérification de propriété avec le client utilisateur conservée; synchronisation serveur passée au client service role pour les écritures protégées par RLS. La clé secrète reste strictement côté serveur.
4. `app/api/meta/performance/route.ts` : utilisation préférentielle d’un RPC d’agrégation, avec fallback temporaire vers l’ancienne lecture tant que la migration n’est pas installée.
5. `supabase/migrations/20261102111500_dashboard_egress_aggregates.sql` : trois fonctions additives préparées, non appliquées à distance : ventes journalières, dépenses Meta par campagne, et résumé des attributions.
6. `tests/foreground-polling.test.tsx` : scénario explicite du délai de 60 secondes.

## Estimation prudente

- Notifications : si la version réellement observée en Production interrogeait toutes les 10 secondes, le passage à 60 secondes réduit d’environ 83 % les lectures en foreground. La branche auditée était déjà à 12 minutes; pour elle, le gain principal vient de la suspension hors focus, et le délai de 60 secondes est un plafond de réactivité demandé.
- Campagnes dashboard : une lecture réseau en moins par chargement de la Vue d’ensemble lorsque les deux composants sont montés, soit généralement 1 requête évitée par ouverture/retour sur l’accueil.
- Performance Meta : après application de la migration, transfert de `meta_insights_daily` réduit d’environ `lignes × 8–9 colonnes` à une ligne par campagne; le gain dépend du nombre de jours et de campagnes, typiquement 80–99 % sur cette réponse.
- Écritures Meta : suppression des rafales de retries dues à la RLS; le gain d’egress indirect dépend de la fréquence de synchronisation et des lignes réessayées.
- Le chiffre exact en Go doit être mesuré dans les logs Supabase/Vercel sur 24–72 h après déploiement, car il dépend du volume réel des comptes et campagnes.

## Validation

- `npx tsc --noEmit --incremental false --pretty false` : OK.
- Tests ciblés : 4 fichiers, 16 tests passés.
- `git diff --check` : OK.
- Aucune migration distante n’a été appliquée. La migration SQL doit d’abord être revue, testée en Preview et appliquée séparément.

## Points restant à traiter

- Remplacer progressivement les téléchargements `chariow_sales` de `/api/analytics` par `dashboard_sales_daily`, en conservant une lecture limitée aux détails réellement affichés.
- Utiliser `dashboard_attribution_summary` dans la réponse performance après vérification de parité avec les règles d’attribution actuelles.
- Ne pas remplacer globalement `auth.getUser()` par `getSession()` sans revue de sécurité : sur le serveur, `getUser()` vérifie l’identité auprès d’Auth, tandis que `getSession()` ne doit pas être utilisé seul comme preuve d’identité. Le gain doit être obtenu route par route avec une stratégie claims/middleware vérifiée.
