import { KAKAO_JS_KEY } from './config.js';
import { CATEGORY_KEYS, RADIUS_STEPS_M, STORAGE_KEYS } from './constants.js';
import { expandRadius } from './geo.js';
import {
  fetchNearbyShelters, fetchNearbyCounts, cacheShelters, readCachedShelters,
} from './shelters.js';
import {
  getCurrentPosition, watchPosition, searchAddress, reverseGeocode,
  savePlace, readSavedPlace, forgetPlace,
} from './location.js';
import { startTrip, endTrip, fetchCounts, subscribeCounts, hasArrived, getActiveTrip } from './trips.js';
import { buildWalkDirectionsUrl } from './directions.js';
import { buildSpeechText, speak } from './speech.js';
import { openSmsApp } from './share.js';
import { openExternally } from './external.js';
import { initMap, renderMarkers, isMapReady } from './map.js';
import * as ui from './ui.js';

const state = {
  origin: null,
  categories: loadCategories(),
  shelters: [],
  counts: new Map(),
  target: null,
  nearestId: null,
  categoryCounts: null,
  stopWatch: null,
  notice: null,
  placeLabel: null,
};

// ─────────────────────────────── 부팅

// 지도는 '있으면 좋은 것'이다. 지도를 기다리다 앱 전체가 멈추면 안 된다.
// 예전에는 await loadKakao() 를 먼저 걸어서, 카카오 서버가 응답하지 않으면
// 칩도 목록도 위치 안내도 영영 나오지 않고 빈 화면만 남았다.
async function boot() {
  await gateConsent();

  drawChips();
  wireButtons();

  // 기다리지 않는다. 지도가 준비되면 그때 그려 넣는다.
  loadKakao().then((ready) => {
    if (!ready) return;
    if (state.origin) {
      drawMap();
      refreshPlaceLabel();
    }
  });

  await locateAndSearch();
}

// 동네 이름은 카카오가 있어야 알 수 있다.
// 지도가 늦게 준비되면 그때 머리말을 채워 넣는다.
function refreshPlaceLabel() {
  if (!state.origin || state.placeLabel) return;
  reverseGeocode(state.origin.lat, state.origin.lng).then((place) => {
    if (!place) return;
    state.placeLabel = place;
    ui.renderPlace(place);
  });
}

function gateConsent() {
  return new Promise((resolve) => {
    if (localStorage.getItem(STORAGE_KEYS.consent)) {
      resolve();
      return;
    }
    const box = document.getElementById('consent');
    box.hidden = false;
    document.getElementById('consent-ok').addEventListener(
      'click',
      () => {
        try {
          localStorage.setItem(STORAGE_KEYS.consent, new Date().toISOString());
        } catch { /* 무시 */ }
        box.hidden = true;
        resolve();
      },
      { once: true },
    );
  });
}

// 카카오 SDK 는 키를 URL 에 담아야 해서 여기서 주입한다.
// 실패해도 목록은 계속 보여야 하므로 항상 resolve 한다.
// 응답이 아예 안 오면 onload 도 onerror 도 불리지 않는다.
// 그런 경우를 대비해 시간을 정해두고 포기한다.
const KAKAO_TIMEOUT_MS = 6000;

function loadKakao() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      if (!ready) ui.hideMap();
      resolve(ready);
    };

    const timer = setTimeout(() => {
      console.warn('카카오 지도가 응답하지 않습니다. 목록만 표시합니다.');
      finish(false);
    }, KAKAO_TIMEOUT_MS);

    const script = document.createElement('script');
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    script.onload = () => {
      try {
        window.kakao.maps.load(() => { clearTimeout(timer); finish(true); });
      } catch {
        clearTimeout(timer);
        finish(false);
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      console.warn('카카오 지도를 불러오지 못했습니다. 목록만 표시합니다.');
      finish(false);
    };
    document.head.appendChild(script);
  });
}

// ─────────────────────────────── 검색

