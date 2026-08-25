-- 대피소 찾기 — 데이터베이스 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

create extension if not exists pgcrypto;

-- ─────────────────────────────── 테이블

create table if not exists shelters (
  id                uuid primary key default gen_random_uuid(),
  ext_id            text not null,
  category          text not null check (category in ('civil_defense','earthquake','heat_cold','flood')),
  name              text not null,
  address           text not null,
  lat               double precision not null,
  lng               double precision not null,
  capacity          integer,
  detail            text,
  tel               text,
  unique (category, ext_id)
);

create index if not exists shelters_lat_idx      on shelters (lat);
create index if not exists shelters_lng_idx      on shelters (lng);
create index if not exists shelters_category_idx on shelters (category);

create table if not exists trips (
  id           uuid primary key default gen_random_uuid(),
  device_id    text not null,
  shelter_id   uuid not null references shelters(id) on delete cascade,
  status       text not null default 'moving'
                 check (status in ('moving','arrived','cancelled','expired')),
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists trips_one_active_per_device
  on trips (device_id) where status = 'moving';
create index if not exists trips_active_idx on trips (status, last_seen_at);

create table if not exists shelter_live_counts (
  shelter_id   uuid primary key references shelters(id) on delete cascade,
  moving_count integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────── 인원 집계 트리거

create or replace function bump_count(p_shelter uuid, p_delta integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into shelter_live_counts (shelter_id, moving_count, updated_at)
  values (p_shelter, greatest(0, p_delta), now())
  on conflict (shelter_id) do update
    set moving_count = greatest(0, shelter_live_counts.moving_count + p_delta),
        updated_at   = now();
end $$;

create or replace function trips_sync_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'moving' then perform bump_count(new.shelter_id, 1); end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'moving' then perform bump_count(old.shelter_id, -1); end if;
  else
    if old.status = 'moving' and new.status <> 'moving' then
      perform bump_count(old.shelter_id, -1);
    elsif old.status <> 'moving' and new.status = 'moving' then
      perform bump_count(new.shelter_id, 1);
    elsif old.status = 'moving' and new.status = 'moving' and old.shelter_id <> new.shelter_id then
      perform bump_count(old.shelter_id, -1);
      perform bump_count(new.shelter_id, 1);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trips_sync_counts_trg on trips;
create trigger trips_sync_counts_trg
  after insert or update or delete on trips
  for each row execute function trips_sync_counts();

-- ─────────────────────────────── 유령 기록 정리
-- 브라우저를 그냥 닫아도 2분 뒤 인원에서 빠진다.
-- 종료된 기록은 24시간 뒤 삭제한다.

create or replace function expire_stale_trips()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with done as (
    update trips set status = 'expired'
    where status = 'moving' and last_seen_at < now() - interval '2 minutes'
    returning 1
  ) select count(*) into n from done;
  delete from trips where status <> 'moving' and last_seen_at < now() - interval '24 hours';
  return n;
end $$;

-- ─────────────────────────────── 근처 검색
-- 경위도 사각형으로 1차 거른 뒤 하버사인 거리로 정렬한다.
-- PostGIS 확장이 필요 없다.

create or replace function nearby_shelters(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer,
  p_categories text[]
) returns table (
  id uuid, category text, name text, address text,
  lat double precision, lng double precision,
  capacity integer, detail text, tel text,
  distance_m integer
) language sql stable security definer set search_path = public as $$
  with box as (
    select p_radius_m / 111320.0                                         as dlat,
           p_radius_m / (111320.0 * greatest(0.01, cos(radians(p_lat)))) as dlng
  )
  select s.id, s.category, s.name, s.address, s.lat, s.lng,
         s.capacity, s.detail, s.tel,
         round(
           2 * 6371000 * asin(least(1, sqrt(
             power(sin(radians(s.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(s.lat)) *
             power(sin(radians(s.lng - p_lng) / 2), 2)
           )))
         )::integer as distance_m
  from shelters s, box b
  where s.category = any (p_categories)
    and s.lat between p_lat - b.dlat and p_lat + b.dlat
    and s.lng between p_lng - b.dlng and p_lng + b.dlng
  order by distance_m
  limit 50;
$$;

-- ─────────────────────────────── 이동 기록 RPC

create or replace function start_trip(p_device_id text, p_shelter_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform expire_stale_trips();
  update trips set status = 'cancelled'
   where device_id = p_device_id and status = 'moving';
  insert into trips (device_id, shelter_id) values (p_device_id, p_shelter_id);
end $$;

create or replace function trip_heartbeat(p_device_id text)
returns void language sql security definer set search_path = public as $$
  update trips set last_seen_at = now()
   where device_id = p_device_id and status = 'moving';
$$;

create or replace function end_trip(p_device_id text, p_reason text)
returns void language sql security definer set search_path = public as $$
  update trips
     set status = case when p_reason = 'arrived' then 'arrived' else 'cancelled' end,
         last_seen_at = now()
   where device_id = p_device_id and status = 'moving';
$$;

create or replace function shelter_counts(p_shelter_ids uuid[])
returns table (shelter_id uuid, moving_count integer)
language sql stable security definer set search_path = public as $$
  select c.shelter_id, c.moving_count
    from shelter_live_counts c
   where c.shelter_id = any (p_shelter_ids);
$$;

-- ─────────────────────────────── 접근 제어

alter table shelters            enable row level security;
alter table trips               enable row level security;
alter table shelter_live_counts enable row level security;

drop policy if exists shelters_read on shelters;
create policy shelters_read on shelters
  for select to anon, authenticated using (true);

drop policy if exists counts_read on shelter_live_counts;
create policy counts_read on shelter_live_counts
  for select to anon, authenticated using (true);

-- trips 에는 정책을 만들지 않는다.
-- RLS 켜짐 + 정책 없음 = 익명 사용자의 직접 접근 전면 차단.
-- 조작은 아래 security definer 함수로만 가능하다.

grant execute on function nearby_shelters(double precision, double precision, integer, text[]) to anon, authenticated;
grant execute on function start_trip(text, uuid)     to anon, authenticated;
grant execute on function trip_heartbeat(text)       to anon, authenticated;
grant execute on function end_trip(text, text)       to anon, authenticated;
grant execute on function shelter_counts(uuid[])     to anon, authenticated;

revoke execute on function bump_count(uuid, integer) from anon, authenticated;
revoke execute on function expire_stale_trips()      from anon, authenticated;

-- ─────────────────────────────── 실시간 구독 대상

do $$
begin
  alter publication supabase_realtime add table shelter_live_counts;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────── 주기 정리 (pg_cron 이 있으면)
-- 없어도 괜찮다. start_trip 이 호출될 때마다 정리가 함께 돈다.

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-stale-trips', '* * * * *', 'select expire_stale_trips()');
exception when others then
  raise notice 'pg_cron 을 쓸 수 없어 건너뜁니다. start_trip 이 대신 정리합니다.';
end $$;
