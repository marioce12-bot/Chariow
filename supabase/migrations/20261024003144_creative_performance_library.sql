-- Bibliothèque canonique des médias de campagne et historique des performances.
-- DDL additif uniquement : aucune ligne de campagne, vente ou attribution existante n'est modifiée.
create table if not exists public.creative_media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  perceptual_hash text check (perceptual_hash is null or perceptual_hash ~ '^[0-9a-f]{16}$'),
  keyframe_hashes text[] not null default '{}',
  source_url text not null,
  delivery_url text not null,
  file_size bigint check (file_size is null or file_size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sha256)
);
create index if not exists creative_media_assets_user_created_idx
  on public.creative_media_assets(user_id, created_at desc);
create index if not exists creative_media_assets_perceptual_idx
  on public.creative_media_assets(user_id, perceptual_hash)
  where perceptual_hash is not null;

-- Une même empreinte peut être envoyée sous plusieurs URL Cloudinary/transfos;
-- la table d'alias permet de retrouver le média canonique sans dupliquer sa fiche.
create table if not exists public.creative_media_asset_urls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.creative_media_assets(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index if not exists creative_media_asset_urls_asset_idx
  on public.creative_media_asset_urls(user_id, asset_id);

-- Les instantanés restent lisibles même si une campagne est archivée ou supprimée logiquement.
-- ad_campaign_id est facultatif pour permettre la conservation après suppression physique legacy.
create table if not exists public.creative_media_placements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  asset_id uuid not null references public.creative_media_assets(id) on delete restrict,
  ad_campaign_id uuid references public.ad_campaigns(id) on delete set null,
  campaign_key text not null,
  campaign_name_snapshot text not null,
  platform text not null check (platform in ('meta', 'tiktok', 'pinterest')),
  product_id text,
  product_name_snapshot text,
  variant_label text,
  campaign_status_snapshot text,
  external_campaign_id text,
  external_ad_id text,
  is_multi_media boolean not null default false,
  asset_index integer not null default 0 check (asset_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, campaign_key, asset_id)
);
create index if not exists creative_media_placements_store_idx
  on public.creative_media_placements(user_id, store_id, created_at desc);
create index if not exists creative_media_placements_asset_idx
  on public.creative_media_placements(user_id, asset_id, created_at desc);
create index if not exists creative_media_placements_campaign_idx
  on public.creative_media_placements(user_id, campaign_key);

-- Source persistante des mesures de campagne pour les plateformes sans historique local.
-- Les ventes/CA attribués restent NULL tant qu'une attribution fiable n'existe pas.
create table if not exists public.creative_campaign_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  ad_campaign_id uuid references public.ad_campaigns(id) on delete set null,
  campaign_key text not null,
  campaign_name_snapshot text not null,
  platform text not null check (platform in ('meta', 'tiktok', 'pinterest')),
  external_campaign_id text not null,
  period_from date not null,
  period_to date not null,
  currency text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  spend numeric(14,2) not null default 0,
  platform_conversions numeric(14,2) not null default 0,
  platform_conversion_value numeric(14,2) not null default 0,
  attributed_orders integer,
  attributed_revenue numeric(14,2),
  attributed_currency text,
  metric_scope text not null default 'campaign' check (metric_scope in ('campaign', 'ad', 'unavailable')),
  captured_at timestamptz not null default now(),
  unique (user_id, store_id, platform, external_campaign_id, period_from, period_to)
);
create index if not exists creative_campaign_metric_snapshots_campaign_idx
  on public.creative_campaign_metric_snapshots(user_id, campaign_key, period_from, period_to);

create trigger creative_media_assets_updated_at
  before update on public.creative_media_assets
  for each row execute procedure public.set_updated_at();
create trigger creative_media_placements_updated_at
  before update on public.creative_media_placements
  for each row execute procedure public.set_updated_at();

alter table public.creative_media_assets enable row level security;
alter table public.creative_media_asset_urls enable row level security;
alter table public.creative_media_placements enable row level security;
alter table public.creative_campaign_metric_snapshots enable row level security;

create policy "Users manage their creative media assets"
  on public.creative_media_assets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their creative media URLs"
  on public.creative_media_asset_urls for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their creative placements"
  on public.creative_media_placements for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users read their creative campaign metric snapshots"
  on public.creative_campaign_metric_snapshots for select
  using (auth.uid() = user_id);
create policy "Users create their creative campaign metric snapshots"
  on public.creative_campaign_metric_snapshots for insert
  with check (auth.uid() = user_id);
create policy "Users update their creative campaign metric snapshots"
  on public.creative_campaign_metric_snapshots for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