async function locateAndSearch() {
  ui.setBusy(true);
  // 찾는 동안에는 '동네 이름을 넣으라'는 칸을 보이지 않는다.
  // 먼저 스스로 찾아본 뒤, 정말 안 될 때만 부탁한다.
  ui.showFallback(false);
  ui.renderPlace('내 위치를 찾는 중입니다…');
  try {
    state.origin = await getCurrentPosition();
    // 진짜 위치를 찾았으면 전에 넣어둔 동네는 더 이상 쓰지 않는다.
    forgetPlace();
    ui.showFallback(true, true);
    ui.renderPlace('현재 위치');
    reverseGeocode(state.origin.lat, state.origin.lng).then((place) => {
      if (!place) return;
      state.placeLabel = place;
      ui.renderPlace(place);
    });
    await search();
  } catch (err) {
    // GPS 를 못 써도, 전에 직접 넣어둔 동네가 있으면 그걸로 찾아준다.
    const saved = readSavedPlace();
    if (saved) {
      state.origin = { lat: saved.lat, lng: saved.lng };
      state.placeLabel = saved.label;
      ui.renderPlace(saved.label);
      ui.showFallback(true, true);
      await search();
      return;
    }
    ui.renderPlace(err.message === 'DENIED' ? '위치를 쓸 수 없습니다' : '위치를 찾지 못했습니다');
    ui.showFallback(true);
    showCacheIfAny();
  } finally {
    ui.setBusy(false);
  }
}

