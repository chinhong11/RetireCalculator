-- Row-Level Security for the cloud-sync `profiles` table.
--
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL). The app's
-- publishable key ships in the client, so WITHOUT these policies any visitor
-- could read or overwrite every user's financial snapshot.
--
-- Table shape assumed by src/lib/useCloudSync.js:
--   id         uuid primary key  -- equals auth.users.id
--   data       jsonb             -- localStorage snapshot
--   updated_at timestamptz

-- Create the table if it doesn't exist yet
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Enable RLS (deny-by-default once enabled)
alter table public.profiles enable row level security;

-- Users can only see their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can only create a row for themselves
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can only update their own row
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- (No delete policy: the app never deletes rows; add one if you need it.)
