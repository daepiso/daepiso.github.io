import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow, isValidRow, isOperating, dedupe } from '../scripts/normalize.js';

const 민방위행 = {
  '관리번호': '3000000-S200700223',
  '시설명': '  광화문빌딩  지하1층 ',
  '도로명전체주소': '서울특별시 종로구 종로 386',
  '소재지전체주소': '서울특별시 종로구 신문로 200-26',
  '위도(EPSG4326)': '37.57420241053118',
  '경도(EPSG4326)': '127.02020769406877',
  '최대수용인원': '734',
  '시설위치(지상/지하)': '지하',
  '운영상태': '운영중',
};

test('normalizeRow: 민방위 원본을 공통 스키마로 바꾼다', () => {
  const row = normalizeRow('civil_defense', 민방위행);
  assert.equal(row.ext_id, '3000000-S200700223');
  assert.equal(row.category, 'civil_defense');
  assert.equal(row.name, '광화문빌딩 지하1층');
  assert.equal(row.address, '서울특별시 종로구 종로 386');
  assert.equal(row.lat, 37.57420241053118);
  assert.equal(row.lng, 127.02020769406877);
  assert.equal(row.capacity, 734);
  assert.equal(row.detail, '지하');
});

test('normalizeRow: 도로명주소가 비면 지번주소를 쓴다', () => {
  const row = normalizeRow('civil_defense', { ...민방위행, '도로명전체주소': '' });
  assert.equal(row.address, '서울특별시 종로구 신문로 200-26');
});

test('normalizeRow: 수용인원의 천단위 쉼표를 처리한다', () => {
  const row = normalizeRow('civil_defense', { ...민방위행, '최대수용인원': '1,200' });
  assert.equal(row.capacity, 1200);
});

// safetydata.go.kr 오픈API 의 실제 응답에서 가져온 값이다.
const 지진행 = {
  ARCD: '2623000000',
  ACMDFCLTY_SN: '48',
  VT_ACMDFCLTY_NM: '  선암초등학교  운동장 ',
  RN_DTL_ADRES: '부산광역시 부산진구 엄광로 412(범천동)',
  EQK_ACMDFCLTY_ADRES: '부산광역시 부산진구 범천동 1223-27',
  LA: '35.14909702772257',
  LO: '129.04951053256778',
  VT_ACMD_PSBL_NMPR: '2513',
  TELNO: '051-642-4208',
};

test('normalizeRow: 지진 원본을 공통 스키마로 바꾼다', () => {
  const row = normalizeRow('earthquake', 지진행);
  assert.equal(row.ext_id, '2623000000-48');
  assert.equal(row.category, 'earthquake');
  assert.equal(row.name, '선암초등학교 운동장');
  assert.equal(row.address, '부산광역시 부산진구 엄광로 412(범천동)');
  assert.equal(row.lat, 35.14909702772257);
  assert.equal(row.lng, 129.04951053256778);
  assert.equal(row.capacity, 2513);
  assert.equal(row.tel, '051-642-4208');
});

// 시설번호는 지역코드 안에서만 고유하다. 48번이 부산에도 전남에도 있다.
// 지역코드를 안 붙이면 11,174건이 452건으로 줄어든다.
test('지역이 다르면 시설번호가 같아도 다른 곳으로 본다', () => {
  const 부산 = normalizeRow('earthquake', 지진행);
  const 전남 = normalizeRow('earthquake', { ...지진행, ARCD: '5221000000' });
  assert.notEqual(부산.ext_id, 전남.ext_id);
  assert.equal(dedupe([부산, 전남]).length, 2);
});

test('normalizeRow: 지진은 도로명주소가 비면 지번주소를 쓴다', () => {
  const row = normalizeRow('earthquake', { ...지진행, RN_DTL_ADRES: '' });
  assert.equal(row.address, '부산광역시 부산진구 범천동 1223-27');
});

// 지진 데이터에는 운영상태 칸이 없다. 없다고 전부 걸러지면 안 된다.
test('운영상태 칸이 없는 종류도 통과시킨다', () => {
  const row = normalizeRow('earthquake', 지진행);
  assert.equal(isOperating(row), true);
  assert.equal(isValidRow(row), true);
});

test('normalizeRow: 모르는 종류는 던진다', () => {
  assert.throws(() => normalizeRow('unknown', 민방위행), /알 수 없는 종류/);
});

test('isValidRow: 한국 영역 안이면 통과', () => {
  assert.equal(isValidRow({ ext_id: '1', name: 'a', lat: 37.5, lng: 127.0 }), true);
});

test('isValidRow: 0,0 좌표를 거른다', () => {
  assert.equal(isValidRow({ ext_id: '1', name: 'a', lat: 0, lng: 0 }), false);
});

test('isValidRow: 해외 좌표를 거른다', () => {
  assert.equal(isValidRow({ ext_id: '1', name: 'a', lat: 51.5, lng: -0.1 }), false);
});

test('isValidRow: 이름이나 관리번호가 비면 거른다', () => {
  assert.equal(isValidRow({ ext_id: '1', name: '', lat: 37.5, lng: 127.0 }), false);
  assert.equal(isValidRow({ ext_id: '', name: 'a', lat: 37.5, lng: 127.0 }), false);
});

test('isValidRow: 좌표가 없으면 거른다', () => {
  assert.equal(isValidRow({ ext_id: '1', name: 'a', lat: null, lng: 127.0 }), false);
});

test('isOperating: 운영중은 남긴다', () => {
  assert.equal(isOperating({ status: '운영중' }), true);
});

test('isOperating: 해제/폐쇄는 거른다', () => {
  assert.equal(isOperating({ status: '해제' }), false);
  assert.equal(isOperating({ status: '폐쇄' }), false);
});

test('isOperating: 상태 정보가 없으면 남긴다', () => {
  assert.equal(isOperating({ status: '' }), true);
});

test('dedupe: category+ext_id 가 같으면 뒤엣것을 남긴다', () => {
  const out = dedupe([
    { category: 'temp_housing', ext_id: '1', name: '옛것' },
    { category: 'temp_housing', ext_id: '1', name: '새것' },
    { category: 'temp_housing', ext_id: '2', name: '다른것' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.ext_id === '1').name, '새것');
});
