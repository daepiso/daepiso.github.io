// CSV 원본을 shelters 테이블 스키마로 변환하는 순수 함수 모음.
// 파일 입출력이나 네트워크를 모른다. 테스트는 test/normalize.test.js.

// 종류별 컬럼 이름 매핑.
// 공공데이터 표준데이터는 한글 헤더를 쓴다. 실제 CSV 헤더를 그대로 적는다.
export const FIELD_MAP = {
  civil_defense: {
    ext: '관리번호',
    name: '시설명',
    addr: '도로명전체주소',
    addrAlt: '소재지전체주소',
    lat: '위도(EPSG4326)',
    lng: '경도(EPSG4326)',
    cap: '최대수용인원',
    detail: '시설위치(지상/지하)',
    status: '운영상태',
  },
};

const oneLine = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

export function normalizeRow(category, raw) {
  const m = FIELD_MAP[category];
  if (!m) throw new Error(`알 수 없는 종류: ${category}`);
  return {
    ext_id: oneLine(raw[m.ext]),
    category,
    name: oneLine(raw[m.name]),
    address: oneLine(raw[m.addr]) || oneLine(raw[m.addrAlt]),
    lat: num(raw[m.lat]),
    lng: num(raw[m.lng]),
    capacity: m.cap ? num(raw[m.cap]) : null,
    detail: (m.detail ? oneLine(raw[m.detail]) : '') || null,
    tel: oneLine(raw.전화번호 ?? raw.관리기관전화번호 ?? '') || null,
    status: m.status ? oneLine(raw[m.status]) : '',
  };
}

// 대한민국 영역 대략 경계. 좌표가 없거나 0,0 인 행을 거른다.
export function isValidRow(row) {
  if (!row.ext_id || !row.name) return false;
  if (row.lat == null || row.lng == null) return false;
  if (row.lat < 33 || row.lat > 39) return false;
  if (row.lng < 124 || row.lng > 132) return false;
  return true;
}

// 폐쇄된 시설을 대피소로 안내하면 위험하다. 운영 중인 것만 남긴다.
export function isOperating(row) {
  if (!row.status) return true;
  return !/해제|폐쇄|중지|미운영/.test(row.status);
}

export function dedupe(rows) {
  const seen = new Map();
  for (const r of rows) seen.set(`${r.category}::${r.ext_id}`, r);
  return [...seen.values()];
}
