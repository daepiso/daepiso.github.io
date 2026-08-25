# 대피소 찾기 웹앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 위치 기준 근처 대피소를 자동으로 찾아 길찾기로 연결하고, 같은 곳으로 이동 중인 익명 인원 수를 실시간으로 보여주는, 어르신이 혼자 쓸 수 있는 설치 불필요 웹앱을 만든다.

**Architecture:** 빌드 도구 없는 순수 ES 모듈 프런트엔드 + Supabase(PostgreSQL + Realtime) 백엔드. 대피소 원장은 준비용 Node 스크립트가 공공데이터를 한 번 적재해 두고, 런타임 앱은 Supabase RPC만 호출한다. 지도와 도보 경로는 카카오맵에 위임한다. 순수 계산 로직은 DOM·네트워크를 모르며 `node:test`로 단독 검증한다.

**Tech Stack:** HTML/CSS/ES modules, Supabase JS v2 (CDN), Kakao Maps JavaScript SDK, Web Speech API, Node 20+ `node:test`

**설계서:** `docs/superpowers/specs/2026-08-25-shelter-finder-design.md`

---

## 파일 구조

| 경로 | 책임 |
| --- | --- |
| `index.html` | 마크업 골격, SDK 로드, 진입점 |
| `style.css` | 어르신 기준 타이포·터치 타깃·고대비 |
| `src/config.js` | 키·상수. git 제외. `config.example.js`를 복사해 만든다 |
| `src/config.example.js` | 설정 템플릿 (git 포함) |
| `src/constants.js` | 대피소 종류 정의, 반경 단계, 타이밍 상수 |
| `src/geo.js` | 거리 계산·표기. 외부 의존 0. 순수 함수 |
| `src/supabase.js` | Supabase 클라이언트 단일 인스턴스 |
| `src/shelters.js` | 대피소 조회 + localStorage 캐시 |
| `src/location.js` | GPS 획득, 주소 검색 폴백 |
| `src/trips.js` | 판정 순수 함수 + 이동 시작·하트비트·종료·인원 구독 |
| `src/speech.js` | 음성 안내 문장 생성 및 재생 |
| `src/share.js` | 문자 본문·지도 링크 생성, 문자 앱 열기 |
| `src/directions.js` | 카카오맵 길찾기 URL 생성 |
| `src/map.js` | 카카오 지도 렌더·마커 관리 |
| `src/ui.js` | 상태 → DOM 렌더 |
| `src/main.js` | 진입점. 모듈 배선과 상태 관리 |
| `test/*.test.js` | `node:test` 단위 테스트 |
| `scripts/import-shelters.mjs` | 공공데이터 → Supabase 1회 적재 |
| `supabase/schema.sql` | 테이블·인덱스·RLS·RPC·트리거·cron |
| `docs/setup.md` | 키 발급부터 배포까지 사용자용 안내 |

**의존 방향:** `constants` → `geo` → (`trips`, `share`, `directions`, `speech`, `shelters`) → `ui` → `main`. `ui.js`와 `map.js`만 DOM을 안다. `geo.js`는 어떤 것도 모른다.

---

## Task 0: 프로젝트 초기화

**Files:**
- Create: `.gitignore`, `package.json`, `src/constants.js`, `src/config.example.js`

- [ ] **Step 1: git 저장소를 만든다**

```bash
git init && git branch -M main
```

- [ ] **Step 2: `.gitignore` 작성**

```
node_modules/
src/config.js
.env
data/raw/
```

- [ ] **Step 3: `package.json` 작성**

빌드 도구는 쓰지 않는다. 테스트 러너와 적재 스크립트 실행용으로만 둔다.

```json
{
  "name": "shelter-finder",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "serve": "npx --yes serve -l 5173 .",
    "import": "node scripts/import-shelters.mjs"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 4: `src/constants.js` 작성**

이 파일의 값은 이후 모든 태스크가 참조한다. `key` 문자열은 DB `shelters.category` 값과 정확히 일치해야 한다.

```js
export const CATEGORIES = [
  { key: 'civil_defense', label: '민방위',    aria: '민방위 대피시설' },
  { key: 'earthquake',    label: '지진',      aria: '지진 옥외대피장소' },
  { key: 'heat_cold',     label: '폭염·한파', aria: '폭염 한파 쉼터' },
  { key: 'flood',         label: '침수',      aria: '침수 대피소' },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export const RADIUS_STEPS_M = [3000, 5000, 10000];

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const TRIP_STALE_MS = 120_000;
export const ARRIVAL_RADIUS_M = 100;
export const GPS_TIMEOUT_MS = 10_000;
export const WALK_METERS_PER_MINUTE = 67;

export const STORAGE_KEYS = {
  deviceId: 'shelter.deviceId',
  consent: 'shelter.consentAt',
  categories: 'shelter.categories',
  shelterCache: 'shelter.cache',
};
```

- [ ] **Step 5: `src/config.example.js` 작성**

```js
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
export const KAKAO_JS_KEY = 'YOUR-KAKAO-JAVASCRIPT-KEY';
```

- [ ] **Step 6: 실행용 설정 파일을 만든다**

```bash
cp src/config.example.js src/config.js && mkdir -p test
```

- [ ] **Step 7: 테스트 러너 동작 확인**

Run: `node --test test/`
Expected: 테스트 0개, 종료 코드 0

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: 프로젝트 초기화"
```

---

## Task 1: geo.js — 거리 계산과 사람이 읽는 표기

**Files:**
- Create: `src/geo.js`
- Test: `test/geo.test.js`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/geo.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, formatDistance, walkMinutes, expandRadius } from '../src/geo.js';

test('haversineMeters: 같은 지점은 0', () => {
  const p = { lat: 37.4979, lng: 127.0276 };
  assert.equal(haversineMeters(p, p), 0);
});

test('haversineMeters: 강남역과 역삼역 사이는 700~900m', () => {
  const d = haversineMeters({ lat: 37.4979, lng: 127.0276 }, { lat: 37.5006, lng: 127.0365 });
  assert.ok(d > 700 && d < 900, `실제 ${d}m`);
});

test('haversineMeters: 대칭이다', () => {
  const a = { lat: 37.5, lng: 127.0 };
  const b = { lat: 37.6, lng: 127.1 };
  assert.equal(haversineMeters(a, b), haversineMeters(b, a));
});

test('formatDistance: 1km 미만은 10m 단위', () => {
  assert.equal(formatDistance(324), '320m');
  assert.equal(formatDistance(5), '10m');
});

test('formatDistance: 1km 이상은 소수점 한 자리', () => {
  assert.equal(formatDistance(1240), '1.2km');
  assert.equal(formatDistance(10000), '10.0km');
});

test('formatDistance: 반올림 후 1000m가 되면 km로 넘긴다', () => {
  assert.equal(formatDistance(999), '1.0km');
});

test('walkMinutes: 최소 1분, 반올림', () => {
  assert.equal(walkMinutes(10), 1);
  assert.equal(walkMinutes(335), 5);
  assert.equal(walkMinutes(670), 10);
});

test('expandRadius: 다음 단계, 마지막이면 null', () => {
  assert.equal(expandRadius(3000), 5000);
  assert.equal(expandRadius(5000), 10000);
  assert.equal(expandRadius(10000), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/geo.test.js`
Expected: FAIL — `Cannot find module '../src/geo.js'`

- [ ] **Step 3: 구현**

`src/geo.js`:

```js
import { RADIUS_STEPS_M, WALK_METERS_PER_MINUTE } from './constants.js';

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s))));
}

export function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  return rounded >= 1000 ? '1.0km' : `${rounded}m`;
}

export function walkMinutes(meters) {
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE));
}

