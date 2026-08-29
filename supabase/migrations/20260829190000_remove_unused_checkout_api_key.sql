-- Vendeo only analyzes Chariow data; it never creates customer payments.
alter table public.stores drop column if exists chariow_api_key_encrypted;
