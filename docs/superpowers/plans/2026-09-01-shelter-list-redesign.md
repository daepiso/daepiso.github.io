# 대피소 목록 화면 다시 만들기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대피소 목록을 더벤티 픽업 매장 화면처럼 한 가지 모양의 줄로 바꾸고, 총 개수·정렬·즐겨찾기 별표를 더하고, 검색칸을 지도 위로 올린다. 사진은 넣지 않는다.

**Architecture:** 순수 함수 두 개(`favorites.js`, `sorting.js`)를 먼저 시험과 함께 만든다. 그 다음 `ui.js` 의 목록 그리기를 갈아엎고 `main.js` 를 새 서명에 맞춰 배선한다. 마지막으로 검색칸을 지도 위로 옮기고 모양을 다듬는다. 상태는 `main.js` 가 소유하고 `ui.js` 는 받아서 그리기만 한다 — 지금 구조 그대로다.

**Tech Stack:** 순수 ES 모듈, 빌드 도구 없음. 시험은 `node --test`. 저장은 `localStorage`. 지도는 카카오 JS SDK.

**설계서:** `docs/superpowers/specs/2026-09-01-shelter-list-redesign-design.md`

---

## 파일 구조

| 파일 | 하는 일 | 새로/고침 |
| --- | --- | --- |
| `src/favorites.js` | 즐겨찾기를 폰에 넣고 뺀다 | 새로 |
| `src/sorting.js` | 목록 순서를 정한다 | 새로 |
| `test/favorites.test.js` | 위 시험 | 새로 |
| `test/sorting.test.js` | 위 시험 | 새로 |
| `src/constants.js` | 저장 열쇠 두 개 추가 | 고침 |
| `src/ui.js` | 목록 그리기를 새 모양으로 | 고침 |
| `test/people-text.test.js` | 배지 문구가 짧아진 것에 맞춤 | 고침 |
| `src/main.js` | 상태 셋 추가, 새 손잡이 배선 | 고침 |
| `index.html` | 목록 머리말 추가, 검색칸을 지도 안으로 | 고침 |
| `style.css` | 줄·배지·별표·정렬·지도 위 검색칸 모양 | 고침 |

**설계서에서 한 가지 바꾼다.** 설계서는 `총 개수 + 정렬 단추` 를 `renderList` 안에서 그리라고 했다. 그러면 인원 수가 20초마다 갱신될 때마다 `<select>` 가 통째로 다시 만들어진다. 어르신이 정렬 목록을 열어둔 사이에 그 일이 벌어지면 목록이 닫힐 수 있다. 그래서 머리말은 `index.html` 에 고정으로 두고 `main.js` 가 한 번만 배선한다. `ui.js` 는 숫자와 고른 값만 고쳐 쓴다.

---

### Task 1: 즐겨찾기 저장소

**Files:**
- Create: `src/favorites.js`
- Create: `test/favorites.test.js`
- Modify: `src/constants.js:33-41`

- [ ] **Step 1: 저장 열쇠를 더한다**

`src/constants.js` 의 `STORAGE_KEYS` 를 이렇게 바꾼다.

```js
export const STORAGE_KEYS = {
  deviceId: 'shelter.deviceId',
  consent: 'shelter.consentAt',
  categories: 'shelter.categories',
  shelterCache: 'shelter.cache',
  activeTrip: 'shelter.activeTrip',
  savedPlace: 'shelter.place',
  textSize: 'shelter.textSize',
  favorites: 'shelter.favorites',
  sort: 'shelter.sort',
};
```

- [ ] **Step 2: 실패하는 시험을 쓴다**

`test/favorites.test.js` 를 새로 만든다.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFavorites, toggleFavorite } from '../src/favorites.js';

// 폰의 저장 공간을 흉내낸다.
function 저장소(처음 = {}) {
  const 값 = { ...처음 };
  return {
    getItem: (k) => (k in 값 ? 값[k] : null),
    setItem: (k, v) => { 값[k] = String(v); },
    removeItem: (k) => { delete 값[k]; },
  };
}

// 저장이 막힌 폰. 사생활 보호 모드에서 실제로 이렇게 던진다.
function 막힌저장소() {
  return {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceeded'); },
    removeItem: () => {},
  };
}

test('처음에는 비어 있다', () => {
  assert.equal(readFavorites(저장소()).size, 0);
});

test('별을 달면 들어간다', () => {
  const s = 저장소();
  const 결과 = toggleFavorite('가', s);
  assert.ok(결과.has('가'));
});

test('같은 것을 다시 누르면 빠진다', () => {
  const s = 저장소();
  toggleFavorite('가', s);
  const 결과 = toggleFavorite('가', s);
  assert.ok(!결과.has('가'));
});

test('저장한 것이 다시 읽힌다', () => {
  const s = 저장소();
  toggleFavorite('가', s);
  toggleFavorite('나', s);
  const 다시 = readFavorites(s);
  assert.ok(다시.has('가'));
  assert.ok(다시.has('나'));
  assert.equal(다시.size, 2);
});

// 즐겨찾기가 안 되는 것이 대피소를 못 보는 것으로 번지면 안 된다.
test('저장이 막혀도 던지지 않는다', () => {
  const 결과 = toggleFavorite('가', 막힌저장소());
  assert.ok(결과.has('가'), '이번 화면에서는 켜져 보여야 한다');
});

test('망가진 값이 들어 있으면 빈 것으로 본다', () => {
  assert.equal(readFavorites(저장소({ 'shelter.favorites': '{{{' })).size, 0);
  assert.equal(readFavorites(저장소({ 'shelter.favorites': '"글자"' })).size, 0);
});

