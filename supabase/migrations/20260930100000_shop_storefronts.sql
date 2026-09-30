-- Vitrines publiques (v1) : /shop/[slug]
-- NON appliquée automatiquement : à relire puis appliquer manuellement.
--
-- Désactiver une vitrine (admin, sans interface pour l'instant) :
--   update public.shop_storefronts set is_disabled_by_admin = true where slug = 'mon-slug';
-- La réactiver :
--   update public.shop_storefronts set is_disabled_by_admin = false where slug = 'mon-slug';

create table if not exists public.shop_storefronts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  slug text not null,
  config jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  is_disabled_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_storefronts_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  constraint shop_storefronts_config_size check (octet_length(config::text) <= 32768)
);

create unique index if not exists shop_storefronts_slug_unique_idx on public.shop_storefronts(slug);
-- v1 : une seule vitrine par boutique.
create unique index if not exists shop_storefronts_store_unique_idx on public.shop_storefronts(store_id);
create index if not exists shop_storefronts_user_idx on public.shop_storefronts(user_id);

create trigger shop_storefronts_updated_at before update on public.shop_storefronts for each row execute procedure public.set_updated_at();

-- Un utilisateur (rôle authenticated/anon) ne peut ni activer/désactiver is_disabled_by_admin,
-- ni changer le propriétaire, la boutique ou le slug. Le service role et l'éditeur SQL restent libres.
create or replace function public.shop_storefronts_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_disabled_by_admin := false;
    else
      new.is_disabled_by_admin := old.is_disabled_by_admin;
      new.user_id := old.user_id;
      new.store_id := old.store_id;
      new.slug := old.slug;
    end if;
  end if;
  return new;
end;
$$;

create trigger shop_storefronts_guard_trg before insert or update on public.shop_storefronts for each row execute procedure public.shop_storefronts_guard();

alter table public.shop_storefronts enable row level security;

create policy "Users can read their storefronts" on public.shop_storefronts for select using (auth.uid() = user_id);
create policy "Users can create their storefronts" on public.shop_storefronts for insert with check (
  auth.uid() = user_id and exists (select 1 from public.stores s where s.id = store_id and s.user_id = auth.uid())
);
create policy "Users can update their storefronts" on public.shop_storefronts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their storefronts" on public.shop_storefronts for delete using (auth.uid() = user_id);

-- Aucun accès anonyme : la lecture publique passe par une route serveur (client admin).
revoke all on table public.shop_storefronts from anon;

-- Mesure : visites et clics d'achat (écrits uniquement par le serveur via le service role).
create table if not exists public.shop_storefront_events (
  id bigint generated always as identity primary key,
  storefront_id uuid not null references public.shop_storefronts(id) on delete cascade,
  event_type text not null check (event_type in ('visit', 'buy_click')),
  product_id text,
  visitor_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  created_at timestamptz not null default now()
);

create index if not exists shop_storefront_events_storefront_idx on public.shop_storefront_events(storefront_id, created_at desc);
create index if not exists shop_storefront_events_type_idx on public.shop_storefront_events(storefront_id, event_type);

alter table public.shop_storefront_events enable row level security;

create policy "Users can read events of their storefronts" on public.shop_storefront_events for select using (
  exists (select 1 from public.shop_storefronts s where s.id = storefront_id and s.user_id = auth.uid())
);

revoke all on table public.shop_storefront_events from anon;
revoke insert, update, delete on table public.shop_storefront_events from authenticated;
