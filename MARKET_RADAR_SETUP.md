# Radar Marché

Le module `Radar marché` utilise Google Trends via SerpApi lorsqu'une clé serveur est configurée. Sans clé, l'interface reste disponible mais indique que les données live sont insuffisantes.

## Variable nécessaire

```env
SERPAPI_KEY=ta_cle_serpapi
```

Créer la clé sur `https://serpapi.com/` après inscription, puis l'ajouter dans Vercel:

1. Ouvrir le projet Vendeo dans Vercel.
2. Aller dans `Settings` puis `Environment Variables`.
3. Ajouter `SERPAPI_KEY` pour `Production`, `Preview` et `Development` selon l'environnement souhaité.
4. Redéployer le projet.

## Limites actuelles

- Le score live repose sur Google Trends via SerpApi.
- Une tendance de recherche ne garantit pas des ventes.
- TikTok Creative Center et Meta Ad Library ne sont pas encore connectés à cette première version.
- Le rapport affiche toujours la source et le niveau de confiance pour éviter de présenter une hypothèse comme une donnée.

## Test

Dans le dashboard, ouvrir `Radar marché`, saisir une idée d'au moins 8 caractères, sélectionner le pays, l'audience et le format, puis cliquer sur `Analyser le potentiel`.