test('읽기 자체가 터져도 빈 것을 돌려준다', () => {
  const 터지는저장소 = { getItem: () => { throw new Error('막힘'); } };
  assert.equal(readFavorites(터지는저장소).size, 0);
});
```

- [ ] **Step 3: 시험이 실패하는지 확인한다**

```bash
node --test "test/favorites.test.js"
```

기대: `Cannot find module '../src/favorites.js'` 로 실패한다.

- [ ] **Step 4: 최소한만 구현한다**

`src/favorites.js` 를 새로 만든다.

```js
import { STORAGE_KEYS } from './constants.js';

// 즐겨찾기는 이 폰 안에만 둔다. 서버로 보내지 않는다.
// 어느 대피소를 자주 보는지는 사는 곳을 짐작하게 하는 정보인데,
// 이 앱은 로그인이 없어 기기 하나가 곧 사람 하나이기 때문이다.

export function readFavorites(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEYS.favorites);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.filter((id) => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function toggleFavorite(id, storage = globalThis.localStorage) {
  const next = readFavorites(storage);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  try {
    storage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...next]));
  } catch {
    // 저장 공간이 없어도 이번 화면에서는 켜 둔다.
    // 눌렀는데 아무 반응이 없는 것이 더 나쁘다.
  }
  return next;
}
```

- [ ] **Step 5: 시험이 통과하는지 확인한다**

```bash
node --test "test/favorites.test.js"
```

기대: `pass 7`, `fail 0`.

- [ ] **Step 6: 커밋한다**

```bash
git add src/favorites.js test/favorites.test.js src/constants.js && git commit -m "feat: 즐겨찾기를 폰에 넣고 빼는 기능"
```

---

### Task 2: 목록 순서 정하기

**Files:**
- Create: `src/sorting.js`
- Create: `test/sorting.test.js`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/sorting.test.js` 를 새로 만든다.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortShelters } from '../src/sorting.js';

const 목록 = [
  { id: '가', distance_m: 100 },
  { id: '나', distance_m: 300 },
  { id: '다', distance_m: 500 },
  { id: '라', distance_m: 700 },
];

const 이름들 = (list) => list.map((s) => s.id).join('');

test('거리순은 서버가 준 순서를 그대로 둔다', () => {
  assert.equal(이름들(sortShelters(목록, { sort: 'distance', favorites: new Set() })), '가나다라');
});

test('별 단 것이 앞으로 온다', () => {
  const 결과 = sortShelters(목록, { sort: 'favorite', favorites: new Set(['다']) });
  assert.equal(이름들(결과), '다가나라');
});

test('별 단 것끼리는 가까운 순이다', () => {
  const 결과 = sortShelters(목록, { sort: 'favorite', favorites: new Set(['라', '나']) });
  assert.equal(이름들(결과), '나라가다');
});

test('별 없는 것끼리도 가까운 순이다', () => {
  const 결과 = sortShelters(목록, { sort: 'favorite', favorites: new Set(['라']) });
  assert.equal(이름들(결과), '라가나다');
});

// 원본을 흐트러뜨리면 다음 그리기 때 순서가 엉킨다.
test('원본 배열을 건드리지 않는다', () => {
  const 원본 = [...목록];
  sortShelters(목록, { sort: 'favorite', favorites: new Set(['라']) });
  assert.deepEqual(목록, 원본);
});

test('거리순도 새 배열을 돌려준다', () => {
  const 결과 = sortShelters(목록, { sort: 'distance', favorites: new Set() });
  assert.notEqual(결과, 목록, '같은 배열을 그대로 돌려주면 안 된다');
});

test('빈 목록이어도 터지지 않는다', () => {
  assert.deepEqual(sortShelters([], { sort: 'favorite', favorites: new Set() }), []);
});

// 저장된 값이 망가졌거나 옛 버전일 수 있다. 그때는 거리순이 안전하다.
test('모르는 순서를 주면 거리순으로 본다', () => {
  assert.equal(이름들(sortShelters(목록, { sort: '엉뚱', favorites: new Set() })), '가나다라');
});

test('즐겨찾기가 없어도 터지지 않는다', () => {
  assert.equal(이름들(sortShelters(목록, { sort: 'favorite' })), '가나다라');
});
```

- [ ] **Step 2: 시험이 실패하는지 확인한다**

```bash
node --test "test/sorting.test.js"
```

기대: `Cannot find module '../src/sorting.js'` 로 실패한다.

- [ ] **Step 3: 최소한만 구현한다**

`src/sorting.js` 를 새로 만든다.

```js
// 목록 순서를 정한다. 원본은 건드리지 않고 늘 새 배열을 돌려준다.
//
// 거리순은 서버가 이미 가까운 순으로 보내주므로 베끼기만 한다.
// 모르는 값이 들어오면 거리순으로 본다. 저장된 값이 망가졌을 때
// 엉뚱한 순서로 보여주는 것보다 안전하다.
export function sortShelters(shelters, { sort, favorites } = {}) {
  const list = [...shelters];
  if (sort !== 'favorite') return list;

  const 별 = (s) => (favorites?.has(s.id) ? 0 : 1);
  return list.sort((a, b) => 별(a) - 별(b) || a.distance_m - b.distance_m);
}
```

- [ ] **Step 4: 시험이 통과하는지 확인한다**

```bash
node --test "test/sorting.test.js"
```

기대: `pass 9`, `fail 0`.

- [ ] **Step 5: 커밋한다**

```bash
git add src/sorting.js test/sorting.test.js && git commit -m "feat: 거리순과 즐겨찾기순으로 목록 정렬"
```

---

### Task 3: 인원 배지 문구를 짧게

지금 문구 `지금 이곳으로 가는 사람은 없습니다` 는 배지에 넣기에 길다.
이름을 `peopleBadgeText` 로 바꾸고 문구를 줄인다.

**Files:**
- Modify: `src/ui.js:97-105`
- Modify: `test/people-text.test.js`

- [ ] **Step 1: 시험을 새 문구에 맞춰 고친다**

`test/people-text.test.js` 를 통째로 이 내용으로 바꾼다.

```js
import test from 'node:test';
import assert from 'node:assert/strict';

