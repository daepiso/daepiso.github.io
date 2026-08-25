const oneLine = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

// 카카오맵 도보 길찾기로 넘긴다.
// 카카오맵 앱이 깔려 있으면 앱이 열리며 음성 안내까지 이어지고,
// 없으면 웹 카카오맵이 열린다. 앱 안에서 경로를 직접 그리지 않는 이유다.
export function buildWalkDirectionsUrl(from, shelter) {
  const to = `${encodeURIComponent(oneLine(shelter.name))},${shelter.lat},${shelter.lng}`;
  if (!from) return `https://map.kakao.com/link/to/${to}`;
  const start = `${encodeURIComponent('내 위치')},${from.lat},${from.lng}`;
  return `https://map.kakao.com/link/by/WALK/${start}/${to}`;
}
