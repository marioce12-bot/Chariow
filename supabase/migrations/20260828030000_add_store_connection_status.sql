alter table public.stores
  add column if not exists connection_status text not null default 'pending',
  add column if not exists connection_error text;

-- normalize existing rows
update public.stores
set connection_status = 'connected'
where connected_at is not null;

update public.stores
set connection_status = 'failed'
where connected_at is null and mcp_url is not null;
