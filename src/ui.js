import { CATEGORIES } from './constants.js';
import { formatDistance, walkMinutes } from './geo.js';

// 상태를 받아 DOM 을 그린다. 상태를 소유하지 않는다.

const $ = (id) => document.getElementById(id);

// 지금 글자 크기가 무엇인지 버튼에 적어둔다.
// '가'만 있으면 눌러도 뭐가 바뀌었는지 알기 어렵다.
export function renderTextSize(label) {
  const el = $('text-size-label');
  if (el) el.textContent = label;
  const btn = $('text-size');
  if (btn) btn.setAttribute('aria-label', `글자 크기 ${label}. 눌러서 바꾸기`);
}

export function renderPlace(text) {
  $('place').textContent = text;

  // 머리말에 실제 동네나 '현재 위치'가 표시됐다면 위치를 이미 아는 상태다.
  // 비동기 위치 찾기와 주소 검색의 응답 순서가 엇갈려도 아래 안내가
  // '위치를 알 수 없습니다'로 남지 않도록 같은 상태로 맞춘다.
  const isStatus =
    text.includes('찾는 중') ||
    text.includes('찾지 못') ||
    text.includes('쓸 수 없') ||
    text.includes('위치를 찾는 중');
  if (!isStatus) showFallback(true, true);
}

// 개수를 곁들이면 눌러보기 전에 결과가 있는지 알 수 있다.
// 개수를 아직 모를 때는 숫자를 붙이지 않는다. 0곳이라고 잘못 말하면 안 된다.
export function chipCountText(count) {
  if (count === null || count === undefined) return '';
  return count > 0 ? `${count}곳` : '없음';
}

// 한 번에 한 종류만 고른다.
// 여러 개를 겹쳐 켜면 목록에 뭐가 왜 나왔는지 알기 어렵고,
// 지금 무엇을 보고 있는지도 헷갈린다.
export function renderChips(selectedKey, onSelect, counts = null) {
  const nav = $('chips');
  nav.innerHTML = '';
  const icons = {
    civil_defense: '⌖',
    earthquake: '≋',
    heat_cold: '☀',
    temp_housing: '⌂',
  };
  for (const cat of CATEGORIES) {
    const on = cat.key === selectedKey;

    const btn = document.createElement('button');
    btn.className = `chip chip--${cat.key}`;
    btn.type = 'button';
    // 하나만 고르는 것이므로 라디오로 알린다.
    // 화면을 읽어주는 기능이 '선택됨'이라고 말해준다.
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(on));
    btn.setAttribute('aria-label', cat.aria);

    const line = document.createElement('span');
    line.className = 'chip__label';

    const icon = document.createElement('span');
    icon.className = 'chip__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[cat.key];
    btn.appendChild(icon);

    if (on) {
      // 색만으로 켜짐/꺼짐을 나타내면 색약인 분이 구분하지 못한다.
      const check = document.createElement('span');
      check.className = 'chip__check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      line.appendChild(check);
    }
    line.appendChild(document.createTextNode(cat.label));
    btn.appendChild(line);

    const n = counts ? counts.get(cat.key) ?? 0 : null;
    const text = chipCountText(n);
    if (text) {
      const badge = document.createElement('span');
      badge.className = n > 0 ? 'chip__count' : 'chip__count chip__count--none';
      badge.textContent = text;
      btn.appendChild(badge);
      btn.setAttribute('aria-label', `${cat.aria} ${text}`);
    }

    btn.addEventListener('click', () => onSelect(cat.key));
    nav.appendChild(btn);
  }
}

// 인원 문구는 0명일 때도 반드시 보여준다.
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

// 이 칸은 늘 쓸 수 있어야 한다. 숨겨두면 위치가 잘 잡히는 폰에서는
// 다른 동네의 대피소를 찾아볼 방법이 아예 없다.
//
// 다만 위치를 이미 아는데 '지금 계신 곳을 알 수 없습니다'가 떠 있으면
// 머리말과 앞뒤가 맞지 않는다. 그래서 제목을 바꾸고, 설명과
// '현재 위치 다시 찾기'는 필요할 때만 보여 첫 화면을 덜 차지한다.
export function showFallback(show, hasLocation = false, isLocating = false) {
  $('fallback').hidden = !show;
  if (!show) return;
  $('fallback-title').textContent = isLocating
    ? '기다리지 않고 동네로 찾기'
    : hasLocation
      ? '다른 동네로 찾기'
      : '지금 계신 곳을 알 수 없습니다';
  $('fallback-help').hidden = hasLocation;
  if (isLocating) {
    $('fallback-help').hidden = false;
    $('fallback-help').innerHTML = '위치를 찾는 동안에도 <b>동네 이름</b>으로 바로 찾을 수 있습니다.';
  } else {
    $('fallback-help').innerHTML = '동네 이름을 넣고 <b>찾기</b>를 눌러주세요.';
  }
  $('retry-location').hidden = hasLocation || isLocating;
}

export function isSpokenTextVisible() {
  return !$('spoken').hidden;
}

export function showAddressError(message) {
  const el = $('addr-error');
  el.textContent = message ?? '';
  el.hidden = !message;
}

// 지도가 늦게 준비되는 일이 흔하다. 한 번 숨기면 영영 숨겨지지 않도록
// 다시 보이게 하는 짝을 둔다.
export function showMap() {
  $('map').classList.remove('map--hidden');
}

export function hideMap() {
  $('map').classList.add('map--hidden');
}

// 소리로 듣기를 누르면 곧바로 같은 내용을 큰 글씨로 보여준다.
// 소리가 나는지 기다렸다가 보여주면 몇 초씩 아무 반응이 없어
// 어르신은 버튼이 고장 났다고 생각한다.
export function showSpokenText(text) {
  const box = $('spoken');
  box.innerHTML = '';

  const main = document.createElement('span');
  main.className = 'spoken__text';
  main.textContent = text;
  box.appendChild(main);

  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// 이미 떠 있는 문구만 고쳐 쓴다. 화면을 옮기지 않는다.
// 인원 수가 실시간으로 바뀔 때마다 화면이 튀면 못 읽는다.
export function updateSpokenText(text) {
  const box = $('spoken');
  if (box.hidden) return;
  const main = box.querySelector('.spoken__text');
  if (main) main.textContent = text;
}

// 소리가 끝내 안 났을 때만 붙인다. 메뉴를 뒤지지 않고 한 번에 크롬으로 간다.
export function showOpenInChrome(onOpen) {
  const box = $('spoken');
  if (box.hidden || box.querySelector('.spoken__open')) return;

  const hint = document.createElement('span');
  hint.className = 'spoken__hint';
  hint.textContent = '이 화면에서는 소리가 나오지 않습니다.';

  const btn = document.createElement('button');
  btn.className = 'btn spoken__open';
  btn.type = 'button';
  btn.textContent = '크롬에서 열기';
  btn.addEventListener('click', onOpen);

  box.append(hint, btn);
}

export function hideSpokenText() {
  $('spoken').hidden = true;
}

// 글자만 있으면 멈춘 건지 도는 건지 알 수 없다.
// 돌아가는 표시를 함께 보여주고, 지금 무엇을 하는 중인지 알려준다.
export function setBusy(busy, message) {
  $('list').setAttribute('aria-busy', String(busy));
  $('loading').hidden = !busy;
  if (busy && message) $('loading-text').textContent = message;
}
