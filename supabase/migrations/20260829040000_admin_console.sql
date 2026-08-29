create type public.admin_role as enum ('super_admin', 'support', 'analyst');

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  role public.admin_role not null default 'support',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
create index admin_audit_logs_resource_idx on public.admin_audit_logs(resource_type, resource_id);

create trigger admin_users_updated_at before update on public.admin_users for each row execute procedure public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.feature_flags enable row level security;
alter table public.platform_settings enable row level security;

create policy "Admins can read admin users" on public.admin_users for select using (exists (select 1 from public.admin_users current_admin where current_admin.user_id = auth.uid() and current_admin.is_active = true));
create policy "Admins can read audit logs" on public.admin_audit_logs for select using (exists (select 1 from public.admin_users current_admin where current_admin.user_id = auth.uid() and current_admin.is_active = true));
create policy "Admins can create audit logs" on public.admin_audit_logs for insert with check (exists (select 1 from public.admin_users current_admin where current_admin.id = admin_user_id and current_admin.user_id = auth.uid() and current_admin.is_active = true));
create policy "Admins can read feature flags" on public.feature_flags for select using (exists (select 1 from public.admin_users current_admin where current_admin.user_id = auth.uid() and current_admin.is_active = true));
create policy "Super admins can manage feature flags" on public.feature_flags for all using (exists (select 1 from public.admin_users current_admin where current_admin.user_id = auth.uid() and current_admin.role = 'super_admin' and current_admin.is_active = true)) with check (exists (select 1 from public.admin_users current_admin where current_admin.user_id = auth.uid() and current_admin.role = 'super_admin' and current_admin.is_active = true));
create policy "Admins can read platform settings" on public.platform_settings for select using (exists (select 1 from public.admin_users current_admin where current_admin.user_id = auth.uid() and current_admin.is_active = true));
create policy "Super admins can manage platform settings" on public.platform_settings for all using (exists (select 1 from public.admin_users current_admin where current_admin.user_id = auth.uid() and current_admin.role = 'super_admin' and current_admin.is_active = true)) with check (exists (select 1 from public.admin_users current_admin where current_admin.user_id = auth.uid() and current_admin.role = 'super_admin' and current_admin.is_active = true));
