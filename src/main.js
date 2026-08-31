import { KAKAO_JS_KEY } from './config.js';
import { CATEGORY_KEYS, RADIUS_STEPS_M, STORAGE_KEYS } from './constants.js';
import { expandRadius, haversineMeters } from './geo.js';
import {
  fetchNearbyShelters, fetchNearbyCounts, cacheShelters, readCachedShelters,
} from './shelters.js';
import {
  getFastPosition, getAccuratePosition, watchPosition, searchAddress, reverseGeocode,
  savePlace, readSavedPlace, forgetPlace,
} from './location.js';
import {
  startTrip, endTrip, fetchCounts, watchCounts, hasArrived, getActiveTrip,
} from './trips.js';
import { buildWalkDirectionsUrl } from './directions.js';
import { buildSpeechText, speak } from './speech.js';
import { openSmsApp } from './share.js';
import { openExternally } from './external.js';
import { initMap, renderMarkers, isMapReady } from './map.js';
import { readSize, saveSize, applySize, nextSize, sizeLabel } from './textsize.js';
import * as ui from './ui.js';

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
};

// 위치 자동 탐색마다 번호를 붙인다. 사용자가 동네를 직접 검색하면
// 뒤늦게 도착한 GPS 결과가 그 선택을 덮어쓰지 못한다.
let locationAttempt = 0;

// ─────────────────────────────── 부팅

