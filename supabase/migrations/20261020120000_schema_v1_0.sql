-- Kiel by Night · Schema v1.0
-- Tabellen, Hilfsfunktionen, Trigger. Rechte folgen in *_rls_v1_0.sql.

create extension if not exists pgcrypto;

-- ---------- Profile & Rollen ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role         text not null default 'player' check (role in ('st','player')),
  created_at   timestamptz not null default now()
);

-- Bewusst KEIN automatisches Profil für neue Auth-Konten: Nur wer von Roland ein Profil
-- bekommt (docs/Setup_Anleitung), ist Mitglied. Schutz, falls die Selbstregistrierung
-- in Supabase versehentlich offen bleibt.

-- security definer, damit Policies nicht rekursiv über RLS von profiles laufen.
create or replace function public.is_st()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'st');
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- Für den GitHub-Actions-Ping gegen die 7-Tage-Pause.
create or replace function public.ping()
returns text language sql stable security definer set search_path = '' as $$
  select 'ok:' || count(*)::text from public.profiles;
$$;

-- updated_at automatisch pflegen
create or replace function public.touch_updated()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Charaktere ----------
create table public.characters (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references public.profiles(id) on delete set null,
  name       text not null,
  clan       text not null default '',
  sheet      jsonb not null default '{}'::jsonb,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.characters(owner_id);
create trigger characters_touch before update on public.characters
  for each row execute function public.touch_updated();

-- ---------- Sessions ----------
create table public.sessions (
  number     int primary key check (number > 0),
  title      text not null default '',
  play_date  date,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated();

create table public.session_notes (
  id             uuid primary key default gen_random_uuid(),
  session_number int  not null check (session_number > 0),
  author_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body           text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.session_notes(session_number);
create index on public.session_notes(updated_at desc);
create trigger session_notes_touch before update on public.session_notes
  for each row execute function public.touch_updated();

-- ---------- Private Notizen ----------
create table public.private_notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.private_notes(owner_id);
create trigger private_notes_touch before update on public.private_notes
  for each row execute function public.touch_updated();

-- ---------- Wiki ----------
create table public.wiki_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  sort       int  not null default 99,
  st_only    boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.wiki_pages (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.wiki_categories(id) on delete restrict,
  title       text not null check (length(trim(title)) > 0),
  tags        text[] not null default '{}',
  body        text not null default '',
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.wiki_pages(category_id);
create index on public.wiki_pages(updated_at desc);

create or replace function public.wiki_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.created_by := old.created_by;  -- Ersteller unveränderlich (Löschrecht hängt daran)
  return new;
end $$;
create trigger wiki_pages_touch before update on public.wiki_pages
  for each row execute function public.wiki_touch();

-- Sichtbarkeit einer Kategorie (security definer: Policies auf wiki_pages
-- dürfen nicht an RLS von wiki_categories hängen).
create or replace function public.wiki_category_visible(cat uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wiki_categories c
    where c.id = cat and public.is_member() and (not c.st_only or public.is_st())
  );
$$;

-- ---------- Dokumente ----------
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  storage_path text not null unique,
  file_name    text not null default '',
  content_type text not null default '',
  size_bytes   bigint not null default 0,
  draft        boolean not null default false,
  uploader_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index on public.documents(created_at desc);

-- ---------- Spielerkarte ----------
create table public.player_map_nodes (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (length(trim(label)) > 0),
  type         text not null default '',
  tags         text[] not null default '{}',
  description  text not null default '',
  is_pc        boolean not null default false,
  character_id uuid references public.characters(id) on delete set null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index player_map_nodes_label_uq on public.player_map_nodes (lower(label));
create trigger player_map_nodes_touch before update on public.player_map_nodes
  for each row execute function public.touch_updated();

create table public.player_map_edges (
  id          uuid primary key default gen_random_uuid(),
  from_node   uuid not null references public.player_map_nodes(id) on delete cascade,
  to_node     uuid not null references public.player_map_nodes(id) on delete cascade,
  label       text not null default '',
  direction   text not null default 'directed' check (direction in ('directed','mutual','undirected')),
  description text not null default '',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  check (from_node <> to_node)
);

-- ---------- Knotenpositionen (A2) ----------
-- scope 'player' = Spielerkarte (node_key = player_map_nodes.id)
-- scope 'st'     = ST-Karte     (node_key = Notion-Page-ID oder Platzhalter-Schlüssel)
create table public.map_positions (
  scope      text not null check (scope in ('player','st')),
  node_key   text not null,
  x          double precision not null,
  y          double precision not null,
  updated_at timestamptz not null default now(),
  primary key (scope, node_key)
);

-- ---------- Notion-Cache (nur ST lesbar, Schreiben nur per service_role) ----------
create table public.notion_cache (
  id         int primary key default 1 check (id = 1),
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);