async function search() {
  if (!state.origin) return;
  state.notice = null;
  ui.setBusy(true);

  try {
    let found = [];
    let radius = RADIUS_STEPS_M[0];
    while (radius) {
      found = await fetchNearbyShelters({
        lat: state.origin.lat,
        lng: state.origin.lng,
        radiusM: radius,
        categories: state.categories,
      });
      if (found.length > 0) break;
      radius = expandRadius(radius);
    }

    state.shelters = found;
    // 목록은 가까운 순으로 온다. 어느 것이 가장 가까운지 여기서 정해둔다.
    state.nearestId = found[0]?.id ?? null;
    cacheShelters(found, state.origin);

    if (found.length === 0) {
      state.notice = '가까운 대피소를 찾지 못했습니다. 도움이 필요하면 119로 전화하세요.';
    }

    state.counts = await fetchCounts(found.map((s) => s.id));
    draw();
    drawMap();

    // 칩의 개수는 앱을 막지 않는다. 늦게 와도 그때 다시 그리면 된다.
    fetchNearbyCounts({ lat: state.origin.lat, lng: state.origin.lng, radiusM: radius })
      .then((counts) => {
        if (counts.size === 0) return;
        state.categoryCounts = counts;
        drawChips();
      });
    subscribeCounts(onCountChange).catch(() => {});
  } catch (err) {
    console.error(err);
    showCacheIfAny('지금은 최신 정보를 받지 못했습니다.');
  } finally {
    ui.setBusy(false);
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
  state.nearestId = cached.shelters[0]?.id ?? null;
  state.origin = state.origin ?? cached.origin;
  state.notice = `${reason ?? ''} 마지막으로 받은 정보를 보여드립니다.`.trim();
  draw();
  drawMap();
}

function drawChips() {
  ui.renderChips(state.categories, onToggleCategory, state.categoryCounts);
}

function draw() {
  const mine = getActiveTrip()?.shelterId ?? null;
  ui.renderList(
    state.shelters, state.counts, { onGo, onSelect }, state.notice, mine, state.nearestId,
  );

  // 소리로 듣기로 띄워둔 문구가 옛 대피소를 가리킨 채 남아 있으면 안 된다.
  // 목록이 바뀌면 같이 고쳐 쓴다.
  if (ui.isSpokenTextVisible()) {
    const cur = currentShelter();
    ui.updateSpokenText(
      buildSpeechText(cur, cur ? state.counts.get(cur.id) ?? 0 : 0, isNearest(cur)),
    );
  }
}

function drawMap() {
  if (!state.origin) return;
  const el = document.getElementById('map');
  if (!isMapReady() && !initMap(el, state.origin)) {
    ui.hideMap();
    return;
  }
  renderMarkers(state.shelters, state.origin, onSelect);
}

function onCountChange(shelterId, count) {
  state.counts.set(shelterId, count);
  draw();
}

function onToggleCategory(key) {
  const next = state.categories.includes(key)
    ? state.categories.filter((k) => k !== key)
    : [...state.categories, key];
  // 전부 끄면 아무것도 못 보게 되므로 되돌린다.
  state.categories = next.length > 0 ? next : [...CATEGORY_KEYS];
  saveCategories();
  drawChips();
  search();
}

// 소리로 듣기와 가족에게는 맨 위 카드, 곧 '지금 보고 있는 곳'을 가리킨다.
function currentShelter() {
  return state.shelters[0] ?? null;
}

// 목록을 다시 늘어놓아도 어느 것이 가장 가까운지는 바뀌지 않는다.
// 검색할 때 정해둔 값으로 판단한다.
function isNearest(shelter) {
  if (!shelter) return true;
  if (state.nearestId === null) return true;
  return shelter.id === state.nearestId;
}

function onSelect(shelter) {
  state.shelters = [shelter, ...state.shelters.filter((s) => s.id !== shelter.id)];
  draw();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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

// ─────────────────────────────── 길찾기와 이동 기록

async function onGo(shelter) {
  state.target = shelter;
  try {
    await startTrip(shelter.id);
    startArrivalWatch(shelter);
  } catch (err) {
    // 인원 집계는 부가 기능이다. 실패해도 길찾기는 열어준다.
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

// ─────────────────────────────── 버튼 배선

// 화면에 없는 버튼을 붙이려다 앱 전체가 죽으면 안 된다.
function on(id, event, handler) {
  document.getElementById(id)?.addEventListener(event, handler);
}

function wireButtons() {
  on('speak', 'click', () => {
    const cur = currentShelter();
    const text = buildSpeechText(
      cur,
      cur ? state.counts.get(cur.id) ?? 0 : 0,
      isNearest(cur),
    );

    // 글씨는 곧바로 띄운다. 소리를 기다리게 하지 않는다.
    ui.showSpokenText(text);

    // speak() 를 await 없이 부른다. 기다렸다가 부르면 모바일 브라우저가
    // '사용자가 누른 순간'이 아니라고 보고 재생을 거부한다.
    speak(text).then((spoke) => {
      if (!spoke) ui.showOpenInChrome(() => openExternally());
    });
  });

  on('share', 'click', () => {
    const target = state.target ?? currentShelter();
    if (!target) return;
    openSmsApp(target);
  });

  on('retry-location', 'click', () => {
    ui.showAddressError(null);
    ui.renderPlace('위치를 찾는 중…');
    locateAndSearch();
  });

  on('addr-go', 'click', onAddressSearch);
  on('addr', 'keydown', (e) => {
    if (e.key === 'Enter') onAddressSearch();
  });
}

async function onAddressSearch() {
  const query = document.getElementById('addr').value.trim();
  if (!query) {
    ui.showAddressError('동네 이름을 입력해 주세요.');
    return;
  }
  ui.showAddressError(null);
  try {
    const place = await searchAddress(query);
    state.origin = { lat: place.lat, lng: place.lng };
    savePlace(place);
    state.placeLabel = place.label;
    ui.renderPlace(place.label);
    // 이제 위치를 아니 제목을 '다른 동네로 찾기'로 바꾼다.
    ui.showFallback(true, true);
    await search();
  } catch (err) {
    ui.showAddressError(
      err.message === 'KAKAO_NOT_READY'
        ? '지도를 불러오는 중입니다. 잠시 후 다시 눌러주세요.'
        : '그런 동네를 찾지 못했습니다. 다시 입력해 주세요.',
    );
  }
}

window.addEventListener('pagehide', () => {
  state.stopWatch?.();
});

boot();
