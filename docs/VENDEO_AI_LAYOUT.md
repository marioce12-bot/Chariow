# Vendeo AI : mise en page de l'assistant

Ce document est la référence de design de l'assistant. Toute modification de l'assistant doit le respecter.

## Où est le code

- `components/ChatView.tsx` : le composant de l'assistant (logique + mise en page).
- `app/vendeo-ai.css` : ses styles, tous préfixés `.ai-page` (thème sombre compris). Importé par `ChatView.tsx`.
- Ne pas ajouter ces styles à `globals.css` et ne pas modifier les anciens blocs `.chat-*` / `.ai-*` de `globals.css`.

## Contrat de design

Objectif : un assistant lisible sur téléphone (mobile d'abord), dans l'identité bleu/violet de Vendeo.

Structure de l'écran, de haut en bas :

1. En-tête blanc et fin : retour, petit logo carré violet avec étincelle, « Vendeo AI », une ligne de statut avec un point (vert si les données Chariow sont chargées, gris sinon), pastille d'essai à droite (« Essai · 5 j »).
2. Bande de 3 chiffres (Ventes, Dépenses pub, ROAS réel) en petites cartes compactes.
3. Accueil sans message : label « Centre de décision », titre « Que veux-tu comprendre aujourd’hui ? », une phrase, puis 3 cartes empilées (pas de grille) avec une pastille d'icône colorée par sens : rouge = marge, vert = opportunité, bleu = produits.
4. Conversation : messages de l'utilisateur à droite en dégradé Vendeo ; réponses de l'IA à gauche dans une carte blanche à bordure fine avec un petit logo violet ; sous la dernière réponse, des suggestions de suite (« Que faire ensuite ? », « Détailler »).
5. Suggestions au-dessus de la saisie : puces bleu clair, défilement horizontal.
6. Saisie : pilule blanche (baguette pour l'affiche, ampoule quand il y a une conversation, champ texte) et bouton d'envoi rond en dégradé avec une flèche vers le haut. Pas de bouton texte « Envoyer ».

Règles :

- Couleurs uniquement via les variables existantes (`--ink`, `--muted`, `--line`, `--blue`, `--green`, `--vendeo-gradient`) ; les couleurs fixes déjà présentes dans `vendeo-ai.css` restent dans ce fichier.
- Pas de puces vertes, pas d'en-tête bleu marine, pas d'emoji dans l'interface.
- Textes en français, phrase normale (pas de majuscules), tutoiement.
- Le thème sombre doit rester correct.
- Sur mobile, le champ texte reste à 16 px (évite le zoom automatique sur iPhone).
- Aucune nouvelle dépendance ; icônes uniquement via `lucide-react`.
- Ne pas changer les props de `ChatView` : `onGoToSubscription`, `onUsageChange`, `onBack`, `products`, `analytics`.

## Vérifications visuelles (à faire sur téléphone)

1. Écran vide (390 px) : en-tête blanc, bande de 3 chiffres, 3 cartes empilées, puces bleues, pilule de saisie avec bouton rond.
2. Envoi d'un message : bulle utilisateur à droite en dégradé, réponse en carte blanche, suggestions sous la dernière réponse.
3. Le bouton d'envoi est grisé quand le champ est vide.
4. Le bouton baguette ouvre le générateur d'affiches.
5. Thème sombre : écrans lisibles, puces bleues (pas vertes).
6. Sur ordinateur (> 900 px) : le panneau « Ce que Vendeo AI sait faire » reste à droite.
