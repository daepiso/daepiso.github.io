// 칩에 적히는 이름은 공공데이터의 실제 이름을 그대로 쓴다.
// 어르신이 뉴스나 안내문에서 본 말과 앱의 말이 같아야 헷갈리지 않는다.
export const CATEGORIES = [
  { key: 'civil_defense', label: '민방위대피시설', aria: '민방위 대피시설' },
  { key: 'earthquake', label: '지진옥외대피장소', aria: '지진 옥외대피장소' },
  { key: 'heat_cold', label: '무더위쉼터', aria: '무더위쉼터' },
  { key: 'temp_housing', label: '이재민임시주거시설', aria: '이재민 임시주거시설' },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export const RADIUS_STEPS_M = [3000, 5000, 10000];

export const HEARTBEAT_INTERVAL_MS = 30_000;
// 실시간 연결을 못 쓸 때 인원 수를 다시 물어보는 간격
export const COUNT_POLL_INTERVAL_MS = 20_000;
export const TRIP_STALE_MS = 120_000;
export const ARRIVAL_RADIUS_M = 100;
// 첫 위치를 잡는 데 주는 시간.
// 2초로 줄였더니 대부분 시간 초과로 실패해서 오히려 못 찾았다.
// 폰에서 기지국·와이파이 측위는 보통 2~5초 걸린다.
// 기다리는 동안 지난번 목록과 도는 표시를 보여주므로 넉넉히 준다.
export const GPS_FAST_TIMEOUT_MS = 10_000;

// 정밀 GPS는 첫 화면을 막지 않고 뒤에서 기다린다.
// 위성 신호는 실내나 건물 사이에서 20초까지 걸린다.
export const GPS_TIMEOUT_MS = 20_000;

// 최근에 잡아둔 위치는 그대로 쓴다. 있으면 기다림 없이 즉시 답한다.
export const GPS_CACHE_MAX_AGE_MS = 300_000;
export const WALK_METERS_PER_MINUTE = 67;

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
