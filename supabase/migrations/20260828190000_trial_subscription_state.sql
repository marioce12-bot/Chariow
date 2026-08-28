alter table public.subscriptions
  add column if not exists trial_active boolean not null default true;

update public.subscriptions
set trial_active = false
where messages_used_this_month > 0
   or plan = 'pro';
