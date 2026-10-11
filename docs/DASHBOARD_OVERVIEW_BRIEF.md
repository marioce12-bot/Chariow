# Refonte de la vue d'ensemble : décisions de calcul

Résumé des règles retenues (voir le brief complet dans la PR).

- Deux univers : « Ma boutique » (historique Chariow, toujours disponible) et « Mes pubs » (Meta historique + campagnes Vendeo).
- Coût par vente et Rentabilité : uniquement sur les ventes reliées à des campagnes Vendeo. Sans ventes reliées : « - ».
- Plafond par client = revenu net moyen par client x (1 - marge cible). Marge cible par défaut : 30 %, modifiable dans Paramètres (proposition de cette PR).
- Valeur client = revenu net cumulé par `customer.id` (par boutique) / clients distincts. Sous 30 clients : pastille « Peu de données ».
- `net_amount` contient déjà les frais Chariow : ne pas les soustraire une seconde fois.
- Devises : conversion avec `convertCurrency` (taux fixe).
- Confidentialité : jamais d'email ni de téléphone client ; `customer.id` seulement, calculs côté serveur.
- États de l'écran : A (ventes sans pub Vendeo), B (pub sans ventes reliées), C (pub + ventes reliées), D (aucune vente). Voir `overviewState` dans `lib/unit-economics.ts`.
