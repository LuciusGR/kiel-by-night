-- Kiel by Night · Chroniken, Kapitel, Session-Infos und Szenenkarten (v1.4)
-- Chroniken und Kapitel gliedern die Sessions. Der Storyteller pflegt sie, alle Mitglieder lesen.
-- Entwurf-Chroniken sehen nur der ST. Szenenkarten (inkl. NPC-Verknüpfung) sind ausschließlich für den ST.
-- Die bestehenden Tabellen sessions und session_notes bleiben unverändert (Titel/Datum pflegen weiter alle).

-- ---------- Tabellen ----------
create table public.chronicles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  description text not null default '',
  status      text not null default 'running' check (status in ('draft','running','done')),
  started_on  date,
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger chronicles_touch before update on public.chronicles
  for each row execute function public.touch_updated();

create table public.chapters (
  id           uuid primary key default gen_random_uuid(),
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  number       int  not null check (number > 0),
  title        text not null default '',
  created_at   timestamptz not null default now(),
  unique (chronicle_id, number)
);

-- Zusatzangaben je Session, nur der ST schreibt (sessions selbst bleibt für alle bearbeitbar)
create table public.session_info (
  session_number int primary key check (session_number > 0),
  chronicle_id   uuid references public.chronicles(id) on delete set null,
  chapter_id     uuid references public.chapters(id) on delete set null,
  ingame_date    text not null default '',
  summary        text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.session_info(chronicle_id);
create index on public.session_info(chapter_id);
create trigger session_info_touch before update on public.session_info
  for each row execute function public.touch_updated();

-- Szenenkarten (nur ST)
create table public.scenes (
  id             uuid primary key default gen_random_uuid(),
  session_number int  not null check (session_number > 0),
  position       int  not null default 0,
  title          text not null check (length(trim(title)) > 0),
  place          text not null default '',
  mood           text not null default '',
  goal           text not null default '',
  antagonist     text not null default '',
  outcomes       jsonb not null default '[]'::jsonb check (jsonb_typeof(outcomes) = 'array'),
  threads        jsonb not null default '[]'::jsonb check (jsonb_typeof(threads) = 'array'),
  body           text not null default '',
  details        text not null default '',
  status         text not null default 'open' check (status in ('open','played','skipped','postponed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.scenes(session_number, position);
create trigger scenes_touch before update on public.scenes
  for each row execute function public.touch_updated();

-- NPC je Szene: notion_id ist der Schlüssel zur ST-Karte, name der Rückfall, motivation gilt nur für diese Szene
create table public.scene_npcs (
  id         uuid primary key default gen_random_uuid(),
  scene_id   uuid not null references public.scenes(id) on delete cascade,
  notion_id  text not null default '',
  name       text not null check (length(trim(name)) > 0),
  motivation text not null default '',
  created_at timestamptz not null default now()
);
create index on public.scene_npcs(scene_id);
create index on public.scene_npcs(notion_id);

-- ---------- Rechte ----------
grant select, insert, update, delete on
  public.chronicles, public.chapters, public.session_info, public.scenes, public.scene_npcs
to authenticated;

alter table public.chronicles  enable row level security;
alter table public.chapters    enable row level security;
alter table public.session_info enable row level security;
alter table public.scenes      enable row level security;
alter table public.scene_npcs  enable row level security;

-- Chroniken: Mitglieder sehen alles außer Entwürfen, der ST sieht und ändert alles.
create policy chronicles_select on public.chronicles
  for select to authenticated using ((select public.is_member()) and status <> 'draft');
create policy chronicles_st on public.chronicles
  for all to authenticated using ((select public.is_st())) with check ((select public.is_st()));

-- Kapitel und Session-Infos folgen der Sichtbarkeit ihrer Chronik (die Unterabfrage läuft unter RLS).
create policy chapters_select on public.chapters
  for select to authenticated using (exists (select 1 from public.chronicles c where c.id = chronicle_id));
create policy chapters_st on public.chapters
  for all to authenticated using ((select public.is_st())) with check ((select public.is_st()));

create policy session_info_select on public.session_info
  for select to authenticated using (
    (select public.is_member())
    and (chronicle_id is null or exists (select 1 from public.chronicles c where c.id = chronicle_id)));
create policy session_info_st on public.session_info
  for all to authenticated using ((select public.is_st())) with check ((select public.is_st()));

-- Szenenkarten: nur ST
create policy scenes_st on public.scenes
  for all to authenticated using ((select public.is_st())) with check ((select public.is_st()));
create policy scene_npcs_st on public.scene_npcs
  for all to authenticated using ((select public.is_st())) with check ((select public.is_st()));
