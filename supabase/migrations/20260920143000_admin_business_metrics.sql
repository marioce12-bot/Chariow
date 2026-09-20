create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_audit_logs_created_idx on public.platform_audit_logs(created_at desc);
create index if not exists platform_audit_logs_actor_idx on public.platform_audit_logs(actor_user_id, created_at desc);
alter table public.platform_audit_logs enable row level security;
create policy "Admins can read platform audit logs" on public.platform_audit_logs for select using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));

create or replace function public.write_platform_audit(target_user_id uuid, action_name text, resource_name text, resource_key text, metadata_value jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin insert into public.platform_audit_logs(actor_user_id, action, resource_type, resource_id, metadata) values(target_user_id, action_name, resource_name, resource_key, metadata_value); end;
$$;
revoke all on function public.write_platform_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.admin_business_metrics()
returns jsonb language sql security definer set search_path = public as $$
select jsonb_build_object(
  'total_revenue_xof', coalesce((select sum((metadata->>'amount_xof')::numeric) from public.credit_transactions where kind = 'purchase' and status = 'completed'), 0) + coalesce((select sum((metadata->>'amount_xof')::numeric) from public.payment_events where status = 'approved' and plan is not null), 0),
  'credit_revenue_xof', coalesce((select sum((metadata->>'amount_xof')::numeric) from public.credit_transactions where kind = 'purchase' and status = 'completed'), 0),
  'subscription_revenue_xof', coalesce((select sum((metadata->>'amount_xof')::numeric) from public.payment_events where status = 'approved' and plan is not null), 0),
  'credit_purchases', (select count(*) from public.credit_transactions where kind = 'purchase' and status = 'completed'),
  'credits_sold', coalesce((select sum(credits) from public.credit_transactions where kind = 'purchase' and status = 'completed'), 0),
  'active_subscriptions', (select count(*) from public.subscriptions where status = 'active'),
  'registered_users', (select count(*) from public.profiles),
  'studio_generations', (select count(*) from public.credit_transactions where kind = 'debit')
);
$$;
revoke all on function public.admin_business_metrics() from public, anon, authenticated;
