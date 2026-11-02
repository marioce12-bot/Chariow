# Runbook Studio vidéo

## État et garde-fous

La génération dépend du flag Supabase `feature_flags.studio_video_enabled`, lu par `lib/studio/video-feature.ts` avec cache court : changer sa valeur en base suffit, sans redéploiement. Le flag ne remplace pas les prérequis fournisseur. La route doit répondre `ready: true` sur `GET /api/studio/video` avant tout test; sinon elle refuse la génération avant réservation de crédits. Le champ `callback` du GET ne concerne que les durées 10/15 s; 25 s garde le polling historique.

Les quotas visés sont deux générations par jour UTC et une génération active par compte utilisateur. La migration additive ajoute un plafond global atomique de cinq jobs actifs; la capacité peut être modifiée dans `studio_video_global_limits` (`singleton=true`). Les états incertains restent comptés comme actifs jusqu’à preuve de résolution : ne pas les libérer manuellement sans vérifier fal.ai et la transaction de crédits.

## Configuration Vercel et fal.ai

Configurer dans les environnements Vercel concernés, sans mettre de valeur dans le dépôt ou les logs :

- `FAL_WEBHOOK_URL=https://www.vendeo-studio.site/api/webhooks/fal`
- `STUDIO_VIDEO_RECONCILE_SECRET` : secret aléatoire d’au moins 32 octets, identique à la valeur stockée dans Supabase Vault sous le même nom.
- `STUDIO_MEDIA_CLOUDINARY_IMPORT=true`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `FAL_API_KEY`

L’URL du webhook fal.ai est fournie aux générations à clip unique (10/15 s), et exigée côté serveur avant tout débit pour ces durées seulement. Le flux 25 s n’est pas bloqué par cette variable et conserve le polling historique. Le handler valide la signature Ed25519 via les clés publiques JWKS de fal.ai; aucun secret de signature fal.ai n’est à copier dans Vercel. L’owner Vendeo est retrouvé à partir du `request_id` fal.ai signé et persisté; l’identifiant fal.ai signé n’est pas confondu avec l’UUID du compte Vendeo. Garder le polling du workflow actif comme filet de sécurité. Une mise à jour d’environnement Vercel nécessite un nouveau déploiement pour être prise en compte.

Les clips et le résultat final sont importés depuis leur URL fal.ai vers des ressources Cloudinary privées authentifiées. Les octets vidéo ne sont pas téléchargés dans le handler ou le workflow Vercel. Pour 10 s et 15 s, fal.ai produit un clip unique avec callback et polling de secours; 25 s conserve son plan historique 15 s + 10 s, le polling durable et une fusion distante fal.ai.

## Réconciliation pg_cron / pg_net

Après validation de la migration sur Preview puis application de cette migration additive à Supabase :

1. Ajouter dans Supabase Vault les entrées `STUDIO_VIDEO_RECONCILE_URL` = `https://www.vendeo-studio.site/api/cron/studio-video/reconcile` et `STUDIO_VIDEO_RECONCILE_SECRET` = le même secret que l’environnement Vercel. Ne jamais inscrire la valeur du secret dans le dépôt, une requête SQL journalisée ou un ticket.
2. Vérifier que les extensions `pg_cron`, `pg_net` et Supabase Vault sont disponibles, puis vérifier le job `studio-video-reconcile` (`*/5 * * * *`). Sans les deux entrées Vault, le dispatcher n’effectue aucun appel.
3. La route protégée revendique au plus 50 éléments par lot, redémarre une demande restée `queued` ou un workflow périmé en réutilisant les identifiants de jobs déjà enregistrés. Elle ne soumet jamais un second job fal.ai à la place d’une soumission ambiguë. Les demandes actives sont recontrôlées plus tard; les cas non prouvables restent réservés et doivent être examinés manuellement.
4. Vérifier une ligne de résumé `Studio video reconciliation summary` par exécution et aucune valeur secrète dans les journaux.

Pour désactiver la génération immédiatement sans nouveau déploiement, mettre `studio_video_enabled=false`; le cache prend au plus environ 30 secondes à expirer. Pour réactiver, remettre `true` seulement après validation des variables et de `GET /api/studio/video`.

## Crédits et échecs

Le coût est calculé côté serveur au prorata de la durée : 480p = 30 crédits/s (10 s : 300, 15 s : 450, 25 s : 750); 720p = 52 crédits/s (10 s : 520, 15 s : 780, 25 s : 1 300). Si un segment fal.ai échoue avant d’être généré, la partie inutilisée est remboursée avec une transaction de remboursement idempotente. Exemple 25 s : si le clip de 15 s existe mais que le clip de 10 s est refusé, 40 % du coût (300 crédits en 480p, 520 en 720p) est restitué et les 15 s produites restent facturées. Un statut fournisseur ambigu ne déclenche pas de remboursement automatique.

## Vérification après déploiement

1. Lancer `pnpm test -- <suites vidéo ciblées>`, `pnpm tsc --noEmit` et le build de production avant fusion.
2. Sur Preview, vérifier readiness, quota global, quotas utilisateur, callback, import Cloudinary privé et réception Realtime, sans créer de rendu facturable avec un compte réel.
3. Après déploiement production, mesurer les logs 30 minutes plus tard : routes vidéo et réconciliation, 500/503, boucles de dispatch/polling, fréquence des résumés. Confirmer un seul enregistrement outbox par génération et l’absence de logs répétés par étape.
4. Pour un test réel de 10 s, utiliser un compte de test autorisé et un plafond de dépense fal.ai préalablement configuré. Vérifier le prix affiché, l’unique appel modèle, l’import Cloudinary, le statut Realtime et le ledger de crédits avant de tester 15 s ou 25 s.

## Diagnostic / réponse incident

- `STUDIO_VIDEO_CONFIG_MISSING`, `STUDIO_VIDEO_STORAGE_UNAVAILABLE` ou `STUDIO_VIDEO_WEBHOOK_UNAVAILABLE` : aucun crédit n’est réservé; contrôler uniquement la présence des variables, jamais leur contenu dans les logs.
- Génération `uncertain` ou `needs_review` : vérifier l’identifiant fal.ai déjà persisté et le statut du débit. Ne pas resoumettre, ne pas libérer quota/crédits tant que le fournisseur et la transaction ne sont pas établis.
- Webhook 401/403 : vérifier l’URL, l’heure du serveur et la disponibilité de JWKS; fal.ai signe le callback et le code vérifie cette signature.
- Échec d’import Cloudinary : vérifier la configuration et les droits d’import distant privé; ne pas réactiver un fallback qui télécharge les octets vidéo dans Vercel.
- Secret de réconciliation à renouveler : remplacer la variable Vercel et l’entrée Vault dans la même fenêtre, redéployer l’environnement Vercel, puis vérifier un appel réussi du job cron. Ne jamais imprimer la valeur.