// ui.js 는 DOM 을 쓰지만 peopleBadgeText 는 순수 함수다.
// 모듈을 불러오려면 document 가 있어야 하므로 최소한만 흉내낸다.
globalThis.document = { getElementById: () => null, createElement: () => ({}) };
const { peopleBadgeText } = await import('../src/ui.js');

// 0명일 때 아무것도 안 보여줬더니 "이 기능이 안 된다"는 말을 들었다.
// 요청받은 기능이 평소에 안 보이면 없는 것이나 마찬가지다.
test('0명이어도 문구가 나온다', () => {
  const t = peopleBadgeText(0, false);
  assert.ok(t.length > 0);
  assert.ok(t.includes('없음'));
});

test('음수가 들어와도 0명처럼 다룬다', () => {
  assert.equal(peopleBadgeText(-1, false), peopleBadgeText(0, false));
});

test('여러 명이면 숫자를 보여준다', () => {
  assert.ok(peopleBadgeText(12, false).includes('12명'));
  assert.ok(peopleBadgeText(12, false).includes('가는 중'));
});

test('나 혼자 가는 중이면 나임을 알려준다', () => {
  const t = peopleBadgeText(1, true);
  assert.ok(t.includes('나'));
  assert.ok(t.includes('가는 중'));
});

test('나 포함 여럿이면 나 포함이라고 알려준다', () => {
  const t = peopleBadgeText(5, true);
  assert.ok(t.includes('5명'));
  assert.ok(t.includes('나 포함'));
});

test('내가 아니면 나 이야기를 하지 않는다', () => {
  assert.ok(!peopleBadgeText(5, false).includes('나'));
});

test('숫자를 그대로 쓰지 소수점이 새지 않는다', () => {
  assert.ok(!peopleBadgeText(3, false).includes('.'));
});

