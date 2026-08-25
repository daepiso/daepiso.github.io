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

  list.appendChild(topCard(shelters[0], counts.get(shelters[0].id) ?? 0, handlers));

  for (const s of shelters.slice(1, 10)) {
    list.appendChild(summaryRow(s, counts.get(s.id) ?? 0, handlers));
  }
}

function topCard(shelter, count, handlers) {
  const card = document.createElement('section');
  card.className = 'card';

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
  left.className = 'row__text';

  const name = document.createElement('span');
  name.className = 'row__name';
  name.textContent = shelter.name;

  const meta = document.createElement('span');
  meta.className = 'row__meta';
  meta.textContent =
    `${formatDistance(shelter.distance_m)} · 걸어서 ${walkMinutes(shelter.distance_m)}분` +
    (count > 0 ? ` · ${count}명` : '');

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

// 소리가 안 나는 브라우저(카카오톡·인스타 등 앱 안에서 열린 화면)를 위해
// 같은 내용을 큰 글씨로 보여준다. 버튼을 숨기면 어르신은 헤매기만 한다.
export function showSpokenText(text) {
  const box = $('spoken');
  box.innerHTML = '';

  const main = document.createElement('span');
  main.className = 'spoken__text';
  main.textContent = text;

  const hint = document.createElement('span');
  hint.className = 'spoken__hint';
  hint.textContent = '이 화면에서는 소리가 나오지 않습니다. 소리로 들으시려면 크롬으로 열어주세요.';

  box.append(main, hint);
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function hideSpokenText() {
  $('spoken').hidden = true;
}

export function setBusy(busy) {
  $('list').setAttribute('aria-busy', String(busy));
  $('loading').hidden = !busy;
}
