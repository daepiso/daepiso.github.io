# 대피소 찾기 웹앱 — 설계서

작성일: 2026-08-25

## 1. 목적

재난 상황에서 내 위치 기준으로 가장 가까운 대피소를 찾고, 길을 안내받고,
같은 곳으로 향하는 사람이 몇 명인지 확인하는 웹앱. 어르신이 혼자서도
쓸 수 있는 것이 최우선 제약이다.

## 2. 사용자

주 사용자는 스마트폰을 쓰지만 앱 설치·가입에 부담을 느끼는 고령자다.
따라서 설치·로그인·회원가입이 전 과정에 등장하지 않는다. 문자로 받은
링크를 눌러 곧바로 쓸 수 있어야 한다.

## 3. 기능 범위

### 포함

1. 위치 기반 근처 대피소 자동 검색 (4종: 민방위 대피시설, 지진 옥외대피장소,
   폭염·한파 쉼터, 침수 대피소 — 상단 필터 칩으로 켜고 끄기)
2. 카카오맵 도보 길찾기 연결
3. 해당 대피소로 이동 중인 익명 인원 수 실시간 표시
4. 어르신 배려: 큰 글씨·큰 버튼·고대비, 음성 안내, 가족에게 위치 알리기

### 제외 (YAGNI)

- 회원가입·로그인
- 앱 내부 경로 그리기 (카카오맵에 위임)
- 푸시 알림
- 대피소 리뷰·평점·사진
- 관리자 화면
- 다국어

## 4. 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프런트 | 순수 HTML + CSS + ES 모듈 | 빌드 도구 없음. 파일을 열면 바로 확인·디버깅 가능 |
| 지도·길찾기 | 카카오맵 JavaScript SDK + 길찾기 URL 스킴 | 국내 도보 경로 정확도, 즉시 무료 발급 |
| 서버·DB | Supabase (PostgreSQL + Realtime) | 실시간 구독 내장, 무료 티어로 충분, 별도 서버 운영 불필요 |
| 음성 | Web Speech API (SpeechSynthesis) | 브라우저 내장, 무료, 설치 불필요 |
| 가족 알림 | `sms:` URL 스킴 | 발송 비용 0, 가입 불필요, 발송 주체는 사용자 |
| 배포 | 정적 호스팅 (Vercel / Netlify 무료) | 폴더 업로드만으로 배포 |
| 테스트 | Node 내장 `node:test` | 순수 함수 단위 테스트에 외부 의존성 불필요 |

## 5. 데이터 설계

### 5.1 대피소 데이터 수급

공공데이터포털 API는 브라우저에서 직접 호출할 수 없다 (CORS 미허용).
또한 대피소 목록은 연 1~2회 수준으로만 갱신되는 준정적 데이터다.

따라서 **적재 방식**을 택한다. 준비용 Node 스크립트
(`scripts/import-shelters.mjs`)가 4종 데이터를 내려받아 아래 스키마로
정규화한 뒤 Supabase `shelters` 테이블에 업서트한다. 런타임 앱은 이
테이블만 조회한다.

효과: CORS 문제 없음, 공공 API 장애가 앱에 전파되지 않음, 조회 속도 향상,
반경 검색을 DB에서 처리 가능.

**데이터셋 확정 시점**: 4종 각각의 정확한 공공데이터 제공처와 필드명은
구현 첫 단계에서 실제 조회해 확정한다. 민방위 대피시설과 지진 옥외대피장소는
행정안전부 전국 단위 데이터가 존재하고, 폭염·한파 쉼터와 침수 대피소는
제공처가 나뉘어 있을 수 있다. 어느 경우든 `shelters` 스키마는 동일하게 유지하고
`import-shelters.mjs` 안의 종류별 어댑터 함수만 달라진다.

**알려진 한계**: 침수 대피소는 지자체별로 데이터 제공 형태와 범위가
제각각이라 전국 커버리지에 공백이 있을 수 있다. 스크립트는 수집 가능한
범위까지 적재하고, 해당 종류의 결과가 0건인 지역에서는 UI가
"이 지역은 등록된 침수 대피소가 없습니다"를 명시한다.

### 5.2 스키마

