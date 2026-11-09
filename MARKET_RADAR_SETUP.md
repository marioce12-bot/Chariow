# Radar marché

Le Radar marché reçoit une idée, une audience et un format, puis propose automatiquement des pays à tester. Il ne demande plus de choisir un pays de lancement avant l’analyse. L’analyse qualitative et les recommandations utilisent le modèle OpenRouter déjà configuré pour l’assistant Vendeo; Google Trends via SerpApi apporte, quand la clé serveur est disponible, un signal de recherche local pour six marchés francophones (Bénin, Côte d’Ivoire, Sénégal, Cameroun, Burkina Faso et Togo).

## Données et score

Google Trends fournit un indice normalisé sur 0–100 pour une requête dans un pays et une période donnés. Cet indice n’est ni le volume absolu de recherches, ni une mesure des ventes, du chiffre d’affaires ou de la taille d’un marché. L’indice brut d’un pays ne doit pas être comparé directement à celui d’un autre pays.

Quand les séries sont suffisantes, le score de priorité de test combine quatre éléments : 25 % d’intérêt récent relativement à l’historique propre du pays, 25 % d’élan récent, 30 % d’adéquation de l’audience évaluée par l’IA et 20 % d’adéquation idée/format évaluée par l’IA. C’est une aide à prioriser un test, pas une prévision de ventes. La concurrence et la volonté de payer restent non mesurées faute de sources adaptées.

Sans série exploitable, le Radar peut encore proposer des pays comme hypothèses qualitatives de l’IA. Le score affiché sur chaque carte combine alors 60 % d’adéquation audience et 40 % d’adéquation offre; il est explicitement étiqueté comme hypothèse IA et ne remplace pas le score marché, qui reste vide. Les propositions doivent être vérifiées par des échanges clients ou un test simple de l’offre.

## Variables serveur

- `OPENROUTER_API_KEY` : nécessaire à l’analyse structurée par l’IA. `OPENROUTER_MODEL` est facultative; le modèle par défaut vient de la configuration OpenRouter existante.
- `SERPAPI_KEY` : facultative pour les signaux Google Trends. Sans elle, seules des hypothèses IA de faible confiance sont affichées et aucun score de marché n’est calculé.

Ajouter ces clés uniquement dans les variables serveur du projet Vercel pour les environnements souhaités, puis redéployer. Ne jamais exposer de clé au navigateur.

## Cache et quota

Les résultats Trends sont mis en cache sept jours dans Supabase. Une analyse peut demander une série pour chacun des six pays. Le quota applicatif SerpApi existant est limité à 200 appels par mois; au-delà, un cache périmé est utilisé quand il existe, sinon le pays est indiqué comme indisponible. Une panne ou un résultat insuffisant dans un pays ne supprime pas les données exploitables des autres.

Le cron `/api/market/warm` préchauffe les sujets populaires pour les pays configurés. Si `CRON_SECRET` est défini, protéger l’appel avec le même secret côté Vercel.

## Test

Dans le dashboard, ouvre `Radar marché`, saisis une idée d’au moins 8 caractères, choisis éventuellement une ou plusieurs audiences et un format, puis clique sur `Analyser et recommander des pays`. Les pays et leurs raisons apparaissent dans le résultat; aucun pays de lancement n’est présélectionné.
