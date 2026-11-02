alter table public.studio_generations
  add column if not exists provider_request_id text;

create unique index if not exists studio_generations_provider_request_id_idx
  on public.studio_generations(provider_request_id)
  where provider_request_id is not null;
