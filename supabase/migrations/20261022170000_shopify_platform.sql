-- Keep enum extension isolated: PostgreSQL requires new enum labels committed before use.
alter type public.store_platform add value if not exists 'shopify';
