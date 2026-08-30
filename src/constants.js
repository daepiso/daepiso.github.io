export const CATEGORIES = [
  { key: 'civil_defense', label: '민방위', aria: '민방위 대피시설' },
  { key: 'earthquake', label: '지진', aria: '지진 옥외대피장소' },
  { key: 'heat_cold', label: '폭염·한파', aria: '폭염 한파 쉼터' },
  { key: 'temp_housing', label: '임시주거', aria: '이재민 임시주거시설' },
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
