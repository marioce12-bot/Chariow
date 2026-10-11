-- Identifiant client (customer.id du webhook Chariow) en colonne générée.
-- Sert à calculer valeur client et taux de rachat sans lire email ni téléphone.
-- Non destructif : colonne calculée + index, aucune donnée modifiée.
alter table public.chariow_sales
  add column if not exists customer_id text generated always as (raw_payload->'customer'->>'id') stored;

create index if not exists chariow_sales_store_customer_idx
  on public.chariow_sales (store_id, customer_id, occurred_at);
