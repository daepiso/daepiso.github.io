import { STORAGE_KEYS } from './constants.js';

// 통신이 끊겨도 마지막으로 본 목록은 보여줄 수 있어야 한다.
// 어떤 실패도 "대피소 목록을 보는 것"을 막지 않는다는 원칙.

export function cacheShelters(shelters, origin, storage = globalThis.localStorage) {
  try {
    storage.setItem(
      STORAGE_KEYS.shelterCache,
      JSON.stringify({ shelters, origin, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* 저장 공간 부족은 무시한다. 캐시는 있으면 좋은 것일 뿐이다. */
  }
}

export function readCachedShelters(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEYS.shelterCache);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.shelters)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchNearbyShelters({ lat, lng, radiusM, categories }) {
  const { db } = await import('./supabase.js');
  const { data, error } = await db.rpc('nearby_shelters', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_categories: categories,
  });
  if (error) throw new Error(`대피소 조회 실패: ${error.message}`);
  return data ?? [];
}