// 배지 칸은 좁다. 한 줄에 들어가야 줄바꿈으로 줄 높이가 들쭉날쭉해지지 않는다.
test('배지에 들어갈 만큼 짧다', () => {
  for (const [n, mine] of [[0, false], [1, true], [7, true], [7, false]]) {
    assert.ok(
      peopleBadgeText(n, mine).length <= 16,
      `너무 길다: ${peopleBadgeText(n, mine)}`,
    );
  }
});
```

- [ ] **Step 2: 시험이 실패하는지 확인한다**

```bash
node --test "test/people-text.test.js"
```

기대: `peopleBadgeText is not a function` 으로 실패한다.

- [ ] **Step 3: `ui.js` 의 함수를 고친다**

`src/ui.js` 에서 아래 블록을 찾아

```js
// 인원 수가 0명일 때도 반드시 보여준다.
// 0명이면 숨겼더니 회성 님이 "이 기능이 안 된다"고 하셨다.
// 요청받은 기능이 평소에 안 보이면 없는 것이나 마찬가지다.
export function peopleText(count, isMine) {
  if (count <= 0) return '지금 이곳으로 가는 사람은 없습니다';
  if (isMine && count === 1) return '지금 1명이 가는 중 (나)';
  if (isMine) return `지금 ${count}명이 가는 중 (나 포함)`;
  return `지금 ${count}명이 가는 중`;
}
```

이것으로 바꾼다.

```js
// 인원 수가 0명일 때도 반드시 보여준다.
// 0명이면 숨겼더니 회성 님이 "이 기능이 안 된다"고 하셨다.
// 요청받은 기능이 평소에 안 보이면 없는 것이나 마찬가지다.
//
// 배지 칸에 들어가야 하므로 짧게 쓴다. 줄바꿈이 생기면
// 줄마다 높이가 달라져 목록이 들쭉날쭉해진다.
export function peopleBadgeText(count, isMine) {
  if (count <= 0) return '가는 사람 없음';
  if (isMine && count === 1) return '나 혼자 가는 중';
  if (isMine) return `${count}명 가는 중 (나 포함)`;
  return `${count}명 가는 중`;
}
```

- [ ] **Step 4: 아직 옛 이름을 쓰는 곳을 고친다**

`src/ui.js` 안의 `topCard` 에 `peopleText(` 를 부르는 줄이 하나 있다.
Task 4 에서 `topCard` 자체가 사라지지만, 지금은 시험이 돌아가야 하므로
이름만 `peopleBadgeText(` 로 바꾼다.

확인:

```bash
grep -rn "peopleText" src/ test/
```

기대: 아무것도 안 나온다.

- [ ] **Step 5: 시험 전체를 돌린다**

```bash
npm test
```

기대: `fail 0`.

- [ ] **Step 6: 커밋한다**

```bash
git add src/ui.js test/people-text.test.js && git commit -m "refactor: 인원 문구를 배지에 맞게 짧게"
```

---

### Task 4: 목록을 한 가지 모양의 줄로 다시 그리기

이 작업은 `ui.js` 와 `main.js` 를 함께 바꿔야 한다. 서명이 달라지므로
따로 커밋하면 중간에 앱이 깨진다. 한 번에 하고 한 번 커밋한다.

**Files:**
- Modify: `index.html:85` (목록 머리말 추가)
- Modify: `src/ui.js` (`renderList`, `topCard`, `summaryRow` 교체)
- Modify: `src/main.js` (상태 셋 추가, 손잡이 배선)
- Modify: `style.css` (새 줄 모양)

- [ ] **Step 1: 목록 머리말을 `index.html` 에 넣는다**

`index.html` 에서 이 줄을 찾아

```html
    <main id="list" class="list" aria-live="polite" aria-busy="false"></main>
```

이것으로 바꾼다.

```html
    <div class="list-head">
      <span id="total" class="list-head__total"></span>
      <label class="list-head__sort">
        <span class="sr-only">목록 순서</span>
        <select id="sort">
          <option value="distance">거리순</option>
          <option value="favorite">즐겨찾기순</option>
        </select>
      </label>
    </div>

    <main id="list" class="list" aria-live="polite" aria-busy="false"></main>
```

- [ ] **Step 2: `ui.js` 의 목록 그리기를 갈아엎는다**

`src/ui.js` 에서 `renderList`, `topCard`, `summaryRow` 세 함수를 통째로
지우고 아래 코드를 그 자리에 넣는다.

```js
// 목록 머리말. 20초마다 인원 수가 갱신될 때 정렬 단추를 다시 만들면
// 어르신이 열어둔 목록이 닫힐 수 있다. 그래서 숫자만 고쳐 쓴다.
export function renderListHead(total) {
  const el = $('total');
  if (!el) return;
  el.textContent = total > 0 ? `총 ${total.toLocaleString('ko-KR')}개` : '';
  el.hidden = total <= 0;
}

export function renderSort(sort) {
  const el = $('sort');
  if (el) el.value = sort;
}

export function renderList({
  shelters, counts, notice, openId, favorites,
  activeShelterId = null, nearestId = null, total = 0, handlers,
}) {
  const list = $('list');
  list.innerHTML = '';

  if (notice) {
    const p = document.createElement('p');
    p.className = 'notice';
    p.textContent = notice;
    list.appendChild(p);
  }

  if (shelters.length === 0) {
    if (!notice) {
      const p = document.createElement('p');
      p.className = 'notice';
      p.textContent = '가까운 대피소를 찾지 못했습니다.';
      list.appendChild(p);
    }
    return;
  }

  for (const s of shelters) {
    list.appendChild(shelterRow(s, {
      count: counts.get(s.id) ?? 0,
      isOpen: s.id === openId,
      isFavorite: favorites.has(s.id),
      isNearest: s.id === nearestId,
      isMine: s.id === activeShelterId,
    }, handlers));
  }

  // 반경 안에 있는 것보다 적게 보여주고 있으면 그 까닭을 밝힌다.
  // 총 개수와 목록 길이가 다른 이유를 화면 안에서 알 수 있어야 한다.
  if (total > shelters.length) {
    const p = document.createElement('p');
    p.className = 'list__more';
    p.textContent = `가까운 ${shelters.length}곳만 보여드립니다.`;
    list.appendChild(p);
  }
}

function shelterRow(shelter, 상태, handlers) {
  const row = document.createElement('div');
  row.className = 상태.isOpen ? 'row row--open' : 'row';

  const head = document.createElement('div');
  head.className = 'row__head';

  // 줄 누르기와 별표 누르기는 서로 다른 일이다. 단추 안에 단추를 넣을 수
  // 없으므로 나란한 두 단추로 만든다. 그래야 별표에도 넉넉한 누름 범위를
  // 줄 수 있다.
  const main = document.createElement('button');
  main.className = 'row__main';
  main.type = 'button';
  main.setAttribute('aria-expanded', String(상태.isOpen));

  const line = document.createElement('span');
  line.className = 'row__line';

  const name = document.createElement('span');
  name.className = 'row__name';
  name.textContent = shelter.name;

  // 거리만 있으면 어르신은 그게 얼마나 먼지 가늠하기 어렵다.
  // 지금 목록에도 '걸어서 N분'이 있었다. 그대로 남긴다.
  const dist = document.createElement('span');
  dist.className = 'row__dist';
  dist.textContent =
    `${formatDistance(shelter.distance_m)} · 걸어서 ${walkMinutes(shelter.distance_m)}분`;

  line.append(name, dist);

  const addr = document.createElement('span');
  addr.className = 'row__addr';
  addr.textContent = shelter.address;

  const tags = document.createElement('span');
  tags.className = 'row__tags';

  const people = document.createElement('span');
  people.className = 상태.count > 0 ? 'tag tag--people' : 'tag tag--quiet';
  people.textContent = peopleBadgeText(상태.count, 상태.isMine);
  tags.appendChild(people);

  // 즐겨찾기순으로 보면 가장 가까운 곳이 아래로 내려간다.
  // 그때도 어느 것이 제일 가까운지 알 수 있어야 한다.
  if (상태.isNearest) {
    const near = document.createElement('span');
    near.className = 'tag tag--near';
    near.textContent = '가장 가까운 곳';
    tags.appendChild(near);
  }

  main.append(line, addr, tags);
  main.addEventListener('click', () => handlers.onToggleOpen(shelter));

  const star = document.createElement('button');
  star.className = 상태.isFavorite ? 'row__star row__star--on' : 'row__star';
  star.type = 'button';
  star.setAttribute('aria-pressed', String(상태.isFavorite));
  star.setAttribute(
    'aria-label',
    `${shelter.name} ${상태.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}`,
  );
  star.textContent = 상태.isFavorite ? '★' : '☆';
  star.addEventListener('click', () => handlers.onToggleFavorite(shelter));

  head.append(main, star);
  row.appendChild(head);

  if (상태.isOpen) row.appendChild(rowActions(shelter, handlers));
  return row;
}

function rowActions(shelter, handlers) {
  const box = document.createElement('div');
  box.className = 'row__actions';

  const go = document.createElement('button');
  go.className = 'btn btn--primary';
  go.type = 'button';
  go.textContent = '길찾기';
  go.addEventListener('click', () => handlers.onGo(shelter));

  // 가족에게 알리는 것은 '이 대피소로 간다'는 뜻이다.
  // 길찾기가 주된 일이므로 그보다 약하게 보여야 한다.
  const share = document.createElement('button');
  share.className = 'btn card__share';
  share.type = 'button';
  share.textContent = '가족에게 알리기';
  share.addEventListener('click', () => handlers.onShare(shelter));

  box.append(go, share);
  return box;
}
```

- [ ] **Step 3: `main.js` 에 상태 셋을 더한다**

`src/main.js:22-32` 의 `state` 를 이렇게 바꾼다.

```js
const state = {
  origin: null,
  category: loadCategory(),
  shelters: [],
  counts: new Map(),
  target: null,
  nearestId: null,
  categoryCounts: null,
  stopWatch: null,
  notice: null,
  placeLabel: null,
  sort: loadSort(),
  openId: null,
  favorites: readFavorites(),
};
```

- [ ] **Step 4: `main.js` 에 새 모듈을 불러온다**

`src/main.js:19` 의 `import * as ui from './ui.js';` 바로 위에 두 줄을 넣는다.

```js
import { readFavorites, toggleFavorite } from './favorites.js';
import { sortShelters } from './sorting.js';
```

- [ ] **Step 5: 정렬 저장 함수를 더한다**

`src/main.js` 의 `saveCategory` 함수 바로 아래에 넣는다.

```js
const SORTS = ['distance', 'favorite'];

function loadSort() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.sort);
    if (SORTS.includes(saved)) return saved;
  } catch { /* 무시 */ }
  return 'distance';
}

