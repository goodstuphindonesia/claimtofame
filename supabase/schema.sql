create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('employee', 'manager', 'super_admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.claim_status as enum (
    'draft',
    'submitted',
    'needs_changes',
    'manager_approved',
    'admin_approved',
    'rejected',
    'paid',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.user_role not null default 'employee',
  manager_id uuid references public.profiles(id),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_goodstuph_domain check (right(lower(email), 14) = '@goodstuph.org')
);

create table if not exists public.claim_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  claimant_id uuid not null default auth.uid() references public.profiles(id),
  manager_id uuid references public.profiles(id),
  category_id uuid not null references public.claim_categories(id),
  title text not null,
  vendor_name text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null check (currency in ('IDR', 'SGD', 'USD')),
  incurred_date date not null,
  job_no text not null,
  business_purpose text not null,
  notes text,
  status public.claim_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.claim_receipts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  file_size integer not null check (file_size <= 5242880),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif')),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.approval_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  claim_id uuid references public.claims(id) on delete set null,
  action text not null,
  before_values jsonb,
  after_values jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists categories_touch_updated_at on public.claim_categories;
create trigger categories_touch_updated_at
before update on public.claim_categories
for each row execute function public.touch_updated_at();

drop trigger if exists claims_touch_updated_at on public.claims;
create trigger claims_touch_updated_at
before update on public.claims
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'super_admin', false);
$$;

create or replace function public.can_access_claim(target_claim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.claims c
    where c.id = target_claim_id
      and (
        c.claimant_id = auth.uid()
        or c.manager_id = auth.uid()
        or public.is_super_admin()
      )
  );
$$;

create or replace function public.log_claim_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(actor_id, claim_id, action, after_values)
    values (auth.uid(), new.id, 'claim_created', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs(actor_id, claim_id, action, before_values, after_values)
    values (auth.uid(), new.id, 'claim_updated', to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs(actor_id, claim_id, action, before_values)
    values (auth.uid(), old.id, 'claim_deleted', to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists claims_audit on public.claims;
create trigger claims_audit
after insert or update or delete on public.claims
for each row execute function public.log_claim_audit();

insert into public.claim_categories (name) values
  ('Accommodation'),
  ('Courier & Delivery'),
  ('Grooming'),
  ('Equipment purchase'),
  ('3rd party vendor'),
  ('Meals'),
  ('Media buy'),
  ('Mobile'),
  ('Office supplies'),
  ('Production'),
  ('Software subscription'),
  ('Transport')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'claim-receipts',
  'claim-receipts',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'claim-exports',
  'claim-exports',
  false,
  null,
  array['application/zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles enable row level security;
alter table public.claim_categories enable row level security;
alter table public.claims enable row level security;
alter table public.claim_receipts enable row level security;
alter table public.approval_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles readable by active users" on public.profiles;
create policy "profiles readable by active users"
on public.profiles for select
to authenticated
using (public.current_role() is not null);

drop policy if exists "super admins manage profiles" on public.profiles;
create policy "super admins manage profiles"
on public.profiles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "categories readable by active users" on public.claim_categories;
create policy "categories readable by active users"
on public.claim_categories for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true));

drop policy if exists "super admins manage categories" on public.claim_categories;
create policy "super admins manage categories"
on public.claim_categories for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "claims readable by permitted users" on public.claims;
create policy "claims readable by permitted users"
on public.claims for select
to authenticated
using (claimant_id = auth.uid() or manager_id = auth.uid() or public.is_super_admin());

drop policy if exists "active users create claims" on public.claims;
create policy "active users create claims"
on public.claims for insert
to authenticated
with check (
  claimant_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true)
);

drop policy if exists "claimants edit drafts and needs changes" on public.claims;
create policy "claimants edit drafts and needs changes"
on public.claims for update
to authenticated
using (
  public.is_super_admin()
  or (claimant_id = auth.uid() and status in ('draft', 'needs_changes'))
  or (manager_id = auth.uid() and status = 'submitted')
)
with check (
  public.is_super_admin()
  or claimant_id = auth.uid()
  or manager_id = auth.uid()
);

drop policy if exists "super admins delete claims" on public.claims;
create policy "super admins delete claims"
on public.claims for delete
to authenticated
using (public.is_super_admin());

drop policy if exists "receipts readable by permitted users" on public.claim_receipts;
create policy "receipts readable by permitted users"
on public.claim_receipts for select
to authenticated
using (public.can_access_claim(claim_id));

drop policy if exists "claimants add receipts" on public.claim_receipts;
create policy "claimants add receipts"
on public.claim_receipts for insert
to authenticated
with check (public.can_access_claim(claim_id));

drop policy if exists "events readable by permitted users" on public.approval_events;
create policy "events readable by permitted users"
on public.approval_events for select
to authenticated
using (public.can_access_claim(claim_id));

drop policy if exists "permitted users add events" on public.approval_events;
create policy "permitted users add events"
on public.approval_events for insert
to authenticated
with check (public.can_access_claim(claim_id));

drop policy if exists "audit readable by super admins" on public.audit_logs;
create policy "audit readable by super admins"
on public.audit_logs for select
to authenticated
using (public.is_super_admin());

drop policy if exists "storage receipts readable by permitted users" on storage.objects;
create policy "storage receipts readable by permitted users"
on storage.objects for select
to authenticated
using (
  bucket_id = 'claim-receipts'
  and exists (
    select 1 from public.claim_receipts r
    where r.file_path = name and public.can_access_claim(r.claim_id)
  )
);

drop policy if exists "storage receipts upload by active users" on storage.objects;
create policy "storage receipts upload by active users"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'claim-receipts'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true)
);
