alter table public.oauth_connection_attempts
  add column if not exists oauth_client_id text;
