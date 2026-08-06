-- Ejecuta este archivo en Supabase SQL Editor.
-- El cliente no puede escribir directamente jugadas, cuotas o membresías.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.member_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'trial_expired')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  billing_provider text,
  provider_customer_id text,
  provider_subscription_id text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_picks (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  sport text not null,
  league text not null,
  event text not null,
  team_name text,
  team_logo_url text,
  market text not null,
  selection text not null,
  analysis text not null,
  starts_at timestamptz,
  published boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_picks add column if not exists team_name text;
alter table public.daily_picks add column if not exists team_logo_url text;

create table if not exists public.pick_offers (
  id uuid primary key default gen_random_uuid(),
  pick_id uuid not null references public.daily_picks(id) on delete cascade,
  book_name text not null,
  odds text not null,
  link_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  published_date date not null,
  category text not null,
  title text not null,
  summary text not null,
  source_url text,
  published boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_picks_by_date on public.daily_picks(game_date, published);
create index if not exists pick_offers_by_pick on public.pick_offers(pick_id);
create index if not exists daily_briefs_by_date on public.daily_briefs(published_date, published);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.member_access enable row level security;
alter table public.daily_picks enable row level security;
alter table public.pick_offers enable row level security;
alter table public.daily_briefs enable row level security;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own access" on public.member_access;
create policy "Users read their own access" on public.member_access for select to authenticated using ((select auth.uid()) = user_id);

-- Después de crear tu cuenta de editor, reemplaza el UUID y ejecuta esta línea:
-- update public.profiles set is_admin = true where user_id = 'TU-UUID-DE-USUARIO';