function saveSort() {
  try {
    localStorage.setItem(STORAGE_KEYS.sort, state.sort);
  } catch { /* 무시 */ }
}
```

- [ ] **Step 6: `draw()` 를 새 서명에 맞춘다**

`src/main.js` 의 `draw` 함수를 통째로 바꾼다.

```js
function draw() {
  const mine = getActiveTrip()?.shelterId ?? null;
  const ordered = sortShelters(state.shelters, {
    sort: state.sort,
    favorites: state.favorites,
  });

  // 아무 줄도 열려 있지 않으면 맨 위를 연다.
  // 아무것도 누르지 않고 바로 길찾기를 누를 수 있어야 한다.
  if (!ordered.some((s) => s.id === state.openId)) {
    state.openId = ordered[0]?.id ?? null;
  }

  ui.renderListHead(totalNearby());
  ui.renderSort(state.sort);
  ui.renderList({
    shelters: ordered,
    counts: state.counts,
    notice: state.notice,
    openId: state.openId,
    favorites: state.favorites,
    activeShelterId: mine,
    nearestId: state.nearestId,
    total: totalNearby(),
    handlers: { onGo, onShare, onToggleOpen, onToggleFavorite },
  });

  // 소리로 듣기로 띄워둔 문구가 옛 대피소를 가리킨 채 남아 있으면 안 된다.
  // 목록이 바뀌면 같이 고쳐 쓴다.
  if (ui.isSpokenTextVisible()) {
    const cur = currentShelter();
    ui.updateSpokenText(
      buildSpeechText(cur, cur ? state.counts.get(cur.id) ?? 0 : 0, isNearest(cur)),
    );
  }
}

// 반경 안에 몇 곳이 있는지. 종류 칩에 쓰는 값을 그대로 쓴다.
// 아직 안 왔으면 지금 보여주는 개수로 대신한다.
function totalNearby() {
  return state.categoryCounts?.get(state.category) ?? state.shelters.length;
}
```

- [ ] **Step 7: `onSelect` 을 `onToggleOpen` 과 `onToggleFavorite` 으로 바꾼다**

`src/main.js` 의 `onSelect` 함수를 통째로 지우고 그 자리에 넣는다.

```js
// 목록 순서는 건드리지 않는다. 누른 줄이 제자리에서 펼쳐질 뿐이다.
// 예전에는 누른 것을 맨 위로 끌어올려서, 화면이 통째로 뒤바뀌는 바람에
// 방금 무엇을 눌렀는지 놓치기 쉬웠다.
function onToggleOpen(shelter) {
  state.openId = state.openId === shelter.id ? null : shelter.id;
  draw();
}

function onToggleFavorite(shelter) {
  state.favorites = toggleFavorite(shelter.id);
  draw();
}

function onChangeSort(value) {
  state.sort = value;
  saveSort();
  draw();
}
```

- [ ] **Step 8: 지도의 표시 누르기를 새 손잡이에 잇는다**

`src/main.js` 의 `drawMap` 안에서 `renderMarkers(state.shelters, state.origin, onSelect);`
를 찾아 이렇게 바꾼다.

```js
  renderMarkers(state.shelters, state.origin, onToggleOpen);
```

- [ ] **Step 9: `currentShelter()` 를 펼쳐진 줄로 바꾼다**

`src/main.js` 의 `currentShelter` 를 통째로 바꾼다.

```js
// 소리로 듣기와 가족에게는 '지금 보고 있는 곳'을 가리킨다.
// 곧 펼쳐져 있는 줄이고, 아무것도 안 펼쳐졌으면 맨 위 줄이다.
function currentShelter() {
  return state.shelters.find((s) => s.id === state.openId) ?? state.shelters[0] ?? null;
}
```

- [ ] **Step 10: 정렬 단추를 배선한다**

`src/main.js` 의 `wireButtons()` 안, `on('addr-go', 'click', onAddressSearch);` 바로 위에 넣는다.

```js
  on('sort', 'change', (e) => onChangeSort(e.target.value));
