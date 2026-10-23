# Shopify sales retention operations / Exploitation de la rétention Shopify

## English

### Policy and timestamps

- A sale with a known Shopify order date (`occurred_at`) expires 90 days after that order date.
- For historical sales whose order date is missing, the retention clock starts at `shopify_first_observed_at`, recorded as `now()` during the retention migration. This is a conservative starting point: the migration does **not** infer or invent age before that observation.
- If both `occurred_at` and `shopify_first_observed_at` are `NULL`, age cannot be established. Keep the row; `NULL` must never be treated as expired. Track this as an operational data-quality limitation rather than deleting the row.
- The database cleanup uses the order date when present, otherwise the recorded first-observed timestamp (`coalesce(occurred_at, shopify_first_observed_at)`).

### Ingestion and scheduled cleanup

The raw Shopify ingestion filter may continue to reject newly received orders with malformed or missing dates. This fail-closed behavior limits ingestion and does not authorize deleting or reclassifying existing database rows. Existing historical rows without an order date use the recorded first-observed timestamp under the policy above.

The authenticated daily cron calls `purge_shopify_sales_retention`; eligible records are removed from the active database after expiry, with the stated maximum of 48 hours after expiry. **No manual purge or one-off cleanup is required** to apply the policy. Do not run a manual purge as part of deployment or operations. The default 60-day Shopify import window is a synchronization window, not a retention rule and does not delete older stored sales.

This policy concerns the active database and does not guarantee erasure from backups, logs, or copies sent to other services. Shopify privacy-request/redaction behavior remains separate.

## Français

### Politique et dates de référence

- Une vente dont la date de commande Shopify est connue (`occurred_at`) expire 90 jours après cette date.
- Pour les ventes historiques sans date de commande, le délai commence à `shopify_first_observed_at`, renseigné avec `now()` pendant la migration de rétention. Ce point de départ prudent **ne reconstitue pas** une ancienneté antérieure et n’en suppose aucune.
- Si `occurred_at` et `shopify_first_observed_at` sont tous deux `NULL`, l’ancienneté est indéterminable. Conserver la ligne : `NULL` ne signifie jamais « expiré ». Signaler cette limite comme un problème de qualité des données plutôt que supprimer la vente.
- Le nettoyage en base utilise la date de commande si elle existe, sinon la première observation enregistrée (`coalesce(occurred_at, shopify_first_observed_at)`).

### Ingestion et nettoyage planifié

Le filtre d’ingestion Shopify brut peut continuer à refuser les nouvelles commandes dont la date est absente ou invalide. Ce comportement restrictif limite l’ingestion ; il n’autorise pas à supprimer ou requalifier les lignes déjà en base. Les lignes historiques sans date de commande utilisent la première observation enregistrée selon la politique ci-dessus.

La tâche cron quotidienne authentifiée appelle `purge_shopify_sales_retention` ; les lignes arrivées à échéance sont supprimées de la base active au plus tard 48 heures après leur échéance. **Aucune purge manuelle ni opération ponctuelle n’est nécessaire** pour appliquer cette politique. Ne pas lancer de purge manuelle lors du déploiement ou des opérations. L’import Shopify par défaut des 60 derniers jours est une fenêtre de synchronisation, pas une règle de rétention, et ne supprime pas les ventes plus anciennes déjà stockées.

Cette politique concerne la base active et ne garantit pas l’effacement des sauvegardes, journaux ou copies transmises à d’autres services. Le traitement des demandes de confidentialité / redaction Shopify reste distinct.