export function expandRadius(currentM) {
  const i = RADIUS_STEPS_M.indexOf(currentM);
  if (i === -1 || i === RADIUS_STEPS_M.length - 1) return null;
  return RADIUS_STEPS_M[i + 1];
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/geo.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/geo.js src/constants.js test/geo.test.js && git commit -m "feat: 거리 계산과 표기 함수"
```

---

## Task 2: 판정 함수와 문자 본문 — 순수 로직

**Files:**
- Create: `src/trips.js` (판정 함수만), `src/share.js` (문자열 생성만)
- Test: `test/trips.test.js`, `test/share.test.js`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/trips.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isStale, hasArrived } from '../src/trips.js';

const now = new Date('2026-08-25T10:00:00Z');

test('isStale: 2분 이내 신호는 살아 있다', () => {
  assert.equal(isStale(new Date('2026-08-25T09:59:00Z'), now), false);
});

test('isStale: 2분을 넘기면 유령이다', () => {
  assert.equal(isStale(new Date('2026-08-25T09:57:00Z'), now), true);
});

test('isStale: 정확히 2분은 아직 살아 있다', () => {
  assert.equal(isStale(new Date('2026-08-25T09:58:00Z'), now), false);
});

test('isStale: 문자열 시각도 받는다', () => {
  assert.equal(isStale('2026-08-25T09:57:00Z', now), true);
});

test('hasArrived: 100m 이내면 도착', () => {
  assert.equal(hasArrived({ lat: 37.4980, lng: 127.0277 }, { lat: 37.4979, lng: 127.0276 }), true);
});

test('hasArrived: 100m를 넘으면 이동 중', () => {
  assert.equal(hasArrived({ lat: 37.5006, lng: 127.0365 }, { lat: 37.4979, lng: 127.0276 }), false);
});
```

`test/share.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapLink, buildSmsBody, buildSmsHref } from '../src/share.js';

const shelter = { id: 'abc', name: '도곡초등학교 지하', lat: 37.4979, lng: 127.0276 };

test('buildMapLink: 좌표가 들어간 카카오맵 링크', () => {
  const link = buildMapLink(shelter);
  assert.ok(link.startsWith('https://map.kakao.com/link/map/'));
  assert.ok(link.includes('37.4979') && link.includes('127.0276'));
});

test('buildSmsBody: 이름과 링크를 포함한다', () => {
  const body = buildSmsBody(shelter);
  assert.ok(body.includes('도곡초등학교 지하'));
  assert.ok(body.includes('https://map.kakao.com/'));
});

test('buildSmsBody: 이름의 줄바꿈을 정리한다', () => {
  assert.ok(buildSmsBody({ ...shelter, name: '도곡\n초등학교' }).includes('도곡 초등학교'));
});

test('buildSmsHref: sms 스킴이고 공백이 인코딩된다', () => {
  const href = buildSmsHref(shelter);
  assert.ok(href.startsWith('sms:?body='));
  assert.ok(!href.includes(' '));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/trips.test.js test/share.test.js`
Expected: FAIL — 두 모듈 모두 없음

- [ ] **Step 3: 구현**

`src/trips.js` (이 태스크에서는 여기까지):

```js
import { TRIP_STALE_MS, ARRIVAL_RADIUS_M } from './constants.js';
import { haversineMeters } from './geo.js';

export function isStale(lastSeenAt, now = new Date()) {
  const last = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  return now.getTime() - last.getTime() > TRIP_STALE_MS;
}

export function hasArrived(current, shelter) {
  return haversineMeters(current, shelter) <= ARRIVAL_RADIUS_M;
}
```

`src/share.js` (이 태스크에서는 여기까지):

```js
function oneLine(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

export function buildMapLink(shelter) {
  return `https://map.kakao.com/link/map/${encodeURIComponent(oneLine(shelter.name))},${shelter.lat},${shelter.lng}`;
}

export function buildSmsBody(shelter) {
  return `저는 ${oneLine(shelter.name)} 대피소로 갑니다.\n${buildMapLink(shelter)}`;
}

