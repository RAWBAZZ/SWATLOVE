-- SWATLOVE chat: run this once in Supabase (SQL Editor -> New query -> Run)

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  room text not null,
  sender text not null,
  kind text not null check (kind in ('text', 'voice')),
  body text,
  audio_path text,
  created_at timestamptz not null default now()
);

create index if not exists messages_room_id_idx on public.messages (room, id);

-- Lock the table: nobody can read or write it directly.
alter table public.messages enable row level security;

-- The app talks to the table only through these two functions.
create or replace function public.send_message(
  p_room text, p_sender text, p_kind text, p_body text, p_audio_path text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_room is null or length(p_room) < 32 then
    raise exception 'invalid room';
  end if;
  if p_kind not in ('text', 'voice') then
    raise exception 'invalid kind';
  end if;
  if p_sender is null or length(trim(p_sender)) = 0 then
    raise exception 'invalid sender';
  end if;
  if p_kind = 'text' and (p_body is null or length(trim(p_body)) = 0 or length(p_body) > 2000) then
    raise exception 'invalid text';
  end if;
  if p_kind = 'voice' and (p_audio_path is null or length(p_audio_path) > 200) then
    raise exception 'invalid voice note';
  end if;

  insert into public.messages (room, sender, kind, body, audio_path)
  values (p_room, left(trim(p_sender), 20), p_kind, p_body, p_audio_path);
end;
$$;

create or replace function public.get_messages(p_room text, p_after bigint default 0)
returns table (
  id bigint, sender text, kind text, body text, audio_path text, created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select t.id, t.sender, t.kind, t.body, t.audio_path, t.created_at
  from (
    select m.id, m.sender, m.kind, m.body, m.audio_path, m.created_at
    from public.messages m
    where m.room = p_room and m.id > p_after
    order by m.id desc
    limit 200
  ) t
  order by t.id;
$$;

grant execute on function public.send_message(text, text, text, text, text) to anon;
grant execute on function public.get_messages(text, bigint) to anon;

-- Storage bucket for voice notes (5 MB per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('voice', 'voice', true, 5242880)
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists "swatlove voice upload" on storage.objects;
create policy "swatlove voice upload"
  on storage.objects for insert to anon
  with check (bucket_id = 'voice');
