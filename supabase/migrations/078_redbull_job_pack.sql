-- =============================================================================
--  Newcastle Red Bulls job pack — Odysseus schema
--  Project: onesign-employee-hub (duilwyurfywrltwkiaha)
-- =============================================================================
--  Applied to the live database as five migrations:
--    20260907110323_redbull_job_pack_schema
--    20260907110350_redbull_job_pack_api
--    20260907110510_redbull_import_pack
--    20260907110545_redbull_import_pack_guard
--    20260907111327_redbull_harden_import
--  This file is the consolidated equivalent — run it to stand the feature up in
--  a fresh environment. It reflects the final state, hardening included.
--
--  Every object carries the redbull_ prefix, matching the booking_ / display_ /
--  wayfarer_ convention already in Odysseus, so nothing crosses wires.
--
--  Shape: the parts a person actually edits are normalised (panels, rows, and
--  the artwork column). The presentation-only parts of sheets 1, 5 and 6 sit in
--  a jsonb payload rather than a dozen tables nobody will query.
-- =============================================================================

-- Artwork states, so the Odysseus dropdown reads from the database rather than
-- hard-coding the list.
create table if not exists public.redbull_states (
  key       text primary key,
  label     text not null,
  note      text,
  position  integer not null default 0
);

comment on table public.redbull_states is
  'Artwork/quote states for the Red Bull job pack. Drives the colour a value renders in.';