export function buildSmsHref(shelter) {
  return `sms:?body=${encodeURIComponent(buildSmsBody(shelter))}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/`
Expected: PASS, 18 tests

- [ ] **Step 5: Commit**

```bash
git add src/trips.js src/share.js test/ && git commit -m "feat: 판정 함수와 문자 본문 생성"
```

---

## Task 3: Supabase 스키마

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: 스키마 파일 작성**

`supabase/schema.sql`:

```sql
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
  source_updated_at date,
  unique (category, ext_id)
);

create index if not exists shelters_lat_idx on shelters (lat);
create index if not exists shelters_lng_idx on shelters (lng);
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

-- ─────────────────────────────── 집계 트리거

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
    select p_radius_m / 111320.0                                        as dlat,
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
create policy shelters_read on shelters for select to anon, authenticated using (true);

drop policy if exists counts_read on shelter_live_counts;
create policy counts_read on shelter_live_counts for select to anon, authenticated using (true);

-- trips 에는 정책을 만들지 않는다. RLS 활성 + 정책 없음 = 익명 직접 접근 전면 차단.
-- 조작은 security definer RPC 로만 가능하다.

grant execute on function nearby_shelters(double precision, double precision, integer, text[]) to anon, authenticated;
grant execute on function start_trip(text, uuid)      to anon, authenticated;
grant execute on function trip_heartbeat(text)        to anon, authenticated;
grant execute on function end_trip(text, text)        to anon, authenticated;
grant execute on function shelter_counts(uuid[])      to anon, authenticated;
revoke execute on function bump_count(uuid, integer)  from anon, authenticated;
revoke execute on function expire_stale_trips()       from anon, authenticated;

-- ─────────────────────────────── 실시간 구독 대상

alter publication supabase_realtime add table shelter_live_counts;

-- ─────────────────────────────── 주기 정리 (pg_cron 사용 가능 시)

create extension if not exists pg_cron;
select cron.schedule('expire-stale-trips', '* * * * *', $$select expire_stale_trips()$$);
```

- [ ] **Step 2: Supabase에 적용한다**

Supabase 대시보드 → SQL Editor → 위 파일 전체를 붙여넣고 실행.

Expected: `Success. No rows returned`

`pg_cron` 확장이 없다는 오류가 나면 마지막 두 줄만 지우고 다시 실행한다. `start_trip`이 매번 `expire_stale_trips()`를 호출하므로 정리는 계속 동작한다.

- [ ] **Step 3: 스키마가 적용됐는지 확인한다**

SQL Editor에서:

```sql
select count(*) from shelters;
select nearby_shelters(37.4979, 127.0276, 3000, array['civil_defense']);
```

Expected: 각각 `0`, 빈 결과. 오류가 없으면 성공.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql && git commit -m "feat: Supabase 스키마와 RPC"
```

---

## Task 4: 공공데이터 적재 스크립트

4종 데이터의 실제 제공처와 필드명은 이 태스크에서 확정한다. 종류별 어댑터만 다르고 출력 스키마는 동일하다.

**Files:**
- Create: `scripts/import-shelters.mjs`, `.env.example`
- Test: `test/normalize.test.js`
- Create: `scripts/normalize.js` (순수 변환 함수, 테스트 대상)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/normalize.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow, isValidRow, dedupe } from '../scripts/normalize.js';

test('normalizeRow: 민방위 원본을 공통 스키마로 바꾼다', () => {
  const row = normalizeRow('civil_defense', {
    MNG_SN: '12345',
    REARE_NM: '  도곡초등학교  지하 ',
    RONA_DADDR: '서울 강남구 도곡로 123',
    LAT: '37.4979',
    LOT: '127.0276',
    SHNT_PSBLTY_NOPE: '500',
  });
  assert.equal(row.ext_id, '12345');
  assert.equal(row.category, 'civil_defense');
  assert.equal(row.name, '도곡초등학교 지하');
  assert.equal(row.lat, 37.4979);
  assert.equal(row.lng, 127.0276);
  assert.equal(row.capacity, 500);
});

test('isValidRow: 한국 영역 밖 좌표를 거른다', () => {
  assert.equal(isValidRow({ name: 'a', lat: 37.5, lng: 127.0 }), true);
  assert.equal(isValidRow({ name: 'a', lat: 0, lng: 0 }), false);
  assert.equal(isValidRow({ name: 'a', lat: 51.5, lng: -0.1 }), false);
});

test('isValidRow: 이름이 비면 거른다', () => {
  assert.equal(isValidRow({ name: '', lat: 37.5, lng: 127.0 }), false);
});

test('dedupe: category+ext_id 가 같으면 뒤엣것을 남긴다', () => {
  const out = dedupe([
    { category: 'flood', ext_id: '1', name: '옛것' },
    { category: 'flood', ext_id: '1', name: '새것' },
    { category: 'flood', ext_id: '2', name: '다른것' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.ext_id === '1').name, '새것');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/normalize.test.js`
Expected: FAIL — `Cannot find module '../scripts/normalize.js'`

- [ ] **Step 3: 구현**

`scripts/normalize.js`:

```js
const FIELD_MAP = {
  civil_defense: { ext: 'MNG_SN', name: 'REARE_NM', addr: 'RONA_DADDR', lat: 'LAT',   lng: 'LOT',   cap: 'SHNT_PSBLTY_NOPE' },
  earthquake:    { ext: 'MNG_SN', name: 'VT_ACMDFCLTY_NM', addr: 'RONA_DADDR', lat: 'LAT', lng: 'LOT', cap: 'SHNT_PSBLTY_NOPE' },
  heat_cold:     { ext: 'RSTR_NM', name: 'RSTR_NM', addr: 'RN_DTL_ADRES', lat: 'LA',  lng: 'LO',  cap: 'USE_PSBL_NMPR' },
  flood:         { ext: 'MNG_SN', name: 'REARE_NM', addr: 'RONA_DADDR', lat: 'LAT',   lng: 'LOT',   cap: null },
};

const oneLine = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = Number(String(v ?? '').trim()); return Number.isFinite(n) ? n : null; };

export function normalizeRow(category, raw) {
  const m = FIELD_MAP[category];
  if (!m) throw new Error(`알 수 없는 종류: ${category}`);
  return {
    ext_id: oneLine(raw[m.ext]),
    category,
    name: oneLine(raw[m.name]),
    address: oneLine(raw[m.addr]),
    lat: num(raw[m.lat]),
    lng: num(raw[m.lng]),
    capacity: m.cap ? num(raw[m.cap]) : null,
    detail: oneLine(raw.GRND_UDGD_SE ?? raw.FCLTY_SCL ?? '') || null,
    tel: oneLine(raw.TELNO ?? '') || null,
    source_updated_at: null,
  };
}

// 대한민국 영역 대략 경계
export function isValidRow(row) {
  if (!row.name) return false;
  if (row.lat == null || row.lng == null) return false;
  return row.lat >= 33 && row.lat <= 39 && row.lng >= 124 && row.lng <= 132;
}

export function dedupe(rows) {
  const seen = new Map();
  for (const r of rows) seen.set(`${r.category}::${r.ext_id}`, r);
  return [...seen.values()];
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/normalize.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: 적재 스크립트 작성**

`.env.example`:

```
DATA_GO_KR_KEY=발급받은_공공데이터포털_디코딩_키
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=서비스_롤_키_절대_공개금지
```

`scripts/import-shelters.mjs`:

```js
import { createClient } from '@supabase/supabase-js';
import { normalizeRow, isValidRow, dedupe } from './normalize.js';

const KEY = process.env.DATA_GO_KR_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('환경변수 DATA_GO_KR_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

// 종류별 엔드포인트. 실제 URL은 공공데이터포털 활용신청 후 상세 페이지에서 확인해 채운다.
const SOURCES = {
  civil_defense: 'https://www.safemap.go.kr/openApiService/data/getCvlfShuntPlaceData.do',
  earthquake:    'https://www.safemap.go.kr/openApiService/data/getEqkShuntPlaceData.do',
  heat_cold:     'https://www.safemap.go.kr/openApiService/data/getColdShuntPlaceData.do',
  flood:         'https://www.safemap.go.kr/openApiService/data/getFloodShuntPlaceData.do',
};

const PAGE_SIZE = 1000;

async function fetchCategory(category) {
  const base = SOURCES[category];
  const rows = [];
  for (let page = 1; page <= 50; page += 1) {
    const url = `${base}?serviceKey=${encodeURIComponent(KEY)}&pageNo=${page}&numOfRows=${PAGE_SIZE}&dataType=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${category} 페이지 ${page} 실패: HTTP ${res.status}`);
    const json = await res.json();
    const items = json?.response?.body?.items?.item ?? json?.body?.items ?? [];
    const list = Array.isArray(items) ? items : [items];
    if (list.length === 0) break;
    rows.push(...list);
    console.log(`  ${category} 페이지 ${page}: ${list.length}건 (누적 ${rows.length})`);
    if (list.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let all = [];

  for (const category of Object.keys(SOURCES)) {
    console.log(`${category} 내려받는 중...`);
    try {
      const raw = await fetchCategory(category);
      const normalized = raw.map((r) => normalizeRow(category, r)).filter(isValidRow);
      console.log(`  → 유효 ${normalized.length}건 / 원본 ${raw.length}건`);
      all.push(...normalized);
    } catch (err) {
      console.warn(`  ! ${category} 건너뜀: ${err.message}`);
    }
  }

  all = dedupe(all);
  console.log(`총 ${all.length}건 적재 시작`);

  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const { error } = await supabase.from('shelters').upsert(chunk, { onConflict: 'category,ext_id' });
    if (error) throw new Error(`적재 실패 (${i}~): ${error.message}`);
    console.log(`  ${Math.min(i + 500, all.length)} / ${all.length}`);
  }

  const { count } = await supabase.from('shelters').select('*', { count: 'exact', head: true });
  console.log(`완료. shelters 총 ${count}건`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: 의존성 설치 후 실행**

```bash
npm install @supabase/supabase-js
```

```bash
node --env-file=.env scripts/import-shelters.mjs
```

Expected: 종류별 진행 로그 후 `완료. shelters 총 NNNNN건`

일부 종류가 `건너뜀`으로 나오면 해당 엔드포인트 URL과 필드명을 공공데이터포털 상세 페이지에서 확인해 `SOURCES`와 `scripts/normalize.js`의 `FIELD_MAP`을 고친다. **최소한 `civil_defense`는 반드시 성공해야 다음 태스크로 넘어간다.**

- [ ] **Step 7: 적재 결과를 눈으로 확인한다**

Supabase SQL Editor:

```sql
select category, count(*) from shelters group by category order by 2 desc;
select name, address, distance_m from nearby_shelters(37.4979, 127.0276, 3000, array['civil_defense','earthquake','heat_cold','flood']) limit 5;
```

Expected: 종류별 건수가 나오고, 두 번째 쿼리가 거리순 5건을 반환한다.

- [ ] **Step 8: Commit**

```bash
git add scripts/ test/normalize.test.js .env.example package.json package-lock.json
git commit -m "feat: 공공데이터 대피소 적재 스크립트"
```

---

## Task 5: Supabase 클라이언트와 대피소 조회

**Files:**
- Create: `src/supabase.js`, `src/shelters.js`
- Test: `test/shelters.test.js`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

캐시 로직은 `localStorage`를 주입받게 만들어 Node에서 검증한다.

`test/shelters.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheShelters, readCachedShelters } from '../src/shelters.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('cacheShelters / readCachedShelters: 왕복한다', () => {
  const s = fakeStorage();
  const list = [{ id: '1', name: '가', lat: 37.5, lng: 127.0, distance_m: 100 }];
  cacheShelters(list, { lat: 37.5, lng: 127.0 }, s);
  const cached = readCachedShelters(s);
  assert.equal(cached.shelters.length, 1);
  assert.equal(cached.shelters[0].name, '가');
  assert.equal(cached.origin.lat, 37.5);
});

test('readCachedShelters: 캐시가 없으면 null', () => {
  assert.equal(readCachedShelters(fakeStorage()), null);
});

test('readCachedShelters: 깨진 JSON이면 null 이고 던지지 않는다', () => {
  const s = fakeStorage();
  s.setItem('shelter.cache', '{{{');
  assert.equal(readCachedShelters(s), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/shelters.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/supabase.js`:

```js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// index.html 이 CDN 에서 전역 supabase 를 먼저 로드한다.
export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 2 } },
});
```

`src/shelters.js`:

```js
import { STORAGE_KEYS } from './constants.js';

export function cacheShelters(shelters, origin, storage = globalThis.localStorage) {
  try {
    storage.setItem(
      STORAGE_KEYS.shelterCache,
      JSON.stringify({ shelters, origin, savedAt: new Date().toISOString() }),
    );
  } catch { /* 저장 공간 부족은 무시한다 */ }
}

export function readCachedShelters(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEYS.shelterCache);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.shelters)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchNearbyShelters({ lat, lng, radiusM, categories }) {
  const { db } = await import('./supabase.js');
  const { data, error } = await db.rpc('nearby_shelters', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusM, p_categories: categories,
  });
  if (error) throw new Error(`대피소 조회 실패: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/`
Expected: PASS, 25 tests

- [ ] **Step 5: Commit**

```bash
git add src/supabase.js src/shelters.js test/shelters.test.js
git commit -m "feat: Supabase 클라이언트와 대피소 조회"
```

---

## Task 6: 위치 획득과 주소 검색 폴백

**Files:**
- Create: `src/location.js`

- [ ] **Step 1: 구현**

브라우저 API만 다루므로 단위 테스트 대신 Task 16의 수동 확인 목록으로 검증한다.

`src/location.js`:

```js
import { GPS_TIMEOUT_MS } from './constants.js';

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(new Error('UNSUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'DENIED' : 'FAILED')),
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 30_000 },
    );
  });
}

export function watchPosition(onMove) {
  if (!isGeolocationSupported()) return () => {};
  const id = navigator.geolocation.watchPosition(
    (pos) => onMove({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => {},
    { enableHighAccuracy: true, maximumAge: 15_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

// 카카오 지오코더로 동네 이름 → 좌표
export function searchAddress(query) {
  return new Promise((resolve, reject) => {
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(query, (result, status) => {
      if (status === window.kakao.maps.services.Status.OK && result[0]) {
        resolve({ lat: Number(result[0].y), lng: Number(result[0].x), label: result[0].address_name });
        return;
      }
      geocoder.keywordSearch?.(query, (kw, kwStatus) => {
        if (kwStatus === window.kakao.maps.services.Status.OK && kw[0]) {
          resolve({ lat: Number(kw[0].y), lng: Number(kw[0].x), label: kw[0].place_name });
        } else {
          reject(new Error('NOT_FOUND'));
        }
      });
    });
  });
}

// 좌표 → 동네 이름 (헤더 표시용)
export function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    try {
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.coord2RegionCode(lng, lat, (result, status) => {
        if (status === window.kakao.maps.services.Status.OK && result[0]) {
          resolve(result[0].address_name);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/location.js && git commit -m "feat: 위치 획득과 주소 검색"
```

---

## Task 7: 화면 골격과 어르신 기준 스타일

**Files:**
- Create: `index.html`, `style.css`

- [ ] **Step 1: `index.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>대피소 찾기</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <div id="consent" class="consent" hidden>
    <div class="consent__box">
      <h1>대피소 찾기</h1>
      <p>가까운 대피소를 찾기 위해 <b>현재 위치</b>를 사용합니다.
         위치는 대피소를 찾는 데에만 쓰이고 저장하지 않습니다.</p>
      <button id="consent-ok" class="btn btn--primary">시작하기</button>
    </div>
  </div>

  <header class="header">
    <h1 class="header__title">내 근처 대피소</h1>
    <p id="place" class="header__place">위치를 찾는 중…</p>
  </header>

  <nav id="chips" class="chips" aria-label="대피소 종류 고르기"></nav>

  <div id="map" class="map" role="img" aria-label="주변 대피소 지도"></div>

  <main id="list" class="list" aria-live="polite"></main>

  <div id="fallback" class="fallback" hidden>
    <label for="addr">동네 이름으로 찾기</label>
    <div class="fallback__row">
      <input id="addr" type="text" inputmode="search" placeholder="예: 강남구 도곡동" />
      <button id="addr-go" class="btn">찾기</button>
    </div>
    <p id="addr-error" class="error" hidden></p>
  </div>

  <footer class="footer">
    <button id="speak" class="btn btn--wide">소리로 듣기</button>
    <button id="share" class="btn btn--wide">가족에게</button>
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=KAKAO_JS_KEY_PLACEHOLDER&libraries=services&autoload=false"></script>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

카카오 SDK의 `appkey`는 `src/main.js`가 시작할 때 `config.js`의 값으로 교체한다 (Task 9 Step 1).

- [ ] **Step 2: `style.css` 작성**

설계서 6절의 어르신 기준을 그대로 수치화한다. 본문 최소 18px, 터치 타깃 최소 56px, 명암비 7:1 이상.

```css
:root {
  --bg: #ffffff;
  --fg: #111111;
  --muted: #444444;
  --line: #cccccc;
  --primary: #0b5c3f;
  --primary-fg: #ffffff;
  --accent-bg: #e6f1fb;
  --accent-fg: #0c447c;
  --danger: #a32d2d;
  --tap: 56px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 18px;
  line-height: 1.6;
  color: var(--fg);
  background: var(--bg);
  padding-bottom: calc(var(--tap) + 32px);
}

.header { padding: 16px 20px 10px; border-bottom: 1px solid var(--line); }
.header__title { margin: 0; font-size: 26px; font-weight: 700; }
.header__place { margin: 4px 0 0; font-size: 17px; color: var(--muted); }

.chips { display: flex; gap: 8px; padding: 12px 20px; overflow-x: auto; }
.chip {
  flex: none; min-height: 48px; padding: 0 18px;
  font-size: 17px; font-family: inherit;
  border: 2px solid var(--line); border-radius: 999px;
  background: var(--bg); color: var(--muted); cursor: pointer;
}
.chip[aria-pressed="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); font-weight: 700; }

.map { height: 220px; background: #eeeeee; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.map--hidden { display: none; }

.list { padding: 16px 20px 0; }

.card { border: 2px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 14px; }
.card--top { border-color: var(--fg); }
.card__name { margin: 0; font-size: 23px; font-weight: 700; }
.card__meta { margin: 6px 0 0; font-size: 18px; color: var(--muted); }
.card__count {
  display: inline-block; margin: 12px 0;
  background: var(--accent-bg); color: var(--accent-fg);
  font-size: 18px; font-weight: 700; padding: 8px 16px; border-radius: 10px;
}
.card__note { margin: 10px 0 0; font-size: 17px; color: var(--danger); }

.row {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  width: 100%; min-height: var(--tap); padding: 14px 16px; margin-bottom: 10px;
  border: 1px solid var(--line); border-radius: 12px;
  background: var(--bg); font-family: inherit; text-align: left; cursor: pointer;
}
.row__name { font-size: 20px; font-weight: 700; }
.row__meta { font-size: 17px; color: var(--muted); }

.btn {
  min-height: var(--tap); padding: 0 20px;
  font-size: 19px; font-family: inherit; font-weight: 700;
  border: 2px solid var(--fg); border-radius: 12px;
  background: var(--bg); color: var(--fg); cursor: pointer;
}
.btn--primary { background: var(--primary); border-color: var(--primary); color: var(--primary-fg); }
.btn--wide { flex: 1; }
.btn--block { display: block; width: 100%; }
.btn:active { transform: scale(0.99); }

.footer {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; gap: 10px; padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
  background: var(--bg); border-top: 1px solid var(--line);
}

.fallback { padding: 16px 20px; }
.fallback__row { display: flex; gap: 8px; }
.fallback input {
  flex: 1; min-height: var(--tap); padding: 0 14px;
  font-size: 19px; font-family: inherit;
  border: 2px solid var(--line); border-radius: 12px;
}
.error { color: var(--danger); font-size: 17px; }
.empty { padding: 24px 0; font-size: 19px; color: var(--muted); text-align: center; }

.consent { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: grid; place-items: center; padding: 20px; z-index: 10; }
.consent__box { background: var(--bg); border-radius: 16px; padding: 24px; max-width: 420px; }
.consent__box h1 { margin: 0 0 12px; font-size: 26px; }
.consent__box p { margin: 0 0 20px; }
.consent__box .btn { width: 100%; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
```

- [ ] **Step 3: 브라우저에서 골격을 확인한다**

```bash
npm run serve
```

`http://localhost:5173` 을 연다.
Expected: 제목·필터 영역·회색 지도 자리·하단 두 버튼이 보인다. 콘솔에 `main.js` 없음 오류가 뜨는 것은 정상 (다음 태스크에서 만든다).

- [ ] **Step 4: Commit**

```bash
git add index.html style.css && git commit -m "feat: 화면 골격과 어르신 기준 스타일"
```

---

## Task 8: 길찾기 링크와 음성 문장

**Files:**
- Create: `src/directions.js`, `src/speech.js`
- Test: `test/directions.test.js`, `test/speech.test.js`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/directions.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkDirectionsUrl } from '../src/directions.js';

const shelter = { name: '도곡초등학교 지하', lat: 37.4979, lng: 127.0276 };
const me = { lat: 37.5006, lng: 127.0365 };

test('buildWalkDirectionsUrl: 카카오맵 도보 길찾기 URL', () => {
  const url = buildWalkDirectionsUrl(me, shelter);
  assert.ok(url.startsWith('https://map.kakao.com/'));
  assert.ok(url.includes('37.4979') && url.includes('127.0276'));
  assert.ok(url.includes('37.5006') && url.includes('127.0365'));
});

test('buildWalkDirectionsUrl: 출발지를 모르면 목적지만 있는 링크', () => {
  const url = buildWalkDirectionsUrl(null, shelter);
  assert.ok(url.includes('37.4979'));
  assert.ok(!url.includes('null'));
});

test('buildWalkDirectionsUrl: 이름의 공백이 인코딩된다', () => {
  assert.ok(!buildWalkDirectionsUrl(me, shelter).includes(' '));
});
```

`test/speech.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeechText } from '../src/speech.js';

test('buildSpeechText: 이름, 도보 시간, 인원을 읽는다', () => {
  const text = buildSpeechText({ name: '도곡초등학교 지하', distance_m: 320 }, 12);
  assert.ok(text.includes('도곡초등학교 지하'));
  assert.ok(text.includes('5분'));
  assert.ok(text.includes('12명'));
});

test('buildSpeechText: 인원이 0이면 인원 문장을 빼고 읽는다', () => {
  const text = buildSpeechText({ name: '가나', distance_m: 100 }, 0);
  assert.ok(!text.includes('0명'));
  assert.ok(text.includes('가나'));
});

test('buildSpeechText: 대피소가 없으면 안내 문장', () => {
  assert.ok(buildSpeechText(null, 0).includes('찾지 못했'));
});

test('buildSpeechText: 이름의 줄바꿈을 정리한다', () => {
  assert.ok(!buildSpeechText({ name: '가\n나', distance_m: 100 }, 0).includes('\n'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/directions.test.js test/speech.test.js`
Expected: FAIL — 두 모듈 모두 없음

- [ ] **Step 3: 구현**

`src/directions.js`:

```js
const oneLine = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

export function buildWalkDirectionsUrl(from, shelter) {
  const to = `${encodeURIComponent(oneLine(shelter.name))},${shelter.lat},${shelter.lng}`;
  if (!from) return `https://map.kakao.com/link/to/${to}`;
  const start = `${encodeURIComponent('내 위치')},${from.lat},${from.lng}`;
  return `https://map.kakao.com/link/by/WALK/${start}/${to}`;
}
```

`src/speech.js`:

```js
import { walkMinutes } from './geo.js';

const oneLine = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

export function buildSpeechText(shelter, movingCount = 0) {
  if (!shelter) return '가까운 대피소를 찾지 못했습니다. 도움이 필요하면 119로 전화하세요.';
  const minutes = walkMinutes(shelter.distance_m);
  const base = `가장 가까운 대피소는 ${oneLine(shelter.name)}, 걸어서 ${minutes}분입니다.`;
  return movingCount > 0 ? `${base} 지금 ${movingCount}명이 가고 있습니다.` : base;
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text) {
  if (!isSpeechSupported()) return false;
  window.speechSynthesis.cancel();
  const utter = new window.SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
  return true;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/`
Expected: PASS, 32 tests

- [ ] **Step 5: Commit**

```bash
git add src/directions.js src/speech.js test/directions.test.js test/speech.test.js
git commit -m "feat: 길찾기 링크와 음성 안내 문장"
```

---

## Task 9: 카카오 지도 렌더

**Files:**
- Create: `src/map.js`

- [ ] **Step 1: 구현**

지도가 실패해도 목록은 계속 보여야 하므로, 이 모듈의 모든 진입점은 실패 시 `false`를 돌려주고 던지지 않는다.

`src/map.js`:

```js
let map = null;
let markers = [];
let meMarker = null;

export function isMapReady() {
  return map !== null;
}

export function initMap(el, center) {
  try {
    if (!window.kakao?.maps) return false;
    map = new window.kakao.maps.Map(el, {
      center: new window.kakao.maps.LatLng(center.lat, center.lng),
      level: 5,
    });
    return true;
  } catch {
    map = null;
    return false;
  }
}

export function renderMarkers(shelters, me) {
  if (!map) return false;
  try {
    markers.forEach((m) => m.setMap(null));
    markers = [];

    for (const s of shelters) {
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        title: s.name,
      });
      marker.setMap(map);
      markers.push(marker);
    }

    if (me) {
      meMarker?.setMap(null);
      meMarker = new window.kakao.maps.Circle({
        center: new window.kakao.maps.LatLng(me.lat, me.lng),
        radius: 25,
        strokeWeight: 3,
        strokeColor: '#ffffff',
        fillColor: '#1a73e8',
        fillOpacity: 1,
      });
      meMarker.setMap(map);
    }

    const bounds = new window.kakao.maps.LatLngBounds();
    if (me) bounds.extend(new window.kakao.maps.LatLng(me.lat, me.lng));
    shelters.slice(0, 5).forEach((s) => bounds.extend(new window.kakao.maps.LatLng(s.lat, s.lng)));
    if (shelters.length > 0 || me) map.setBounds(bounds);
    return true;
  } catch {
    return false;
  }
}

```

- [ ] **Step 2: Commit**

```bash
git add src/map.js && git commit -m "feat: 카카오 지도 렌더"
```

---

## Task 10: 이동 기록과 실시간 인원

Task 2에서 만든 `src/trips.js`에 네트워크 부분을 덧붙인다.

**Files:**
- Modify: `src/trips.js` (Task 2 내용 뒤에 추가)

- [ ] **Step 1: `src/trips.js`에 아래 내용을 추가한다**

기존 `isStale`, `hasArrived`는 그대로 두고 파일 끝에 이어 붙인다. 맨 위 `constants.js` import 문에 `STORAGE_KEYS`와 `HEARTBEAT_INTERVAL_MS`를 추가한다 — 아래처럼 되어야 한다.

```js
import { TRIP_STALE_MS, ARRIVAL_RADIUS_M, STORAGE_KEYS, HEARTBEAT_INTERVAL_MS } from './constants.js';
```

이어서 파일 끝에 추가:

```js
let heartbeatTimer = null;
let countsChannel = null;

export function getDeviceId(storage = globalThis.localStorage) {
  let id = storage.getItem(STORAGE_KEYS.deviceId);
  if (!id) {
    id = crypto.randomUUID();
    storage.setItem(STORAGE_KEYS.deviceId, id);
  }
  return id;
}

export async function startTrip(shelterId) {
  const { db } = await import('./supabase.js');
  const { error } = await db.rpc('start_trip', {
    p_device_id: getDeviceId(),
    p_shelter_id: shelterId,
  });
  if (error) throw new Error(`이동 시작 기록 실패: ${error.message}`);

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => { sendHeartbeat().catch(() => {}); }, HEARTBEAT_INTERVAL_MS);
}

export async function sendHeartbeat() {
  const { db } = await import('./supabase.js');
  await db.rpc('trip_heartbeat', { p_device_id: getDeviceId() });
}

export async function endTrip(reason) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  const { db } = await import('./supabase.js');
  await db.rpc('end_trip', { p_device_id: getDeviceId(), p_reason: reason });
}

export async function fetchCounts(shelterIds) {
  if (shelterIds.length === 0) return new Map();
  const { db } = await import('./supabase.js');
  const { data, error } = await db.rpc('shelter_counts', { p_shelter_ids: shelterIds });
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [r.shelter_id, r.moving_count]));
}

// shelter_live_counts 변경을 구독한다. 실패해도 앱은 계속 동작해야 한다.
export async function subscribeCounts(onChange) {
  const { db } = await import('./supabase.js');
  await unsubscribeCounts();
  countsChannel = db
    .channel('shelter-counts')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shelter_live_counts' },
        (payload) => {
          const row = payload.new ?? payload.old;
          if (row?.shelter_id != null) onChange(row.shelter_id, row.moving_count ?? 0);
        })
    .subscribe();
  return countsChannel;
}

export async function unsubscribeCounts() {
  if (!countsChannel) return;
  const { db } = await import('./supabase.js');
  await db.removeChannel(countsChannel);
  countsChannel = null;
}
```

- [ ] **Step 2: 기존 테스트가 여전히 통과하는지 확인한다**

Run: `node --test test/`
Expected: PASS, 32 tests. `crypto.randomUUID`나 `localStorage`는 호출되지 않으므로 Node에서도 통과한다.

- [ ] **Step 3: Commit**

```bash
git add src/trips.js && git commit -m "feat: 이동 기록과 실시간 인원 구독"
```

---

## Task 11: 화면 렌더

**Files:**
- Create: `src/ui.js`
- Modify: `src/share.js` (문자 앱 열기 추가)

- [ ] **Step 1: `src/share.js` 끝에 추가한다**

```js
export function openSmsApp(shelter) {
  window.location.href = buildSmsHref(shelter);
}
```

- [ ] **Step 2: `src/ui.js` 작성**

상태를 받아 DOM을 그린다. 상태를 소유하지 않는다.

```js
import { CATEGORIES } from './constants.js';
import { formatDistance, walkMinutes } from './geo.js';

const $ = (id) => document.getElementById(id);

export function renderPlace(text) {
  $('place').textContent = text;
}

export function renderChips(selected, onToggle) {
  const nav = $('chips');
  nav.innerHTML = '';
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.textContent = cat.label;
    btn.setAttribute('aria-label', cat.aria);
    btn.setAttribute('aria-pressed', String(selected.includes(cat.key)));
    btn.addEventListener('click', () => onToggle(cat.key));
    nav.appendChild(btn);
  }
}

export function renderList(shelters, counts, handlers, notice) {
  const list = $('list');
  list.innerHTML = '';

  if (notice) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = notice;
    list.appendChild(p);
  }

  if (shelters.length === 0) {
    if (!notice) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '가까운 대피소를 찾지 못했습니다.';
      list.appendChild(p);
    }
    return;
  }

  list.appendChild(topCard(shelters[0], counts.get(shelters[0].id) ?? 0, handlers));
  for (const s of shelters.slice(1, 10)) {
    list.appendChild(summaryRow(s, counts.get(s.id) ?? 0, handlers));
  }
}

function topCard(shelter, count, handlers) {
  const card = document.createElement('section');
  card.className = 'card card--top';

  const name = document.createElement('h2');
  name.className = 'card__name';
  name.textContent = shelter.name;
  card.appendChild(name);

  const meta = document.createElement('p');
  meta.className = 'card__meta';
  meta.textContent = `${formatDistance(shelter.distance_m)} · 걸어서 ${walkMinutes(shelter.distance_m)}분`;
  card.appendChild(meta);

  if (count > 0) {
    const badge = document.createElement('p');
    badge.className = 'card__count';
    badge.textContent = `지금 ${count}명이 가는 중`;
    card.appendChild(badge);
  }

  const go = document.createElement('button');
  go.className = 'btn btn--primary btn--block';
  go.type = 'button';
  go.textContent = '길찾기';
  go.addEventListener('click', () => handlers.onGo(shelter));
  card.appendChild(go);

  return card;
}

function summaryRow(shelter, count, handlers) {
  const row = document.createElement('button');
  row.className = 'row';
  row.type = 'button';

  const left = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'row__name';
  name.textContent = shelter.name;
  const meta = document.createElement('span');
  meta.className = 'row__meta';
  meta.textContent =
    `\n${formatDistance(shelter.distance_m)} · 걸어서 ${walkMinutes(shelter.distance_m)}분` +
    (count > 0 ? ` · ${count}명` : '');
  meta.style.display = 'block';
  left.appendChild(name);
  left.appendChild(meta);

  const chevron = document.createElement('span');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  chevron.style.fontSize = '24px';

  row.appendChild(left);
  row.appendChild(chevron);
  row.addEventListener('click', () => handlers.onSelect(shelter));
  return row;
}

export function showFallback(show) {
  $('fallback').hidden = !show;
}

export function showAddressError(message) {
  const el = $('addr-error');
  el.textContent = message ?? '';
  el.hidden = !message;
}

export function hideMap() {
  $('map').classList.add('map--hidden');
}

export function setSpeakVisible(visible) {
  $('speak').hidden = !visible;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui.js src/share.js && git commit -m "feat: 화면 렌더"
```

---

## Task 12: 진입점 배선

**Files:**
- Create: `src/main.js`

- [ ] **Step 1: `src/main.js` 작성**

```js
import { KAKAO_JS_KEY } from './config.js';
import { CATEGORY_KEYS, RADIUS_STEPS_M, STORAGE_KEYS } from './constants.js';
import { expandRadius } from './geo.js';
import { fetchNearbyShelters, cacheShelters, readCachedShelters } from './shelters.js';
import { getCurrentPosition, watchPosition, searchAddress, reverseGeocode } from './location.js';
import { startTrip, endTrip, fetchCounts, subscribeCounts, hasArrived } from './trips.js';
import { buildWalkDirectionsUrl } from './directions.js';
import { buildSpeechText, speak, isSpeechSupported } from './speech.js';
import { openSmsApp } from './share.js';
import { initMap, renderMarkers, isMapReady } from './map.js';
import * as ui from './ui.js';

const state = {
  origin: null,
  radiusM: RADIUS_STEPS_M[0],
  categories: loadCategories(),
  shelters: [],
  counts: new Map(),
  target: null,
  stopWatch: null,
  notice: null,
};

function loadCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.categories) ?? 'null');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch { /* 무시 */ }
  return [...CATEGORY_KEYS];
}

function saveCategories() {
  try {
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(state.categories));
  } catch { /* 무시 */ }
}

