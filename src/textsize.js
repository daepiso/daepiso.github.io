import { STORAGE_KEYS } from './constants.js';

// 어르신마다 편한 글자 크기가 다르다. 직접 고르게 한다.
// 안전디딤돌에도 같은 기능이 있어 낯설지 않다.

export const SIZES = [
  { key: 'm', label: '보통' },
  { key: 'l', label: '크게' },
  { key: 'xl', label: '아주 크게' },
];

export function nextSize(current) {
  const i = SIZES.findIndex((s) => s.key === current);
  return SIZES[(i + 1) % SIZES.length].key;
}

export function sizeLabel(key) {
  return SIZES.find((s) => s.key === key)?.label ?? '보통';
}

export function readSize(storage = globalThis.localStorage) {
  try {
    const v = storage.getItem(STORAGE_KEYS.textSize);
    return SIZES.some((s) => s.key === v) ? v : 'm';
  } catch {
    return 'm';
  }
}

export function saveSize(key, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEYS.textSize, key);
  } catch { /* 무시 */ }
}

// 글자 크기는 화면 전체에 걸리므로 body 에 표시를 붙인다.
export function applySize(key, body = globalThis.document?.body) {
  if (!body) return;
  body.classList.remove('text-l', 'text-xl');
  if (key === 'l') body.classList.add('text-l');
  if (key === 'xl') body.classList.add('text-xl');
}