create table if not exists public.redbull_packs (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  client        text not null,
  venue         text not null,
  title         text not null,
  reference     text,
  revision      text not null default 'A',
  issued        date,
  updated       date,
  issued_by     text,
  footer        text,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.redbull_packs.is_published is
  'Only published packs are served to the client-facing site. This is the kill switch.';

create table if not exists public.redbull_sheets (
  id        uuid primary key default gen_random_uuid(),
  pack_id   uuid not null references public.redbull_packs(id) on delete cascade,
  slug      text not null,
  number    integer not null,
  nav       text,
  title     text not null,
  subtitle  text,
  type      text not null check (type in ('plan','panels','fitting','details')),
  columns   text[],
  payload   jsonb not null default '{}'::jsonb,
  position  integer not null,
  unique (pack_id, slug)
);

comment on column public.redbull_sheets.payload is
  'Type-specific extras merged into the sheet object as-is: key/highlight for the plan, itemised/dayRate/total for fitting times, cards for item details.';

create table if not exists public.redbull_panels (
  id        uuid primary key default gen_random_uuid(),
  sheet_id  uuid not null references public.redbull_sheets(id) on delete cascade,
  slug      text not null,
  title     text not null,
  note      text,
  colour    text,
  is_wide   boolean not null default false,
  footnote  text,
  position  integer not null,
  unique (sheet_id, slug)
);

-- Shape guard for the artwork column: an array of {label, state} objects.
-- A check constraint cannot run a subquery, so this does the walk instead.
create or replace function public.redbull_valid_artwork(v jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(v) = 'array'
     and coalesce(bool_and(
           jsonb_typeof(e) = 'object'
           and e ? 'label' and e ? 'state'
           and jsonb_typeof(e->'label') = 'string'
           and jsonb_typeof(e->'state') = 'string'
         ), true)
  from jsonb_array_elements(coalesce(v, '[]'::jsonb)) e;
$$;

create table if not exists public.redbull_rows (
  id          uuid primary key default gen_random_uuid(),
  panel_id    uuid not null references public.redbull_panels(id) on delete cascade,
  code        text not null,
  name        text,
  size        text,
  artwork     jsonb not null default '[]'::jsonb
                constraint redbull_rows_artwork_shape
                check (public.redbull_valid_artwork(artwork)),
  position    integer not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

comment on column public.redbull_rows.artwork is
  'Ordered parts, each {label, state}. Renders as "Sponsor / To confirm" with a colour per part. This is the field the job pack is edited through.';

create index if not exists redbull_sheets_pack_idx  on public.redbull_sheets (pack_id, position);
create index if not exists redbull_panels_sheet_idx on public.redbull_panels (sheet_id, position);
create index if not exists redbull_rows_panel_idx   on public.redbull_rows   (panel_id, position);
create index if not exists redbull_rows_artwork_idx on public.redbull_rows using gin (artwork);

-- updated_at upkeep -----------------------------------------------------------

create or replace function public.redbull_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists redbull_packs_touch on public.redbull_packs;
create trigger redbull_packs_touch
  before update on public.redbull_packs
  for each row execute function public.redbull_touch_updated_at();

drop trigger if exists redbull_rows_touch on public.redbull_rows;
create trigger redbull_rows_touch
  before update on public.redbull_rows
  for each row execute function public.redbull_touch_updated_at();

-- =============================================================================
--  RLS
--  Matches the fitting_jobs model already in Odysseus: any signed-in staff
--  member can read, super admins can write, rows are editable by any staff
--  member because they are the working surface.
--
--  There is deliberately no anon policy anywhere. The public site reads through
--  redbull_job_pack() instead, so the client-facing page never carries a key.
-- =============================================================================

alter table public.redbull_states enable row level security;
alter table public.redbull_packs  enable row level security;
alter table public.redbull_sheets enable row level security;
alter table public.redbull_panels enable row level security;
alter table public.redbull_rows   enable row level security;

create policy "redbull: staff read states"    on public.redbull_states
  for select to authenticated using (auth.uid() is not null);
create policy "redbull: admins manage states" on public.redbull_states
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy "redbull: staff read packs"     on public.redbull_packs
  for select to authenticated using (auth.uid() is not null);
create policy "redbull: admins manage packs"  on public.redbull_packs
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy "redbull: staff read sheets"    on public.redbull_sheets
  for select to authenticated using (auth.uid() is not null);
create policy "redbull: admins manage sheets" on public.redbull_sheets
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy "redbull: staff read panels"    on public.redbull_panels
  for select to authenticated using (auth.uid() is not null);
create policy "redbull: admins manage panels" on public.redbull_panels
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy "redbull: staff read rows"      on public.redbull_rows
  for select to authenticated using (auth.uid() is not null);
create policy "redbull: staff edit rows"      on public.redbull_rows
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "redbull: admins manage rows"   on public.redbull_rows
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

-- =============================================================================
--  Read path
-- =============================================================================

-- Assembles a pack into exactly the JSON the client-facing site consumes. The
-- contract is documented in site/README.md; this function is the only thing
-- that has to honour it, so the site needs no changes when storage moves.
--
-- SECURITY DEFINER on purpose: the public site has no credentials and no table
-- access. This is the one door, and it only opens for a published pack.
create or replace function public.redbull_job_pack(p_slug text default 'nrb')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'schema', 1,
    'meta', jsonb_strip_nulls(jsonb_build_object(
      'client', p.client, 'venue', p.venue, 'title', p.title,
      'reference', p.reference, 'revision', p.revision,
      'issued', p.issued, 'updated', p.updated,
      'issuedBy', p.issued_by, 'footer', p.footer
    )),
    'states', coalesce((
      select jsonb_object_agg(s.key, jsonb_strip_nulls(
               jsonb_build_object('label', s.label, 'note', s.note)))
      from redbull_states s
    ), '{}'::jsonb),
    'sheets', coalesce((
      select jsonb_agg(x.obj order by x.position)
      from (
        select
          sh.position,
          jsonb_strip_nulls(jsonb_build_object(
            'id', sh.slug, 'number', sh.number, 'nav', sh.nav,
            'title', sh.title, 'subtitle', sh.subtitle, 'type', sh.type,
            'columns', to_jsonb(sh.columns)
          ))
          || sh.payload
          || case when sh.type = 'panels' then jsonb_build_object('panels', coalesce((
               select jsonb_agg(y.obj order by y.position)
               from (
                 select
                   pn.position,
                   jsonb_strip_nulls(jsonb_build_object(
                     'id', pn.slug, 'title', pn.title, 'note', pn.note,
                     'colour', pn.colour,
                     'wide', case when pn.is_wide then true else null end,
                     'footnote', pn.footnote
                   )) || jsonb_build_object('rows', coalesce((
                     select jsonb_agg(
                              jsonb_strip_nulls(jsonb_build_object(
                                'code', r.code, 'name', r.name, 'size', r.size,
                                'artwork', case when jsonb_array_length(r.artwork) > 0
                                                then r.artwork end
                              )) order by r.position)
                     from redbull_rows r where r.panel_id = pn.id
                   ), '[]'::jsonb)) as obj
                 from redbull_panels pn where pn.sheet_id = sh.id
               ) y
             ), '[]'::jsonb))
             else '{}'::jsonb
           end as obj
        from redbull_sheets sh
        where sh.pack_id = p.id
      ) x
    ), '[]'::jsonb)
  )
  from redbull_packs p
  where p.slug = p_slug
    and p.is_published;
$$;

comment on function public.redbull_job_pack(text) is
  'The client-facing job pack as JSON. Returns null unless the pack is published. anon EXECUTE is deliberate — it is the read path for the public site, called by the redbull-job-pack edge function with the anon key.';

revoke all on function public.redbull_job_pack(text) from public;
grant execute on function public.redbull_job_pack(text) to anon, authenticated, service_role;

-- What is still outstanding, flattened for Odysseus. security_invoker keeps the
-- caller's RLS in force rather than the view owner's.
create or replace view public.redbull_outstanding
with (security_invoker = on) as
select
  p.slug      as pack_slug,
  sh.number   as sheet_number,
  sh.title    as sheet_title,
  pn.title    as panel_title,
  r.id        as row_id,
  r.code, r.size,
  e->>'label' as label,
  e->>'state' as state
from redbull_rows r
join redbull_panels pn on pn.id = r.panel_id
join redbull_sheets sh on sh.id = pn.sheet_id
join redbull_packs  p  on p.id  = sh.pack_id
cross join lateral jsonb_array_elements(r.artwork) e
where e->>'state' = 'pending'
order by sh.number, pn.position, r.position;

comment on view public.redbull_outstanding is
  'Every artwork value still awaiting the client, one row per part.';

-- =============================================================================
--  Write path
-- =============================================================================

-- The project has a default grant that hands anon EXECUTE on new functions, so
-- "revoke from public" is not enough on its own, and a guard keyed on
-- auth.uid() would never fire for anon. Decide from the caller's actual role,
-- and revoke the grant as well, so neither is load-bearing alone.
create or replace function public.redbull_import_guard()
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );
begin
  if session_user in ('postgres', 'supabase_admin') or v_jwt_role = 'service_role' then
    return;
  end if;
  if is_super_admin() then
    return;
  end if;
  raise exception 'redbull_import_pack: super admin only'
    using errcode = '42501';
end;
$$;

-- Loads a job pack document into the redbull_* tables. The inverse of
-- redbull_job_pack(), so a pack round-trips: export, edit, re-import. Used to
-- seed from site/data/job-pack.json, and by Odysseus to take in a new pack
-- without anyone hand-writing inserts.
create or replace function public.redbull_import_pack(
  p_doc     jsonb,
  p_slug    text default 'nrb',
  p_publish boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id  uuid;
  v_sheet    jsonb;
  v_sheet_id uuid;
  v_panel    jsonb;
  v_panel_id uuid;
  v_row      jsonb;
  v_meta     jsonb := coalesce(p_doc->'meta', '{}'::jsonb);
  v_si       integer := 0;
  v_pi       integer;
  v_ri       integer;
  -- keys with their own columns; everything else on a sheet becomes payload
  v_base     text[] := array['id','number','nav','title','subtitle','type','columns','panels'];
begin
  perform redbull_import_guard();

  insert into redbull_packs (slug, client, venue, title, reference, revision,
                             issued, updated, issued_by, footer, is_published)
  values (
    p_slug,
    coalesce(v_meta->>'client', 'Unknown'),
    coalesce(v_meta->>'venue', ''),
    coalesce(v_meta->>'title', 'Job Pack'),
    v_meta->>'reference',
    coalesce(v_meta->>'revision', 'A'),
    nullif(v_meta->>'issued','')::date,
    nullif(v_meta->>'updated','')::date,
    v_meta->>'issuedBy',
    v_meta->>'footer',
    p_publish
  )
  on conflict (slug) do update set
    client = excluded.client, venue = excluded.venue, title = excluded.title,
    reference = excluded.reference, revision = excluded.revision,
    issued = excluded.issued, updated = excluded.updated,
    issued_by = excluded.issued_by, footer = excluded.footer,
    is_published = excluded.is_published
  returning id into v_pack_id;

  if p_doc ? 'states' then
    delete from redbull_states;
    insert into redbull_states (key, label, note, position)
    select s.key,
           coalesce(s.value->>'label', s.key),
           s.value->>'note',
           (row_number() over ())::int - 1
    from jsonb_each(p_doc->'states') s;
  end if;

  -- sheets cascade to panels and rows, so this is a clean replace
  delete from redbull_sheets where pack_id = v_pack_id;

  for v_sheet in select * from jsonb_array_elements(coalesce(p_doc->'sheets','[]'::jsonb))
  loop
    insert into redbull_sheets (pack_id, slug, number, nav, title, subtitle,
                                type, columns, payload, position)
    values (
      v_pack_id, v_sheet->>'id',
      coalesce((v_sheet->>'number')::int, v_si + 1),
      v_sheet->>'nav',
      coalesce(v_sheet->>'title', v_sheet->>'id'),
      v_sheet->>'subtitle',
      coalesce(v_sheet->>'type', 'panels'),
      case when v_sheet ? 'columns'
           then (select array_agg(c) from jsonb_array_elements_text(v_sheet->'columns') c)
      end,
      v_sheet - v_base,
      v_si
    )
    returning id into v_sheet_id;

    v_pi := 0;
    for v_panel in select * from jsonb_array_elements(coalesce(v_sheet->'panels','[]'::jsonb))
    loop
      insert into redbull_panels (sheet_id, slug, title, note, colour, is_wide, footnote, position)
      values (
        v_sheet_id, v_panel->>'id',
        coalesce(v_panel->>'title', v_panel->>'id'),
        v_panel->>'note', v_panel->>'colour',
        coalesce((v_panel->>'wide')::boolean, false),
        v_panel->>'footnote', v_pi
      )
      returning id into v_panel_id;

      v_ri := 0;
      for v_row in select * from jsonb_array_elements(coalesce(v_panel->'rows','[]'::jsonb))
      loop
        insert into redbull_rows (panel_id, code, name, size, artwork, position)
        values (
          v_panel_id,
          coalesce(v_row->>'code', ''),
          v_row->>'name',
          v_row->>'size',
          coalesce(v_row->'artwork', '[]'::jsonb),
          v_ri
        );
        v_ri := v_ri + 1;
      end loop;
      v_pi := v_pi + 1;
    end loop;
    v_si := v_si + 1;
  end loop;

  return v_pack_id;
end;
$$;

comment on function public.redbull_import_pack(jsonb, text, boolean) is
  'Replaces a job pack from a document in the shape redbull_job_pack() returns. Super admin or service role only.';

revoke all on function public.redbull_import_pack(jsonb, text, boolean) from anon, public;
grant execute on function public.redbull_import_pack(jsonb, text, boolean) to authenticated, service_role;
