// 목록 순서를 정한다. 원본은 건드리지 않고 늘 새 배열을 돌려준다.
//
// 거리순은 서버가 이미 가까운 순으로 보내주므로 베끼기만 한다.
// 모르는 값이 들어오면 거리순으로 본다. 저장된 값이 망가졌을 때
// 엉뚱한 순서로 보여주는 것보다 안전하다.
export function sortShelters(shelters, { sort, favorites } = {}) {
  const list = [...shelters];
  if (sort !== 'favorite') return list;

  const 별 = (s) => (favorites?.has(s.id) ? 0 : 1);
  return list.sort((a, b) => 별(a) - 별(b) || a.distance_m - b.distance_m);
}