// ── 부팅

async function boot() {
  await gateConsent();
  loadKakao();
  ui.setSpeakVisible(isSpeechSupported());
  ui.renderChips(state.categories, onToggleCategory);
  wireButtons();
  await locateAndSearch();
}

function gateConsent() {
  return new Promise((resolve) => {
    if (localStorage.getItem(STORAGE_KEYS.consent)) { resolve(); return; }
    const box = document.getElementById('consent');
    box.hidden = false;
    document.getElementById('consent-ok').addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEYS.consent, new Date().toISOString());
      box.hidden = true;
      resolve();
    }, { once: true });
  });
}

function loadKakao() {
  const tag = [...document.scripts].find((s) => s.src.includes('dapi.kakao.com'));
  if (!tag) return;
  if (tag.src.includes('KAKAO_JS_KEY_PLACEHOLDER')) {
    const fresh = document.createElement('script');
    fresh.src = tag.src.replace('KAKAO_JS_KEY_PLACEHOLDER', KAKAO_JS_KEY);
    fresh.onload = () => window.kakao?.maps?.load?.(() => {});
    document.body.appendChild(fresh);
  } else {
    window.kakao?.maps?.load?.(() => {});
  }
}

// ── 검색

async function locateAndSearch() {
  try {
    state.origin = await getCurrentPosition();
    ui.showFallback(false);
    const place = await reverseGeocode(state.origin.lat, state.origin.lng);
    ui.renderPlace(place ?? '현재 위치');
    await search();
  } catch (err) {
    ui.renderPlace(err.message === 'DENIED' ? '위치를 쓸 수 없습니다' : '위치를 찾지 못했습니다');
    ui.showFallback(true);
    showCacheIfAny();
  }
}

