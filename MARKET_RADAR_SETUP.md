# Radar marché

Le Radar analyse une idée ou, au choix, un produit de catalogue Chariow. L’utilisateur ne choisit plus d’audience ni de pays à l’avance : l’IA recommande un profil d’audience, les pays à tester, une lecture de tendance prudente, des jours de campagne et une piste de produit. Les marchés actuellement proposés sont le Bénin, la Côte d’Ivoire, le Sénégal, le Cameroun, le Burkina Faso et le Togo.

## Scores et signaux

Le modèle fournit un score global indicatif sur 100 et des scores qualitatifs de potentiel de besoin, adéquation audience, adéquation produit et monétisation. Il classe lui-même les pays et rédige les raisons et les premiers tests. Ces scores servent à prioriser des essais : ce ne sont ni des statistiques de marché ni des prévisions de ventes ou de conversions.

Quand un signal de recherche récent exploitable est disponible, il est transmis à l’IA pour enrichir son analyse, sans comparer directement les valeurs normalisées entre pays. Sans signal exploitable, l’IA produit tout de même son analyse qualitative; la tendance est alors présentée comme une lecture à explorer, sans affirmer une hausse ou une baisse mesurée. L’interface ne montre pas le nom du fournisseur ni les erreurs de collecte.

L’audience est suggérée par l’IA. Ses expressions de centres d’intérêt sont recherchées auprès d’un compte Meta Ads actif et seules les options renvoyées par Meta sont affichées. En l’absence de compte connecté, l’analyse continue et l’interface invite à connecter Meta pour vérifier les intérêts. Les jours de campagne sont des hypothèses de départ, pas des jours de conversion historiquement prouvés.

## Variables serveur

- `OPENROUTER_API_KEY` : nécessaire à l’analyse structurée par l’IA. `OPENROUTER_MODEL` est facultative; le modèle par défaut vient de la configuration OpenRouter existante.
- `SERPAPI_KEY` : facultative; lorsqu’elle est configurée, elle fournit des signaux de recherche supplémentaires à croiser avec l’analyse IA.

Ajouter ces variables uniquement dans les environnements serveur voulus et ne jamais les exposer au navigateur. Le sélecteur de produit lit à la demande le catalogue Chariow via une route dédiée, sans synchroniser les ventes ni déclencher les notifications de l’analytics.

## Cache et quota

Les résultats de recherche sont mis en cache sept jours dans Supabase. Une analyse peut demander une série pour chacun des six pays. Le quota applicatif existant est limité à 200 appels par mois; au-delà, un cache utilisable est repris quand il existe. Une donnée absente ou insuffisante dans un pays n’empêche pas l’IA de recommander un test dans ce pays ou un autre.

Le cron `/api/market/warm` préchauffe les sujets populaires pour les pays configurés. Si `CRON_SECRET` est défini, protéger l’appel avec le même secret côté Vercel.

## Test

Dans le dashboard, ouvre `Radar marché`, décris une idée d’au moins 8 caractères ou choisis un produit dans le catalogue, puis sélectionne le format et lance l’analyse. Aucun choix manuel d’audience ou de pays n’est nécessaire. Les intérêts affichés proviennent des réponses de Meta; les résultats et les jours recommandés restent des hypothèses à tester.
