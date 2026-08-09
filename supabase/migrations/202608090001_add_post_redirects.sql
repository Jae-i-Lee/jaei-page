create table if not exists public.post_redirects (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  category text not null check (category in ('psychology', 'philosophy', 'reflections')),
  slug text not null,
  created_at timestamptz not null default now(),
  unique (category, slug)
);

create index if not exists post_redirects_post_id_idx
on public.post_redirects (post_id);

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
    select * into published
    from public.posts
    where id = draft.source_post_id
    for update;

    if not found then
      raise exception 'Published post not found' using errcode = 'P0002';
    end if;

    if published.category <> draft.category then
      raise exception '기존 글의 카테고리는 바꿀 수 없습니다.' using errcode = '23514';
    end if;

    if published.slug <> draft.slug then
      if exists (
        select 1
        from public.posts
        where category = draft.category
          and slug = draft.slug
          and id <> published.id
      ) then
        raise exception '같은 URL 이름의 글이 이미 있습니다.' using errcode = '23505';
      end if;

      if exists (
        select 1
        from public.post_redirects
        where category = draft.category
          and slug = draft.slug
          and post_id <> published.id
      ) then
        raise exception '이 URL 이름은 다른 글의 이전 주소로 사용 중입니다.' using errcode = '23505';
      end if;

      -- Reverting to one of this post's former slugs makes it canonical again.
      delete from public.post_redirects
      where category = draft.category
        and slug = draft.slug
        and post_id = published.id;

      insert into public.post_redirects (post_id, category, slug)
      values (published.id, published.category, published.slug)
      on conflict (category, slug) do update
      set post_id = excluded.post_id;
    end if;

    update public.posts set
      slug = draft.slug,
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
    if exists (
      select 1
      from public.post_redirects
      where category = draft.category
        and slug = draft.slug
    ) then
      raise exception '이 URL 이름은 다른 글의 이전 주소로 사용 중입니다.' using errcode = '23505';
    end if;

    insert into public.posts (
      category, slug, title, description, pub_date, author, image, tags, body
    ) values (
      draft.category, draft.slug, draft.title, draft.description,
      draft.pub_date, draft.author, draft.image, draft.tags, draft.body
    )
    returning * into published;
  end if;

  delete from public.post_drafts where id = p_draft_id;
  return next published;
end;
$$;

alter table public.post_redirects enable row level security;

revoke all on public.post_redirects from anon, authenticated;
revoke all on function public.publish_post_draft(uuid) from public, anon, authenticated;
grant execute on function public.publish_post_draft(uuid) to service_role;
