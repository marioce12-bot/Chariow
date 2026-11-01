-- Usage: psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/purge-chariow-sales-payloads.sql
-- Ce script suppose que 20261101150000_chariow_sales_privacy_retention.sql est déjà installé.
-- Il peut être exécuté plusieurs fois. La fonction supprime les événements > 90 jours
-- et vide les raw_payload Chariow > 90 jours, tout en conservant les colonnes métier.
-- Ne pas exécuter sur une base distante sans approbation explicite et sauvegarde.
select public.purge_chariow_sales_retention();
