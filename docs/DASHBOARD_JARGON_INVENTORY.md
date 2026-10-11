# Inventaire du jargon affiché (étape 1)

Périmètre : ce qui est visible par un vendeur dans le dashboard. Inventaire établi par recherche de code sur la branche `main` ; à compléter par un `grep -rniE "roas|cac|ltv|cpa|ctr|payback|baseline|ratio|fréquence|frequency|attribu"` sur `components/` et `lib/i18n/` avant l'étape 7.

## Vocabulaire cible

| Terme actuel | Nouveau libellé | Unité |
| --- | --- | --- |
| ROAS (x) | Rentabilité | % |
| CAC | Coût par vente | devise |
| CAC max | Plafond par client | devise |
| LTV | Valeur client | devise |
| Payback | Récupération | jours |
| CTR | Taux de clic | % |
| CPA | (retiré de l'écran) | |
| baseline, ratio, attribution, fréquence | (retirés de l'écran) | |

## Termes à remplacer, par fichier

### components/dashboard/sections.tsx
- Clés i18n `overview.roas`, `overview.roasHelp`, `overview.unavailable` (affiche « Non disponible » : à remplacer par « - » ou « Bientôt »).
- Bloc Meta : « Coût moyen par conversion » (CPA, à retirer), « Coût moyen pour obtenir une vente » (CAC → Coût par vente), « Retour publicitaire déclaré par Meta » (ROAS Meta → Rentabilité + pastille Déclaré Meta), « Retour publicitaire réel attribué » (→ Rentabilité + pastille Vérifié).
- En-têtes du tableau Meta : « Ventes Chariow attribuées », « ROAS Chariow attribué », « Verdict Vendeo ».
- Libellés d'état : « Non attribuées », « Aucune vente encaissée », « Non disponible ».
- Phrases entières à transformer en étiquettes + infobulles : « Campagnes qui gagnent ou brûlent du cash », « Recommandation par campagne », « Pourquoi ce verdict », « Aucune campagne synchronisée. Lance une synchronisation Meta Ads. ».
- Emoji : `verdict.emoji` dans les cartes de recommandation (à remplacer par icônes lucide-react).

### components/vendeo/VerdictBanner.tsx
- « ROAS de X.Xx », phrases d'opportunité (« Scaler ta campagne la plus rentable », estimation de ventes supplémentaires : estimation présentée comme une mesure, à retirer).
- Emoji ✅ dans le titre.

### components/vendeo/ImpactFinancierCard.tsx
- « Potentiel estimé selon le ROAS attribué » : estimation, à retirer ou à passer en pastille Indicatif sans chiffre inventé.

### components/vendeo/DiagnosticFunnel.tsx
- Libellés techniques : « CTR baseline (14 j) », « Ratio vs baseline », « Fréquence (impressions / personne) », « ROAS rapporté Meta », « ROAS réel Chariow ».

### components/vendeo/AutopilotView.tsx
- En-tête de colonne `ROAS` (en dur, non traduit).
- Champs `roas` et `cac` du type de rapport : noms de données, à conserver (colonnes DB `ad_campaign_autopilot_reports`), seul l'affichage change.

### components/TikTokAdsPanel.tsx et components/PinterestAdsPanel.tsx
- Phrase d'aide « Le retour publicitaire (ROAS) … n'est pas encore calculé : les verdicts se basent sur les dépenses et les conversions. » → pastille « Bientôt » + infobulle.

### lib/i18n/translations/fr.ts et en.ts
- Pages marketing : « Ton ROAS réel », « ROAS et CPA au même endroit ». Hors dashboard : à traiter avec la landing, pas à l'étape 7.
- Clés `overview.*` et `autopilot.*` à auditer (voir commande ci-dessus).

## Hors périmètre (jargon interne conservé)
- `lib/autopilot.ts` : textes des motifs (`reasons`) en français lisible mais contenant « ROAS » : à reformuler à l'étape 8 avec « Rentabilité ».
- `app/api/chat/route.ts` (prompt IA), `lib/meta/diagnostic.ts`, `lib/ai/autopilot-verdict.ts` : usage interne.
- Colonnes et champs d'API (`roas`, `cac`, `cpa`, `vendeoAttributedRoas`) : inchangés pour la compatibilité des consommateurs.
- `ChatView` : props inchangées. La bande de 3 chiffres décrite dans `docs/VENDEO_AI_LAYOUT.md` (Ventes, Dépenses pub, ROAS réel) reste telle quelle.
