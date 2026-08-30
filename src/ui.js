import { CATEGORIES } from './constants.js';
import { formatDistance, walkMinutes } from './geo.js';

// 상태를 받아 DOM 을 그린다. 상태를 소유하지 않는다.

const $ = (id) => document.getElementById(id);

export function renderPlace(text) {
  $('place').textContent = text;
}

export function renderChips(selected, onToggle) {
  const nav = $('chips');
  nav.innerHTML = '';
  for (const cat of CATEGORIES) {
    const on = selected.includes(cat.key);

    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.setAttribute('aria-label', cat.aria);
    btn.setAttribute('aria-pressed', String(on));

    if (on) {
      // 색만으로 켜짐/꺼짐을 나타내면 색약인 분이 구분하지 못한다.
      const check = document.createElement('span');
      check.className = 'chip__check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      btn.appendChild(check);
    }

    btn.appendChild(document.createTextNode(cat.label));
    btn.addEventListener('click', () => onToggle(cat.key));
    nav.appendChild(btn);
  }
}

// 인원 문구는 0명일 때도 반드시 보여준다.
// 0명이면 숨겼더니 회성 님이 "이 기능이 안 된다"고 하셨다.
// 요청받은 기능이 평소에 안 보이면 없는 것이나 마찬가지다.
export function peopleText(count, isMine) {
  if (count <= 0) return '지금 이곳으로 가는 사람은 없습니다';
  if (isMine && count === 1) return '지금 1명이 가는 중 (나)';
  if (isMine) return `지금 ${count}명이 가는 중 (나 포함)`;
  return `지금 ${count}명이 가는 중`;
}

export function renderList(shelters, counts, handlers, notice, activeShelterId = null) {
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

  // 맨 위 카드가 왜 맨 위인지 화면에 적혀 있어야 한다.
  // 목록에서 다른 곳을 고르면 그게 맨 위로 올라오므로 늘 최단거리는 아니다.
  const minDistance = Math.min(...shelters.map((s) => s.distance_m));
  const topIsNearest = shelters[0].distance_m === minDistance;

  list.appendChild(
    topCard(shelters[0], counts.get(shelters[0].id) ?? 0, handlers, activeShelterId, topIsNearest),
  );

  for (const s of shelters.slice(1, 10)) {
    list.appendChild(summaryRow(s, counts.get(s.id) ?? 0, handlers, activeShelterId));
  }
}

function topCard(shelter, count, handlers, activeShelterId, isNearest) {
  const card = document.createElement('section');
  card.className = 'card';

  const tag = document.createElement('p');
  tag.className = 'card__tag';
  tag.textContent = isNearest ? '가장 가까운 곳' : '선택하신 곳';
  card.appendChild(tag);

  const name = document.createElement('h2');
  name.className = 'card__name';
  name.textContent = shelter.name;
  card.appendChild(name);

  const meta = document.createElement('p');
  meta.className = 'card__meta';
  meta.textContent = `${formatDistance(shelter.distance_m)} · 걸어서 ${walkMinutes(shelter.distance_m)}분`;
  card.appendChild(meta);

  const addr = document.createElement('p');
  addr.className = 'card__addr';
  addr.textContent = shelter.address;
  card.appendChild(addr);

  const badge = document.createElement('p');
  badge.className = count > 0 ? 'card__count' : 'card__count card__count--none';
  badge.textContent = peopleText(count, shelter.id === activeShelterId);
  card.appendChild(badge);

  const go = document.createElement('button');
  go.className = 'btn btn--primary btn--block';
  go.type = 'button';
  go.textContent = '길찾기';
  go.addEventListener('click', () => handlers.onGo(shelter));
  card.appendChild(go);

  return card;
}

function summaryRow(shelter, count, handlers, activeShelterId) {
  const row = document.createElement('button');
  row.className = 'row';
  row.type = 'button';

  const left = document.createElement('span');
  left.className = 'row__text';

  const name = document.createElement('span');
  name.className = 'row__name';
  name.textContent = shelter.name;

  const meta = document.createElement('span');
  meta.className = 'row__meta';
  meta.textContent =
    `${formatDistance(shelter.distance_m)} · 걸어서 ${walkMinutes(shelter.distance_m)}분` +
    (count > 0 ? ` · ${count}명 가는 중` : '') +
    (shelter.id === activeShelterId ? ' · 내가 가는 중' : '');

  left.append(name, meta);

  const chevron = document.createElement('span');
  chevron.className = 'row__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';

  row.append(left, chevron);
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

export function setBusy(busy) {
  $('list').setAttribute('aria-busy', String(busy));
  $('loading').hidden = !busy;
}