async function search() {
  if (!state.origin) return;
  state.radiusM = RADIUS_STEPS_M[0];
  state.notice = null;

  try {
    let found = [];
    let radius = state.radiusM;
    while (radius) {
      found = await fetchNearbyShelters({
        lat: state.origin.lat, lng: state.origin.lng,
        radiusM: radius, categories: state.categories,
      });
      if (found.length > 0) break;
      radius = expandRadius(radius);
    }
    state.radiusM = radius ?? RADIUS_STEPS_M.at(-1);
    state.shelters = found;
    cacheShelters(found, state.origin);

    if (found.length === 0) {
      state.notice = '가까운 대피소를 찾지 못했습니다. 도움이 필요하면 119로 전화하세요.';
    }

    state.counts = await fetchCounts(found.map((s) => s.id));
    draw();
    await subscribeCounts(onCountChange).catch(() => {});
    drawMap();
  } catch (err) {
    console.error(err);
    showCacheIfAny('지금은 최신 정보를 받지 못했습니다.');
  }
}

function showCacheIfAny(reason) {
  const cached = readCachedShelters();
  if (!cached) {
    state.shelters = [];
    state.notice = reason ?? '대피소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    draw();
    return;
  }
  state.shelters = cached.shelters;
  state.origin = state.origin ?? cached.origin;
  state.notice = `${reason ?? ''} 마지막으로 받은 정보를 보여드립니다.`.trim();
  draw();
}

