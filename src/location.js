import { GPS_TIMEOUT_MS, STORAGE_KEYS } from './constants.js';

// 직접 입력한 동네를 기억한다.
// 기억하지 않으면 새로고침할 때마다 '지금 계신 곳을 알 수 없습니다'로
// 돌아가고, 어르신은 매번 동네 이름을 다시 입력해야 한다.
export function savePlace(place, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEYS.savedPlace, JSON.stringify({
      lat: place.lat, lng: place.lng, label: place.label,
    }));
  } catch { /* 무시 */ }
}

export function readSavedPlace(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEYS.savedPlace);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.lat !== 'number' || typeof p?.lng !== 'number') return null;
    if (!p.label) return null;
    return p;
  } catch {
    return null;
  }
}

export function forgetPlace(storage = globalThis.localStorage) {
  try {
    storage.removeItem(STORAGE_KEYS.savedPlace);
  } catch { /* 무시 */ }
}

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(new Error('UNSUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'DENIED' : 'FAILED')),
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 30_000 },
    );
  });
}

// 도착 판정을 위해 위치를 계속 지켜본다. 중지 함수를 돌려준다.
export function watchPosition(onMove) {
  if (!isGeolocationSupported()) return () => {};
  const id = navigator.geolocation.watchPosition(
    (pos) => onMove({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => {},
    { enableHighAccuracy: true, maximumAge: 15_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

function geocoder() {
  if (!window.kakao?.maps?.services) throw new Error('KAKAO_NOT_READY');
  return new window.kakao.maps.services.Geocoder();
}

// 동네 이름 → 좌표. 주소로 먼저 찾고, 없으면 장소 이름으로 찾는다.
export function searchAddress(query) {
  return new Promise((resolve, reject) => {
    let g;
    try {
      g = geocoder();
    } catch (err) {
      reject(err);
      return;
    }

    g.addressSearch(query, (result, status) => {
      if (status === window.kakao.maps.services.Status.OK && result[0]) {
        resolve({
          lat: Number(result[0].y),
          lng: Number(result[0].x),
          label: result[0].address_name,
        });
        return;
      }
      const places = new window.kakao.maps.services.Places();
      places.keywordSearch(query, (kw, kwStatus) => {
        if (kwStatus === window.kakao.maps.services.Status.OK && kw[0]) {
          resolve({ lat: Number(kw[0].y), lng: Number(kw[0].x), label: kw[0].place_name });
        } else {
          reject(new Error('NOT_FOUND'));
        }
      });
    });
  });
}

// 좌표 → 동네 이름. 헤더에 "서울 강남구 도곡동" 을 띄우는 용도.
// 실패해도 앱은 계속 돌아야 하므로 절대 던지지 않는다.
export function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    try {
      geocoder().coord2RegionCode(lng, lat, (result, status) => {
        if (status === window.kakao.maps.services.Status.OK && result[0]) {
          resolve(result[0].address_name);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}