```sql
-- 대피소 원장 (읽기 전용)
shelters (
  id                uuid primary key,
  ext_id            text not null,        -- 원본 관리번호
  category          text not null,        -- civil_defense | earthquake | heat_cold | flood
  name              text not null,
  address           text not null,
  lat               double precision not null,
  lng               double precision not null,
  capacity          integer,
  detail            text,                 -- 지하 2층 등 부가 설명
  tel               text,
  source_updated_at date,
  unique (category, ext_id)
)
-- 인덱스: (lat), (lng), (category)

-- 이동 기록 (익명)
trips (
  id           uuid primary key,
  device_id    text not null,             -- 브라우저 localStorage 임의 UUID
  shelter_id   uuid not null references shelters(id),
  status       text not null,             -- moving | arrived | cancelled | expired
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
)
-- 부분 유니크 인덱스: (device_id) where status = 'moving'
--   → 한 기기는 동시에 한 곳으로만 이동 중

-- 대피소별 현재 인원 (트리거가 유지, 실시간 구독 대상)
shelter_live_counts (
  shelter_id   uuid primary key references shelters(id),
  moving_count integer not null default 0,
  updated_at   timestamptz not null default now()
)
```

`shelter_live_counts`를 따로 두는 이유: 클라이언트가 `trips`를 직접 구독하면
다른 사람의 `device_id`가 실시간으로 흘러나간다. 집계 테이블만 공개하면
노출되는 정보는 "이 대피소에 몇 명" 뿐이다.

### 5.3 접근 제어 (RLS)

- `shelters` — 익명 SELECT 허용, 쓰기 불가
- `shelter_live_counts` — 익명 SELECT 허용, 쓰기 불가 (트리거만 갱신)
- `trips` — 익명 직접 접근 전면 차단. 아래 RPC로만 조작

### 5.4 서버 함수 (RPC, security definer)

| 함수 | 역할 |
| --- | --- |
| `nearby_shelters(lat, lng, radius_m, categories[])` | 경위도 바운딩박스로 1차 필터 후 하버사인 거리 계산, 가까운 순 정렬 반환. PostGIS 확장 불필요 |
| `start_trip(device_id, shelter_id)` | 기존 moving 기록을 cancelled 처리 후 새 기록 생성 |
| `heartbeat(device_id)` | `last_seen_at` 갱신 |
| `end_trip(device_id, reason)` | arrived / cancelled 로 종료 |

### 5.5 자동 정리

`pg_cron`으로 1분마다: `status='moving'` 이면서 `last_seen_at`이 2분 이상
지난 기록을 `expired`로 변경. 트리거가 `shelter_live_counts`를 감소시킨다.
브라우저를 그냥 닫아도 유령 인원이 남지 않는다.

`pg_cron`을 못 쓰는 경우를 대비해 `nearby_shelters` 호출 시에도 동일한
정리를 지연 수행한다.

## 6. 화면 설계

단일 화면(스크롤) 구조. 화면 전환을 최소화한다.

```
┌─────────────────────────────┐
│ 내 근처 대피소               │ 21px
│ 서울 강남구 도곡동            │ 14px, 현재 위치
├─────────────────────────────┤
│ [민방위] [지진] [폭염·한파] [침수] │ 필터 칩 (가로 스크롤)
├─────────────────────────────┤
│         카카오 지도           │ 내 위치 + 대피소 마커
├─────────────────────────────┤
│ 도곡초등학교 지하             │ 20px — 최근접 대피소 카드
│ 320m · 걸어서 5분            │ 16px
│ [지금 12명이 가는 중]         │ 실시간 배지
│ ┌───────────────────────┐   │
│ │      길찾기            │   │ 높이 56px 이상
│ └───────────────────────┘   │
├─────────────────────────────┤
│ 역삼2문화센터   610m·9분·4명 › │ 2번째 이하 요약 행
│ ...                          │
├─────────────────────────────┤
│ [소리로 듣기]  [가족에게]      │
└─────────────────────────────┘
```

첫 진입 시 아무 조작 없이도 최근접 대피소가 이미 펼쳐진 상태로 보인다.

### 어르신 배려 기준 (구현 시 준수)

- 본문 최소 18px, 대피소 이름 20px 이상
- 터치 대상 최소 높이 56px, 간격 8px 이상
- 명암비 WCAG AAA(7:1) 목표
- 한 화면에 주요 행동은 하나 (`길찾기`)
- 전문 용어 배제: "반경 3km" 대신 "걸어서 5분"

## 7. 핵심 흐름

### 7.1 근처 검색

1. 진입 즉시 `navigator.geolocation.getCurrentPosition` 호출
2. 성공 → `nearby_shelters(lat, lng, 3000, 선택된_종류)` 조회
3. 결과 0건 → 반경을 5km, 10km로 자동 확대 후 재조회
4. 권한 거부 / 실패 → "동네 이름으로 찾기" 입력창 노출,
   카카오 주소검색으로 좌표 확보 후 동일 경로

### 7.2 길찾기

`길찾기` 버튼 → 카카오맵 도보 길찾기 URL로 이동.
카카오맵 앱이 설치돼 있으면 앱이 열려 음성 내비게이션까지 이어지고,
없으면 웹 카카오맵이 열린다. 앱 내부에서 경로를 직접 그리지 않는다.