function draw() {
  ui.renderList(state.shelters, state.counts, { onGo, onSelect }, state.notice);
}

function drawMap() {
  const el = document.getElementById('map');
  if (!state.origin) return;
  if (!isMapReady() && !initMap(el, state.origin)) { ui.hideMap(); return; }
  renderMarkers(state.shelters, state.origin);
}

function onCountChange(shelterId, count) {
  state.counts.set(shelterId, count);
  draw();
}

function onToggleCategory(key) {
  const next = state.categories.includes(key)
    ? state.categories.filter((k) => k !== key)
    : [...state.categories, key];
  state.categories = next.length > 0 ? next : [...CATEGORY_KEYS];
  saveCategories();
  ui.renderChips(state.categories, onToggleCategory);
  search();
}

function onSelect(shelter) {
  state.shelters = [shelter, ...state.shelters.filter((s) => s.id !== shelter.id)];
  draw();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── 길찾기와 이동 기록

async function onGo(shelter) {
  state.target = shelter;
  try {
    await startTrip(shelter.id);
    startArrivalWatch(shelter);
  } catch (err) {
    console.warn('인원 집계에 기록하지 못했습니다.', err);
  }
  window.location.href = buildWalkDirectionsUrl(state.origin, shelter);
}

function startArrivalWatch(shelter) {
  state.stopWatch?.();
  state.stopWatch = watchPosition((pos) => {
    state.origin = pos;
    if (hasArrived(pos, shelter)) {
      endTrip('arrived').catch(() => {});
      state.stopWatch?.();
      state.stopWatch = null;
      state.target = null;
    }
  });
}

// ── 버튼 배선

function wireButtons() {
  document.getElementById('speak').addEventListener('click', () => {
    const top = state.shelters[0] ?? null;
    speak(buildSpeechText(top, top ? state.counts.get(top.id) ?? 0 : 0));
  });

  document.getElementById('share').addEventListener('click', () => {
    const target = state.target ?? state.shelters[0];
    if (!target) return;
    openSmsApp(target);
  });

  document.getElementById('addr-go').addEventListener('click', onAddressSearch);
  document.getElementById('addr').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onAddressSearch();
  });
}

