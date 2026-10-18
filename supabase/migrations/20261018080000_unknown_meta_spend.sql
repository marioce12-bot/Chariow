-- A missing insight amount is not a confirmed zero expense.
alter table public.meta_insights_daily alter column spend drop not null;
alter table public.meta_insights_daily alter column spend drop default;