// 지도는 '있으면 좋은 것'이다. 지도를 기다리다 앱 전체가 멈추면 안 된다.
// 예전에는 await loadKakao() 를 먼저 걸어서, 카카오 서버가 응답하지 않으면
// 칩도 목록도 위치 안내도 영영 나오지 않고 빈 화면만 남았다.
async function boot() {
  // 글자 크기는 화면이 그려지기 전에 걸어야 깜빡이지 않는다.
  setupTextSize();

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

function setupTextSize() {
  let 지금 = readSize();
  applySize(지금);
  ui.renderTextSize(sizeLabel(지금));

  on('text-size', 'click', () => {
    지금 = nextSize(지금);
    saveSize(지금);
    applySize(지금);
    ui.renderTextSize(sizeLabel(지금));
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
  const attempt = ++locationAttempt;
  ui.setBusy(true, '내 위치를 찾는 중입니다…');
  // 위치 확인이 오래 걸리는 기기에서도 빈 화면만 보지 않도록
  // 동네 이름으로 찾는 방법을 처음부터 함께 열어둔다.
  ui.showFallback(true, false, true);
  const saved = readSavedPlace();
  if (saved) {
    state.origin = { lat: saved.lat, lng: saved.lng };
    state.placeLabel = saved.label;
    ui.renderPlace(saved.label);
    ui.showFallback(true, true);
  } else {
    ui.renderPlace('내 위치를 찾는 중입니다…');
  }

  // 위치를 받는 데 몇 초가 걸린다. 그동안 빈 화면을 보여주면
  // 어르신은 앱이 멈춘 줄 안다. 지난번 목록을 먼저 띄워둔다.
  showCacheWhileWaiting();
  if (saved) drawMap();

  try {
    state.origin = await getFastPosition();
    if (attempt !== locationAttempt) return;
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
    if (attempt !== locationAttempt) return;
    // 빠른 위치를 못 잡아도 전에 넣어둔 동네가 있으면 곧바로 사용한다.
    if (saved) {
      state.origin = { lat: saved.lat, lng: saved.lng };
      state.placeLabel = saved.label;
      ui.renderPlace(saved.label);
      ui.showFallback(true, true);
      await search();
    } else {
      ui.renderPlace(err.message === 'DENIED' ? '위치를 쓸 수 없습니다' : '위치를 찾지 못했습니다');
      ui.showFallback(true);
      showCacheIfAny();
    }
  } finally {
    ui.setBusy(false);
  }

  // 정밀 GPS는 첫 화면을 막지 않는다. 나중에 더 정확한 좌표가 오면
  // 충분히 차이가 날 때만 목록과 지도를 조용히 보정한다.
  refinePositionInBackground(attempt);
}

async function refinePositionInBackground(attempt) {
  try {
    const accurate = await getAccuratePosition();
    if (attempt !== locationAttempt) return;
    const moved = state.origin ? haversineMeters(state.origin, accurate) : Infinity;
    state.origin = accurate;
    forgetPlace();
    if (moved >= 100 || state.shelters.length === 0) await search();
    state.placeLabel = null;
    ui.renderPlace('현재 위치');
    refreshPlaceLabel();
    drawMap();
  } catch { /* 정밀 위치는 보조 기능이므로 실패해도 현재 화면을 유지한다. */ }
}

async function search() {
  if (!state.origin) return;
  state.notice = null;
  ui.setBusy(true, '가까운 대피소를 찾고 있습니다…');

  try {
    let found = [];
    let radius = RADIUS_STEPS_M[0];
    while (radius) {
      found = await fetchNearbyShelters({
        lat: state.origin.lat,
        lng: state.origin.lng,
        radiusM: radius,
        categories: [state.category],
      });
      if (found.length > 0) break;
      radius = expandRadius(radius);
    }

    state.shelters = found;
    // 목록은 가까운 순으로 온다. 어느 것이 가장 가까운지 여기서 정해둔다.
    state.nearestId = found[0]?.id ?? null;
    state.counts = new Map();
    cacheShelters(found, state.origin);

    state.notice = found.length === 0
      ? '가까운 대피소를 찾지 못했습니다. 도움이 필요하면 119로 전화하세요.'
      : null;

    // 대피소가 오면 곧바로 그린다.
    // 인원 수를 기다렸다가 그리면 서버를 한 번 더 다녀오는 만큼 늦어진다.
    // 급한 사람에게 필요한 것은 '어디로 가야 하나'이지 '몇 명이 가나'가 아니다.
    draw();
    drawMap();

    fetchCounts(found.map((s) => s.id)).then((counts) => {
      if (counts.size === 0) return;
      state.counts = counts;
      draw();
    });

    // 칩의 개수는 앱을 막지 않는다. 늦게 와도 그때 다시 그리면 된다.
    fetchNearbyCounts({ lat: state.origin.lat, lng: state.origin.lng, radiusM: radius })
      .then((counts) => {
        if (counts.size === 0) return;
        state.categoryCounts = counts;
        drawChips();
      });
    watchCounts({
      getShelterIds: () => state.shelters.map((s) => s.id),
      onChange: onCountChange,
      onCounts: onCountsRefreshed,
    }).catch(() => {});
  } catch (err) {
    console.error(err);
    showCacheIfAny('지금은 최신 정보를 받지 못했습니다.');
  } finally {
    ui.setBusy(false);
  }
}

// 위치를 찾는 동안 지난번 목록을 미리 보여준다.
// 곧 진짜 목록으로 바뀐다.
function showCacheWhileWaiting() {
  if (state.shelters.length > 0) return;
  const cached = readCachedShelters();
  if (!cached || cached.shelters.length === 0) return;
  state.shelters = cached.shelters;
  state.nearestId = cached.shelters[0]?.id ?? null;
  state.notice = '지난번에 찾은 목록입니다. 지금 위치로 다시 찾고 있습니다.';
  draw();
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
  ui.renderChips(state.category, onSelectCategory, state.categoryCounts);
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
    // 아직 카카오가 준비되지 않았을 수 있다. 준비되면 다시 부른다.
    ui.hideMap();
    return;
  }
  // 앞서 숨겼더라도 이제 그릴 수 있으니 다시 보여준다.
  ui.showMap();
  renderMarkers(state.shelters, state.origin, onSelect);
}

function onCountChange(shelterId, count) {
  state.counts.set(shelterId, count);
  draw();
}

// 주기 조회로 통째로 받아왔을 때.
function onCountsRefreshed(counts) {
  let 바뀐것 = false;
  for (const [id, n] of counts) {
    if (state.counts.get(id) !== n) {
      state.counts.set(id, n);
      바뀐것 = true;
    }
  }
  // 바뀐 게 없으면 다시 그리지 않는다. 20초마다 화면이 깜빡이면 안 된다.
  if (바뀐것) draw();
}

// 한 번에 한 종류만 본다. 이미 고른 것을 다시 눌러도 꺼지지 않는다.
// 아무것도 안 켜진 상태를 만들면 어르신은 빈 화면 앞에서 막힌다.
function onSelectCategory(key) {
  if (state.category === key) return;
  state.category = key;
  saveCategory();
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

// 예전에는 여러 개를 배열로 저장했다. 그 값도 자연스럽게 넘어가도록
// 배열이면 첫 번째를 쓴다.
function loadCategory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.categories) ?? 'null');
    const key = Array.isArray(saved) ? saved[0] : saved;
    if (CATEGORY_KEYS.includes(key)) return key;
  } catch { /* 무시 */ }
  // '대피소'라고 하면 보통 민방위 대피시설을 뜻한다.
  return 'civil_defense';
}

function saveCategory() {
  try {
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(state.category));
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
    // 사용자의 직접 선택이므로 진행 중인 자동 GPS 보정을 무효화한다.
    locationAttempt += 1;
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