async function onAddressSearch() {
  const query = document.getElementById('addr').value.trim();
  if (!query) { ui.showAddressError('동네 이름을 입력해 주세요.'); return; }
  ui.showAddressError(null);
  try {
    const place = await searchAddress(query);
    state.origin = { lat: place.lat, lng: place.lng };
    ui.renderPlace(place.label);
    await search();
    drawMap();
  } catch {
    ui.showAddressError('그런 동네를 찾지 못했습니다. 다시 입력해 주세요.');
  }
}

window.addEventListener('pagehide', () => { state.stopWatch?.(); });

boot();
```

- [ ] **Step 2: 브라우저에서 확인한다**

```bash
npm run serve
```

`http://localhost:5173` 을 열고 위치 권한을 허용한다.
Expected: 동네 이름이 헤더에 뜨고, 지도에 마커가, 목록에 가장 가까운 대피소 카드가 보인다.

- [ ] **Step 3: Commit**

```bash
git add src/main.js && git commit -m "feat: 진입점 배선"
```

---

## Task 13: 실시간 인원 동작 확인

**Files:** 없음 (검증 태스크)

- [ ] **Step 1: 브라우저 두 개를 연다**

같은 컴퓨터에서 일반 창과 시크릿 창을 각각 `http://localhost:5173`으로 연다.
`device_id`는 localStorage에 저장되므로 시크릿 창은 별개 기기로 잡힌다.

- [ ] **Step 2: 한쪽에서 길찾기를 누른다**

Expected: 카카오맵으로 이동한다. 뒤로 돌아온다.