```

- [ ] **Step 11: 새로 찾을 때 펼침을 되돌린다**

`src/main.js` 의 `search()` 안에서 `state.nearestId = found[0]?.id ?? null;` 를 찾아
바로 아래에 한 줄을 넣는다.

```js
    // 종류를 바꿨는데 없어진 대피소가 펼쳐진 채로 남으면 안 된다.
    state.openId = found[0]?.id ?? null;
```

- [ ] **Step 12: 새 줄 모양을 `style.css` 맨 뒤에 붙인다**

```css

/* 더벤티 픽업 매장 화면을 본뜬 목록. 모든 줄이 같은 모양이다. */

.list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 16px 10px}
.list-head__total{color:var(--primary);font-size:calc(15px * var(--fs));font-weight:750}
.list-head__sort select{min-height:calc(44px * var(--fs));padding:0 12px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:999px;font-size:calc(15px * var(--fs));font-weight:700}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

.row{margin-bottom:8px;background:var(--bg);border:1px solid var(--line-soft);border-radius:14px;box-shadow:var(--shadow-sm);overflow:hidden}
.row--open{border-color:var(--primary);box-shadow:inset 0 0 0 1px var(--primary)}
.row__head{display:flex;align-items:stretch;gap:0}
.row__main{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding:14px 6px 14px 16px;color:var(--fg);text-align:left;background:transparent;border:0;cursor:pointer}
.row__line{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.row__name{color:var(--fg);font-size:calc(20px * var(--fs));font-weight:750;line-height:1.3}
.row__dist{flex:none;color:var(--primary);font-size:calc(17px * var(--fs));font-weight:750}
.row__addr{display:block;overflow:hidden;color:var(--muted);font-size:calc(15px * var(--fs));text-overflow:ellipsis;white-space:nowrap}
.row__tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px}
.tag{padding:4px 10px;border-radius:999px;font-size:calc(13px * var(--fs));font-weight:700}
.tag--people{color:var(--accent-fg);background:var(--accent-bg)}
.tag--quiet{color:var(--muted);background:var(--count-none-bg);font-weight:500}
.tag--near{color:var(--primary-fg);background:var(--primary)}

/* 별 그림은 작아도 누르는 범위는 넉넉해야 한다.
   옆의 줄을 잘못 누르면 엉뚱한 곳이 펼쳐진다. */
