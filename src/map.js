// 지도는 있으면 좋은 것이다. 실패해도 목록은 계속 보여야 하므로
// 이 모듈의 모든 함수는 던지지 않고 false 를 돌려준다.

let map = null;
let markers = [];
let meCircle = null;

export function isMapReady() {
  return map !== null;
}

export function initMap(el, center) {
  try {
    if (!window.kakao?.maps?.Map) return false;
    map = new window.kakao.maps.Map(el, {
      center: new window.kakao.maps.LatLng(center.lat, center.lng),
      level: 5,
    });
    return true;
  } catch {
    map = null;
    return false;
  }
}

export function renderMarkers(shelters, me, onMarkerClick) {
  if (!map) return false;
  try {
    markers.forEach((m) => m.setMap(null));
    markers = [];

    for (const s of shelters.slice(0, 30)) {
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        title: s.name,
      });
      marker.setMap(map);
      if (onMarkerClick) {
        window.kakao.maps.event.addListener(marker, 'click', () => onMarkerClick(s));
      }
      markers.push(marker);
    }

    if (me) {
      meCircle?.setMap(null);
      meCircle = new window.kakao.maps.Circle({
        center: new window.kakao.maps.LatLng(me.lat, me.lng),
        radius: 25,
        strokeWeight: 3,
        strokeColor: '#ffffff',
        fillColor: '#1a73e8',
        fillOpacity: 1,
      });
      meCircle.setMap(map);
    }

    const bounds = new window.kakao.maps.LatLngBounds();
    if (me) bounds.extend(new window.kakao.maps.LatLng(me.lat, me.lng));
    shelters.slice(0, 5).forEach((s) => bounds.extend(new window.kakao.maps.LatLng(s.lat, s.lng)));
    if (me || shelters.length > 0) map.setBounds(bounds);
    return true;
  } catch {
    return false;
  }
}

export function relayout() {
  try {
    map?.relayout();
  } catch {
    /* 무시 */
  }
}
