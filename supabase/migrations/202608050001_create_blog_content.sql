create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('psychology', 'philosophy', 'reflections')),
  slug text not null,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 240),
  pub_date date not null,
  author text not null default 'Jaei',
  image text,
  tags text[] not null default '{}',
  body text not null check (char_length(body) between 1 and 120000),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, slug)
);

create table if not exists public.post_drafts (
  id uuid primary key default gen_random_uuid(),
  source_post_id uuid references public.posts(id) on delete set null,
  category text not null check (category in ('psychology', 'philosophy', 'reflections')),
  slug text not null,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 240),
  pub_date date not null,
  author text not null default 'Jaei',
  image text,
  tags text[] not null default '{}',
  body text not null check (char_length(body) between 1 and 120000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, slug)
);

create table if not exists public.post_revisions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  title text not null,
  description text not null,
  pub_date date not null,
  author text not null,
  image text,
  tags text[] not null,
  body text not null,
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

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
before update on public.posts
for each row execute function public.touch_updated_at();

drop trigger if exists post_drafts_touch_updated_at on public.post_drafts;
create trigger post_drafts_touch_updated_at
before update on public.post_drafts
for each row execute function public.touch_updated_at();

create or replace function public.capture_post_revision()
returns trigger
language plpgsql
as $$
begin
  insert into public.post_revisions (
    post_id, title, description, pub_date, author, image, tags, body
  ) values (
    old.id, old.title, old.description, old.pub_date, old.author,
    old.image, old.tags, old.body
  );
  return new;
end;
$$;

drop trigger if exists posts_capture_revision on public.posts;
create trigger posts_capture_revision
before update on public.posts
for each row execute function public.capture_post_revision();

create or replace function public.publish_post_draft(p_draft_id uuid)
returns setof public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.post_drafts%rowtype;
  published public.posts%rowtype;
begin
  select * into draft
  from public.post_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;

  if draft.source_post_id is not null then
    update public.posts set
      title = draft.title,
      description = draft.description,
      pub_date = draft.pub_date,
      author = draft.author,
      image = draft.image,
      tags = draft.tags,
      body = draft.body,
      published_at = now()
    where id = draft.source_post_id
    returning * into published;
  else
    insert into public.posts (
      category, slug, title, description, pub_date, author, image, tags, body
    ) values (
      draft.category, draft.slug, draft.title, draft.description,
      draft.pub_date, draft.author, draft.image, draft.tags, draft.body
    )
    on conflict (category, slug) do update set
      title = excluded.title,
      description = excluded.description,
      pub_date = excluded.pub_date,
      author = excluded.author,
      image = excluded.image,
      tags = excluded.tags,
      body = excluded.body,
      published_at = now()
    returning * into published;
  end if;

  delete from public.post_drafts where id = p_draft_id;
  return next published;
end;
$$;

alter table public.posts enable row level security;
alter table public.post_drafts enable row level security;
alter table public.post_revisions enable row level security;

revoke all on public.posts from anon, authenticated;
revoke all on public.post_drafts from anon, authenticated;
revoke all on public.post_revisions from anon, authenticated;
revoke all on function public.publish_post_draft(uuid) from public, anon, authenticated;
grant execute on function public.publish_post_draft(uuid) to service_role;
