-- Améliorations du pilotage automatique :
-- 1. Devise du rapport (pour afficher les bons montants, pas un XOF codé en dur).
-- 2. Mapping natif TikTok -> Chariow (parité avec meta_campaign_mappings) pour une
--    attribution précise des ventes aux campagnes TikTok.

alter table public.ad_campaign_autopilot_reports
  add column if not exists currency text;

create table if not exists public.tiktok_campaign_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  tiktok_campaign_id text not null,
  tiktok_campaign_name text,
  chariow_campaign_id text not null,
  chariow_campaign_name text,
  mapping_level text not null default 'campaign' check (mapping_level in ('campaign','adgroup','ad')),
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, store_id, tiktok_campaign_id, chariow_campaign_id, mapping_level)
);

create index if not exists tiktok_campaign_mappings_tiktok_idx
  on public.tiktok_campaign_mappings(user_id, tiktok_campaign_id, status);
create index if not exists tiktok_campaign_mappings_chariow_idx
  on public.tiktok_campaign_mappings(user_id, store_id, chariow_campaign_id, status);

alter table public.tiktok_campaign_mappings enable row level security;
create policy "Users can read their TikTok campaign mappings"
  on public.tiktok_campaign_mappings for select using (auth.uid() = user_id);
create policy "Users can create their TikTok campaign mappings"
  on public.tiktok_campaign_mappings for insert with check (auth.uid() = user_id);
create policy "Users can update their TikTok campaign mappings"
  on public.tiktok_campaign_mappings for update using (auth.uid() = user_id);
create policy "Users can delete their TikTok campaign mappings"
  on public.tiktok_campaign_mappings for delete using (auth.uid() = user_id);