- [ ] **Step 3: 다른 창을 확인한다**

Expected: 해당 대피소 카드에 `지금 1명이 가는 중` 배지가 새로고침 없이 나타난다.

배지가 안 뜨면 Supabase 대시보드 → Database → Replication에서 `shelter_live_counts`가 `supabase_realtime` 퍼블리케이션에 포함돼 있는지 확인한다.

- [ ] **Step 4: 유령 기록 정리를 확인한다**

한쪽 창을 그냥 닫는다. 3분 후 다른 창을 새로고침한다.
Expected: 배지가 사라진다.

Supabase SQL Editor로 직접 확인:

```sql
select status, count(*) from trips group by status;
```

Expected: `expired` 가 1건 이상.

- [ ] **Step 5: 결과를 기록한다**

`docs/verification.md`에 위 4단계의 실제 결과를 적는다. 실패한 항목은 원인과 함께 남긴다.

- [ ] **Step 6: Commit**

```bash
git add docs/verification.md && git commit -m "docs: 실시간 인원 동작 확인 결과"
```

---

## Task 14: 오류 상황 확인

**Files:** 없음 (검증 태스크). 실패하는 항목이 나오면 해당 모듈을 고치고 커밋한다.

설계서 9절의 표를 그대로 확인한다.

- [ ] **Step 1: 위치 권한 거부**

브라우저 사이트 설정에서 위치를 차단하고 새로고침.
Expected: "동네 이름으로 찾기" 입력창이 나타난다. 비난조 문구가 없다.

- [ ] **Step 2: 동네 이름 검색**

"강남구 도곡동"을 입력하고 찾기.
Expected: 헤더가 바뀌고 목록이 갱신된다.

- [ ] **Step 3: 없는 동네 이름**

"ㅁㄴㅇㄹ"을 입력하고 찾기.
Expected: "그런 동네를 찾지 못했습니다. 다시 입력해 주세요."

- [ ] **Step 4: 종류를 하나만 켰을 때 결과 0건**

침수만 남기고 나머지 칩을 끈다 (데이터 공백 지역에서).
Expected: 반경이 자동 확대되고, 그래도 없으면 119 안내 문구가 나온다. 앱이 멈추지 않는다.

- [ ] **Step 5: Supabase 통신 실패**

DevTools → Network → Offline 후 새로고침.
Expected: 마지막 목록이 "마지막으로 받은 정보를 보여드립니다."와 함께 보인다.

- [ ] **Step 6: 카카오 SDK 실패**

`src/config.js`의 `KAKAO_JS_KEY`를 임시로 `invalid`로 바꾸고 새로고침.
Expected: 지도 영역이 사라지고 목록은 정상 동작한다. 길찾기 버튼도 계속 동작한다. 확인 후 키를 되돌린다.

- [ ] **Step 7: 결과를 기록하고 커밋**

`docs/verification.md`에 6항목의 실제 결과를 적는다.

```bash
git add -A && git commit -m "docs: 오류 상황 확인 결과"
```

---

## Task 15: 어르신 사용성 확인

**Files:** 없음 (검증 태스크). 기준 미달 항목은 `style.css`를 고치고 커밋한다.

- [ ] **Step 1: 터치 타깃 크기**

DevTools 모바일 뷰(375px)에서 모든 버튼·칩·행을 검사한다.
Expected: 높이 48px 이상, 주요 버튼은 56px 이상.

- [ ] **Step 2: 글자 크기**

Expected: 본문 18px 이상, 대피소 이름 23px, 하단 버튼 19px.

- [ ] **Step 3: 명암비**

DevTools → Elements → 색상 옆 대비 표시로 본문·버튼·배지를 확인한다.
Expected: 모두 7:1 이상. 미달이면 `style.css`의 `--muted`, `--accent-fg`를 더 어둡게 조정한다.

- [ ] **Step 4: 시스템 글꼴 확대**

OS 설정에서 글꼴 크기를 최대로 올리고 확인한다.
Expected: 글자가 잘리거나 버튼이 겹치지 않는다.

- [ ] **Step 5: 첫 화면 조작 수**

Expected: 앱을 열고 가장 가까운 대피소로 출발하기까지 필요한 탭이 `시작하기` → `위치 허용` → `길찾기` 세 번을 넘지 않는다.

- [ ] **Step 6: 결과를 기록하고 커밋**

```bash
git add -A && git commit -m "fix: 어르신 사용성 기준 반영"
```

---

## Task 16: 설정 안내 문서와 배포

**Files:**
- Create: `docs/setup.md`, `README.md`

- [ ] **Step 1: `docs/setup.md` 작성**

개발 지식이 없는 사람이 따라 할 수 있도록, 클릭 경로까지 적는다. 아래 항목을 각각 번호 매긴 단계로 쓴다.

1. **카카오 개발자 키** — developers.kakao.com 로그인 → 내 애플리케이션 → 애플리케이션 추가하기 → 앱 키 화면의 `JavaScript 키` 복사 → 플랫폼 → Web → 사이트 도메인에 `http://localhost:5173`과 배포 주소 등록
2. **공공데이터포털 키** — data.go.kr 로그인 → 대피소 4종 검색 → 각각 활용신청 → 마이페이지 → 개발계정 → `일반 인증키(Decoding)` 복사
3. **Supabase 프로젝트** — supabase.com 로그인 → New project → Project Settings → API에서 `Project URL`과 `anon public` 키 복사, `service_role` 키는 별도 보관하고 절대 공개하지 않음
4. **키 넣기** — `src/config.example.js`를 `src/config.js`로 복사해 3개 값 입력, `.env.example`를 `.env`로 복사해 적재용 값 입력
5. **DB 만들기** — Supabase SQL Editor에 `supabase/schema.sql` 전체 붙여넣고 실행
6. **대피소 데이터 넣기** — `npm install` 후 `node --env-file=.env scripts/import-shelters.mjs`
7. **실행** — `npm run serve` 후 `http://localhost:5173`
8. **배포** — vercel.com 또는 netlify.com 에 폴더를 그대로 올린 뒤, 발급된 주소를 1번의 카카오 사이트 도메인에 추가 등록

- [ ] **Step 2: `README.md` 작성**

한 문단짜리 소개, 기능 4가지, `docs/setup.md`로 가는 링크, `npm test` / `npm run serve` 명령만 담는다.

- [ ] **Step 3: 전체 테스트를 돌린다**

Run: `npm test`
Expected: PASS, 32 tests, 실패 0

- [ ] **Step 4: 배포한다**

```bash
npx --yes vercel deploy --prod
```

배포 주소를 카카오 개발자 콘솔의 사이트 도메인에 추가한 뒤, 휴대폰에서 그 주소를 열어 위치 권한 → 길찾기까지 실제로 동작하는지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add docs/setup.md README.md && git commit -m "docs: 설정 안내와 배포"
```

---

## 완료 기준

- [ ] `npm test` 통과, 실패 0
- [ ] 휴대폰 실기기에서 위치 허용 → 근처 대피소 목록 표시
- [ ] 필터 칩 4종이 각각 동작
- [ ] 길찾기 버튼이 카카오맵 도보 경로를 연다
- [ ] 서로 다른 기기 두 대에서 인원 수가 실시간으로 오르내린다
- [ ] 브라우저를 닫으면 3분 이내에 인원에서 빠진다
- [ ] 소리로 듣기가 한국어로 읽는다
- [ ] 가족에게 버튼이 본문 채워진 문자 앱을 연다
- [ ] 위치 거부·통신 실패·SDK 실패 어느 경우에도 대피소 목록을 볼 수 있다
- [ ] `docs/setup.md`만 보고 다른 사람이 처음부터 세팅할 수 있다