### 7.3 인원 집계

1. `길찾기`를 누르는 순간 `start_trip` 호출
2. 이후 30초마다 `heartbeat`
3. 목적지 반경 100m 진입을 감지하면 `end_trip('arrived')`
4. 사용자가 `그만두기`를 누르면 `end_trip('cancelled')`
5. 화면의 숫자는 `shelter_live_counts` 실시간 구독으로 자동 갱신

`device_id`는 최초 실행 시 `crypto.randomUUID()`로 만들어 localStorage에
보관한다. 개인을 식별하지 않으며 서버는 이 값과 대피소 선택만 안다.

### 7.4 음성 안내

`소리로 듣기` → "가장 가까운 대피소는 도곡초등학교 지하, 걸어서 5분입니다.
지금 12명이 가고 있습니다." 를 한국어 음성으로 출력.
지원하지 않는 브라우저에서는 버튼을 숨긴다.

### 7.5 가족에게 알리기

`가족에게` → 문자 앱이 본문이 채워진 상태로 열린다.
"저는 도곡초등학교 지하 대피소로 갑니다. (지도 링크)"
발송 버튼은 사용자가 직접 누른다.

## 8. 개인정보

- 수집: 기기 임의 ID, 선택한 대피소, 시각
- 미수집: 이름, 연락처, 이동 경로, 상세 좌표 이력
- 위치 좌표는 조회 파라미터로만 쓰이고 저장하지 않는다
- 첫 실행 시 한 줄짜리 안내를 보여주고 동의를 받는다
- 이동 종료 24시간 후 `trips` 레코드 삭제 (pg_cron)

## 9. 오류 처리

| 상황 | 처리 |
| --- | --- |
| 위치 권한 거부 | 동네 이름 검색으로 전환, 비난조 문구 금지 |
| GPS 실패·시간 초과 | 10초 후 동일하게 전환 |
| 반경 내 결과 없음 | 반경 자동 확대 → 그래도 없으면 "가까운 곳이 없습니다" + 119 안내 |
| 특정 종류만 0건 | 해당 칩 아래에 안내 문구 |
| Supabase 통신 실패 | 마지막으로 받은 목록을 localStorage 캐시에서 표시하고 "최신이 아닐 수 있습니다" 표시 |
| 실시간 구독 끊김 | 인원 배지를 숨기고 나머지 기능은 정상 동작 |
| 카카오 SDK 로드 실패 | 지도 영역을 목록으로 대체, 길찾기는 URL로 계속 동작 |

핵심 원칙: **어떤 실패도 "대피소 목록을 보는 것"을 막지 않는다.**

## 10. 테스트

빌드 도구가 없으므로 순수 함수를 분리해 `node:test`로 검증한다.

- `haversine(a, b)` 거리 계산
- `formatDistance(m)` → "320m", "1.2km"
- `walkMinutes(m)` → 분 단위 반올림
- `isStale(lastSeenAt, now)` 유령 기록 판정
- `buildSmsBody(shelter)` 문자 본문 생성
- `expandRadius(current)` 반경 확대 규칙

지도·GPS·음성처럼 브라우저에 의존하는 부분은 수동 확인 목록으로 관리한다.

## 11. 외부 의존성 (사용자 준비 사항)

| 항목 | 비용 | 발급 |
| --- | --- | --- |
| 카카오 개발자 JavaScript 키 | 무료 | 즉시 |
| 공공데이터포털 활용 신청 (대피소 4종) | 무료 | 즉시~1일 |
| Supabase 프로젝트 | 무료 티어 | 즉시 |

카카오 키는 브라우저에 노출되므로 개발자 콘솔에서 **허용 도메인을 반드시
등록**해 타 도메인 사용을 막는다.

## 12. 파일 구조

```
index.html
style.css
src/
  config.js      키·상수 (git 미포함, config.example.js 제공)
  geo.js         거리 계산·포맷 (순수 함수, 테스트 대상)
  location.js    GPS·주소 검색
  shelters.js    Supabase 대피소 조회
  trips.js       이동 시작·하트비트·종료·실시간 구독
  speech.js      음성 안내
  share.js       가족에게 알리기
  ui.js          화면 렌더
  main.js        진입점
test/
  geo.test.js
  trips.test.js
scripts/
  import-shelters.mjs   준비용 1회 적재 스크립트
supabase/
  schema.sql            테이블·인덱스·RLS·RPC·트리거·cron
docs/
  setup.md              키 발급부터 배포까지 단계별 안내
```

각 모듈은 하나의 책임만 지고, `ui.js`를 제외하면 DOM을 모른다.
`geo.js`는 외부 의존이 전혀 없어 단독 테스트가 가능하다.
