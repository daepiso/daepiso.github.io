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
