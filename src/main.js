import { KAKAO_JS_KEY } from './config.js';
import { CATEGORY_KEYS, RADIUS_STEPS_M, STORAGE_KEYS } from './constants.js';
import { expandRadius } from './geo.js';
import { fetchNearbyShelters, cacheShelters, readCachedShelters } from './shelters.js';
import { getCurrentPosition, watchPosition, searchAddress, reverseGeocode } from './location.js';
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
  stopWatch: null,
  notice: null,
};

// ─────────────────────────────── 부팅

async function boot() {
  await gateConsent();
  await loadKakao();
  ui.renderChips(state.categories, onToggleCategory);
  wireButtons();
  await locateAndSearch();
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
function loadKakao() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    script.onload = () => {
      try {
        window.kakao.maps.load(() => resolve(true));
      } catch {
        resolve(false);
      }
    };
    script.onerror = () => {
      console.warn('카카오 지도를 불러오지 못했습니다. 목록만 표시합니다.');
      ui.hideMap();
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

// ─────────────────────────────── 검색

async function locateAndSearch() {
  ui.setBusy(true);
  try {
    state.origin = await getCurrentPosition();
    ui.showFallback(false);
    reverseGeocode(state.origin.lat, state.origin.lng).then((place) => {
      ui.renderPlace(place ?? '현재 위치');
    });
    await search();
  } catch (err) {
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
    cacheShelters(found, state.origin);

    if (found.length === 0) {
      state.notice = '가까운 대피소를 찾지 못했습니다. 도움이 필요하면 119로 전화하세요.';
    }

    state.counts = await fetchCounts(found.map((s) => s.id));
    draw();
    drawMap();
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
  state.origin = state.origin ?? cached.origin;
  state.notice = `${reason ?? ''} 마지막으로 받은 정보를 보여드립니다.`.trim();
  draw();
  drawMap();
}

function draw() {
  const mine = getActiveTrip()?.shelterId ?? null;
  ui.renderList(state.shelters, state.counts, { onGo, onSelect }, state.notice, mine);
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
  ui.renderChips(state.categories, onToggleCategory);
  search();
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

function wireButtons() {
  document.getElementById('speak').addEventListener('click', () => {
    const top = state.shelters[0] ?? null;
    const text = buildSpeechText(top, top ? state.counts.get(top.id) ?? 0 : 0);

    // 글씨는 곧바로 띄운다. 소리를 기다리게 하지 않는다.
    ui.showSpokenText(text);

    // speak() 를 await 없이 부른다. 기다렸다가 부르면 모바일 브라우저가
    // '사용자가 누른 순간'이 아니라고 보고 재생을 거부한다.
    speak(text).then((spoke) => {
      if (!spoke) ui.showOpenInChrome(() => openExternally());
    });
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
  if (!query) {
    ui.showAddressError('동네 이름을 입력해 주세요.');
    return;
  }
  ui.showAddressError(null);
  try {
    const place = await searchAddress(query);
    state.origin = { lat: place.lat, lng: place.lng };
    ui.renderPlace(place.label);
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