.row__star{flex:none;width:calc(58px * var(--fs));min-height:calc(58px * var(--fs));align-self:center;color:var(--line);background:transparent;border:0;font-size:calc(26px * var(--fs));line-height:1;cursor:pointer}
.row__star--on{color:#f0a500}

.row__actions{display:flex;gap:8px;padding:0 16px 14px}
.row__actions .btn{flex:1;width:auto;margin:0}
.list__more{margin:6px 0 0;color:var(--muted);text-align:center;font-size:calc(14px * var(--fs))}
```

- [ ] **Step 13: 옛 카드 모양 규칙을 지운다**

`style.css` 에서 `.card` 로 시작하는 규칙들은 이제 쓰이지 않는다.
다만 `.card__share` 는 Step 2 의 `rowActions` 가 계속 쓴다.
`.card`, `.card::after`, `.card__tag`, `.card__name`, `.card__meta`,
`.card__addr`, `.card__count`, `.card__count--none`, `.card .btn`,
그리고 `.row--nearest`, `.row__tag`, `.row__text`, `.row__meta`,
`.row__chevron` 규칙을 지운다. `.card__share` 는 남긴다.

확인 — 지운 이름이 코드 어디에도 안 남았는지 본다.

```bash
grep -rn "card__tag\|card__name\|card__meta\|card__count\|row__chevron\|row__meta\|row--nearest" src/ index.html
```

기대: 아무것도 안 나온다.

- [ ] **Step 14: 시험을 돌린다**

```bash
npm test
```

기대: `fail 0`.

- [ ] **Step 15: 브라우저에서 눈으로 본다**

`npm run serve` 로 띄우고 `http://localhost:5173/` 을 연다. 확인할 것.

- 모든 줄이 같은 모양이다
- 맨 위 줄이 열려 있고 `길찾기`·`가족에게 알리기` 가 보인다
- 다른 줄을 누르면 그 줄이 열리고 앞의 것은 닫힌다. **목록 순서는 그대로다**
- 별을 누르면 채워지고, 다시 누르면 빈다
- `거리순 ▾` 을 `즐겨찾기순` 으로 바꾸면 별 단 줄이 맨 위로 온다
- 새로고침해도 별과 정렬이 그대로다
- 위에 `총 122개` 같은 숫자가 보인다

- [ ] **Step 16: 커밋한다**

```bash
git add index.html src/ui.js src/main.js style.css && git commit -m "feat: 목록을 한 가지 모양의 줄로 바꾸고 정렬과 즐겨찾기를 더함"
```

---

### Task 5: 검색칸을 지도 위로

**Files:**
- Modify: `index.html:62-76`
- Modify: `src/ui.js` (`showFallback`)
- Modify: `style.css`

- [ ] **Step 1: `index.html` 에서 검색칸을 지도 안으로 옮긴다**

이 부분을 찾아

```html
    <div class="map-frame">
      <div class="map-frame__label"><span aria-hidden="true">●</span> 내 주변 지도</div>
      <div id="map" class="map" role="img" aria-label="주변 대피소 지도"></div>
    </div>

    <section id="fallback" class="fallback" hidden>
    <h2 id="fallback-title" class="fallback__title">지금 계신 곳을 알 수 없습니다</h2>
    <p id="fallback-help" class="fallback__help">동네 이름을 넣고 <b>찾기</b>를 눌러주세요.</p>
    <div class="fallback__row">
      <input id="addr" type="text" inputmode="search" placeholder="예: 강남구 도곡동" />
      <button id="addr-go" class="btn btn--primary" type="button">찾기</button>
    </div>
    <p id="addr-error" class="error" hidden></p>
    <button id="retry-location" class="btn fallback__retry" type="button">현재 위치 다시 찾기</button>
    </section>
```

이것으로 바꾼다.

```html
    <div class="map-frame">
      <div class="map-search">
        <label class="sr-only" for="addr">동네 이름으로 찾기</label>
        <input id="addr" type="text" inputmode="search" placeholder="동네 이름 (예: 강남구 도곡동)" />
        <button id="addr-go" class="btn btn--primary" type="button">찾기</button>
      </div>
      <div id="map" class="map" role="img" aria-label="주변 대피소 지도"></div>
    </div>

    <section id="fallback" class="fallback" hidden>
    <h2 id="fallback-title" class="fallback__title">지금 계신 곳을 알 수 없습니다</h2>
    <p id="fallback-help" class="fallback__help">위 칸에 동네 이름을 넣고 <b>찾기</b>를 눌러주세요.</p>
    <p id="addr-error" class="error" hidden></p>
    <button id="retry-location" class="btn fallback__retry" type="button">현재 위치 다시 찾기</button>
    </section>
```

- [ ] **Step 2: `ui.js` 의 `showFallback` 에서 없어진 안내를 정리한다**

`src/ui.js` 의 `showFallback` 을 통째로 바꾼다. 검색칸은 이제 늘 지도 위에
있으므로, 이 칸은 '위치를 모른다'는 안내와 '다시 찾기' 만 맡는다.

```js
// 검색칸은 지도 위에 늘 떠 있다. 이 칸은 위치를 못 잡았을 때
// 무슨 일이 벌어졌는지 알려주는 자리다.
export function showFallback(show, hasLocation = false, isLocating = false) {
  // 위치를 이미 아는데 '알 수 없습니다'가 떠 있으면 머리말과 앞뒤가 맞지 않는다.
  $('fallback').hidden = !show || hasLocation;
  if ($('fallback').hidden) return;

  $('fallback-title').textContent = isLocating
    ? '위치를 찾고 있습니다'
    : '지금 계신 곳을 알 수 없습니다';
  $('fallback-help').innerHTML = isLocating
    ? '기다리지 않으려면 위 칸에 <b>동네 이름</b>을 넣어주세요.'
    : '위 칸에 동네 이름을 넣고 <b>찾기</b>를 눌러주세요.';
  $('retry-location').hidden = isLocating;
}
```

- [ ] **Step 3: 지도가 없어도 검색칸이 남게 한다**

`style.css` 에서 이 규칙을 찾아 지운다. 지도 그림이 숨겨질 때 지도 틀까지
같이 사라지면, 카카오가 안 뜰 때 동네 검색도 못 하게 된다.

```css
.map-frame:has(.map--hidden){display:none}
```

같은 줄에 붙어 있는 `.map--hidden{display:none}` 은 **남긴다**.

같은 김에 `.map-frame__label` 과 `.map-frame__label span` 규칙도 지운다.
Step 1 에서 그 요소를 없앴으므로 아무 데도 쓰이지 않는다.

확인:

```bash
grep -rn "map-frame__label" src/ index.html style.css
```

기대: 아무것도 안 나온다.

- [ ] **Step 4: 지도 위 검색칸 모양을 `style.css` 맨 뒤에 붙인다**

```css

/* 검색칸을 지도 위에 얹는다. 화면이 짧아져 대피소 목록이 더 빨리 보인다. */
.map-search{position:absolute;z-index:2;top:10px;left:10px;right:10px;display:flex;gap:7px;padding:7px;background:color-mix(in srgb,var(--bg) 94%,transparent);border:1px solid var(--line-soft);border-radius:14px;box-shadow:var(--shadow-sm);backdrop-filter:blur(8px)}
.map-search input{flex:1;min-width:0;min-height:calc(46px * var(--fs));padding:0 12px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:10px;font-size:calc(16px * var(--fs))}
.map-search input:focus{outline:3px solid color-mix(in srgb,var(--primary) 35%,transparent);border-color:var(--primary)}
.map-search .btn{flex:none;min-height:calc(46px * var(--fs));padding:0 16px}
.map-frame:has(.map--hidden) .map-search{position:static;box-shadow:none;border:0;background:transparent}
```

- [ ] **Step 5: 시험을 돌린다**

```bash
npm test
```

기대: `fail 0`.

- [ ] **Step 6: 브라우저에서 눈으로 본다**

- 검색칸이 지도 왼쪽 위에 얹혀 있다
- `● 내 주변 지도` 라벨은 없다
- 동네 이름을 넣고 `찾기` 를 누르면 그 동네 대피소가 나온다
- 브라우저 개발자 도구 콘솔에서 아래를 실행하면 지도가 사라져도
  검색칸은 그대로 남는다

```js
document.getElementById('map').classList.add('map--hidden')
```

- [ ] **Step 7: 커밋한다**

```bash
git add index.html src/ui.js style.css && git commit -m "design: 동네 검색칸을 지도 위로 올림"
```

---

### Task 6: 어르신 기준 확인하고 고치기

**Files:**
- Modify: `style.css` (재보고 모자란 것만)

- [ ] **Step 1: 누르는 곳 크기를 잰다**

브라우저에서 `http://localhost:5173/` 을 열고 콘솔에 붙여 넣는다.

```js
[...document.querySelectorAll('.row__main, .row__star, #sort, .row__actions .btn')]
  .map(e => ({ 무엇: e.className || e.id, 높이: Math.round(e.getBoundingClientRect().height), 너비: Math.round(e.getBoundingClientRect().width) }))
  .filter(x => x.높이 < 56 || x.너비 < 56)
```

기대: 빈 배열. 나오면 그 요소의 `min-height` 나 `width` 를 56px 이상으로 올린다.

- [ ] **Step 2: 글씨 대비를 잰다**

밝은 화면과 어두운 화면 양쪽에서 콘솔에 붙여 넣는다.

```js
(() => {
  const lum = c => { const [r,g,b] = c.match(/\d+/g).map(Number).map(v => { v/=255; return v<=.03928 ? v/12.92 : ((v+.055)/1.055)**2.4 }); return .2126*r+.7152*g+.0722*b };
  const cr = (a,b) => { const l1=lum(a), l2=lum(b); return ((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)).toFixed(2) };
  return ['.row__name','.row__dist','.row__addr','.tag--people','.tag--quiet','.tag--near','.list-head__total']
    .map(sel => { const e = document.querySelector(sel); if (!e) return null;
      const g = getComputedStyle(e);
      let bg = g.backgroundColor, p = e;
      while (bg === 'rgba(0, 0, 0, 0)' && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor }
      return { 무엇: sel, 대비: cr(g.color, bg) } }).filter(Boolean);
})()
```

기대: 모두 7 이상. 7 미만인 것은 글씨색을 진하게 하거나 배경을 연하게 한다.

어두운 화면으로 바꾸는 방법 — 개발자 도구의 렌더링 탭에서
`prefers-color-scheme` 을 `dark` 로 둔다.

- [ ] **Step 3: 폰 크기와 글자 크기를 본다**

개발자 도구에서 화면 폭을 375px 로 맞추고, 오른쪽 위 `가` 단추를 눌러
`보통` · `크게` · `아주 크게` 세 단계를 모두 본다. 확인할 것.

- 대피소 이름이 잘리지 않고 줄바꿈된다
- 별표가 이름을 밀어내지 않는다
- 인원 배지가 한 줄에 들어간다
- `총 122개` 와 `거리순` 이 겹치지 않는다
- 가로 스크롤이 생기지 않는다

- [ ] **Step 4: 어두운 화면에서 별표와 배지를 본다**

어두운 화면에서 별표 켜짐/꺼짐이 구분되는지, `가장 가까운 곳` 딱지 글씨가
읽히는지 본다. 안 되면 `style.css` 맨 뒤의 어두운 화면 블록에 규칙을 더한다.

```css
@media (prefers-color-scheme:dark){
  .row__star{color:#4a5a66}
  .tag--near{color:#0b1a26}
}
```

- [ ] **Step 5: 고친 것이 있으면 커밋한다**

```bash
git add style.css && git commit -m "fix: 목록 새 모양의 대비와 누름 범위를 어르신 기준에 맞춤"
```

고칠 것이 없었으면 이 단계는 건너뛴다.

---

### Task 7: 배포하고 기록하기

**Files:**
- Modify: `docs/다음에-할-일.md`

- [ ] **Step 1: 시험 전체를 돌린다**

```bash
npm test
```

기대: `fail 0`. 시험 수는 147개 안팎이 된다 (지금 131 + 즐겨찾기 7 + 정렬 9).

- [ ] **Step 2: 배포한다**

```bash
git push origin main
```

- [ ] **Step 3: 배포가 끝났는지 확인한다**

```bash
gh run list --limit 1 --json status,conclusion,headSha
```

기대: `"conclusion":"success"` 이고 `headSha` 가 방금 밀어 올린 커밋과 같다.

- [ ] **Step 4: 올라간 파일이 맞는지 확인한다**

```bash
curl -s https://daepiso.github.io/ | grep -o 'id="sort"'
```

기대: `id="sort"` 가 나온다.

- [ ] **Step 5: `docs/다음에-할-일.md` 에 기록한다**

`## 지금 상태` 바로 아래에 새 절을 넣는다.

```markdown
## 2026-09-01 에 한 일

대피소 목록을 더벤티 픽업 매장 화면처럼 바꿨다. 사진은 넣지 않았다.

- 모든 줄이 같은 모양이다. 누른 줄이 제자리에서 펼쳐지고
  `길찾기`·`가족에게 알리기` 가 나온다. 목록 순서는 바뀌지 않는다.
  예전에는 누른 것을 맨 위로 끌어올려서 화면이 통째로 뒤바뀌었다.
- 목록 위에 `총 122개` 와 `거리순 ▾` 을 넣었다. 총 개수는 이미 칩에
  쓰던 값이라 통신량이 늘지 않는다.
- 즐겨찾기 별표를 넣었다. 폰 안에만 저장하고 서버로 보내지 않는다.
  어느 대피소를 자주 보는지는 사는 곳을 짐작하게 하는 정보다.
- 동네 검색칸을 지도 위로 올렸다. 화면이 짧아져 목록이 더 빨리 보인다.
- 보여주는 줄을 10개에서 50개로 늘렸다. 서버가 이미 50곳을 보내주고
  있어서 통신량은 그대로다. 미뤄뒀던 "50곳 대신 10곳만 받기" 는 포기했다.

설계서: `docs/superpowers/specs/2026-09-01-shelter-list-redesign-design.md`
```

- [ ] **Step 6: 커밋하고 밀어 올린다**

```bash
git add "docs/다음에-할-일.md" && git commit -m "docs: 목록 화면 다시 만든 기록" && git push origin main
```

- [ ] **Step 7: 회성 님께 폰에서 확인할 것을 알린다**

폰에서 직접 눌러봐야 아는 것들이다.

- 별표를 눌러 켜고 끄기, 새로고침해도 남아 있는지
- `거리순` 을 `즐겨찾기순` 으로 바꾸기 — 폰에서는 화면 아래에서 목록이 올라온다
- 줄을 눌러 펼치고 `길찾기` 로 카카오맵이 열리는지
- `가족에게 알리기` 로 문자 앱이 열리고 대피소 이름·주소가 채워지는지
