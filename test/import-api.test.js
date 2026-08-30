import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecords, toCsv } from '../scripts/import-api.mjs';

// 공공데이터 API 는 기관마다 응답 껍데기가 다르다.
// 실제로 마주친 모양들을 고정해둔다.

test('findRecords: 표준 껍데기 (response.body.items.item)', () => {
  const rows = findRecords({
    response: { header: { resultCode: '00' }, body: { items: { item: [{ a: 1 }, { a: 2 }] } } },
  });
  assert.equal(rows.length, 2);
});

test('findRecords: 행안부식 껍데기 (이름.row)', () => {
  const rows = findRecords({
    EmergencyAssemblyArea: [
      { head: [{ totalCount: 2 }] },
      { row: [{ b: 1 }, { b: 2 }, { b: 3 }] },
    ],
  });
  assert.equal(rows.length, 3);
});

test('findRecords: 배열이 최상위에 바로 있는 경우', () => {
  assert.equal(findRecords([{ c: 1 }]).length, 1);
});

test('findRecords: 레코드가 없으면 null', () => {
  assert.equal(findRecords({ response: { body: { items: { item: [] } } } }), null);
});

test('findRecords: 숫자 배열은 레코드가 아니다', () => {
  assert.equal(findRecords({ nums: [1, 2, 3] }), null);
});

test('findRecords: null 이나 원시값에 던지지 않는다', () => {
  assert.equal(findRecords(null), null);
  assert.equal(findRecords('문자열'), null);
  assert.equal(findRecords(42), null);
});

test('toCsv: 헤더와 값을 만든다', () => {
  const csv = toCsv([{ 이름: '가나', 위도: 37.5 }]);
  const lines = csv.replace(/^﻿/, '').trim().split('\n');
  assert.equal(lines[0], '이름,위도');
  assert.equal(lines[1], '가나,37.5');
});

test('toCsv: 레코드마다 필드가 달라도 헤더를 합친다', () => {
  const csv = toCsv([{ a: 1 }, { b: 2 }]);
  const lines = csv.replace(/^﻿/, '').trim().split('\n');
  assert.equal(lines[0], 'a,b');
  assert.equal(lines[1], '1,');
  assert.equal(lines[2], ',2');
});

test('toCsv: 쉼표와 따옴표가 든 값을 감싼다', () => {
  const csv = toCsv([{ 주소: '서울, 강남구', 비고: '그는 "여기"라 했다' }]);
  assert.ok(csv.includes('"서울, 강남구"'));
  assert.ok(csv.includes('"그는 ""여기""라 했다"'));
});

test('toCsv: 엑셀이 한글을 깨뜨리지 않도록 BOM 을 붙인다', () => {
  assert.ok(toCsv([{ a: 1 }]).startsWith('﻿'));
});
