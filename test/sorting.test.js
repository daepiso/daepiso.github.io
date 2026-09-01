import test from 'node:test';
import assert from 'node:assert/strict';
import { sortShelters } from '../src/sorting.js';

const 목록 = [
  { id: '가', distance_m: 100 },
  { id: '나', distance_m: 300 },
  { id: '다', distance_m: 500 },
  { id: '라', distance_m: 700 },
];

const 이름들 = (list) => list.map((s) => s.id).join('');

test('거리순은 서버가 준 순서를 그대로 둔다', () => {
  assert.equal(이름들(sortShelters(목록, { sort: 'distance', favorites: new Set() })), '가나다라');
});

test('별 단 것이 앞으로 온다', () => {
  const 결과 = sortShelters(목록, { sort: 'favorite', favorites: new Set(['다']) });
  assert.equal(이름들(결과), '다가나라');
});

test('별 단 것끼리는 가까운 순이다', () => {
  const 결과 = sortShelters(목록, { sort: 'favorite', favorites: new Set(['라', '나']) });
  assert.equal(이름들(결과), '나라가다');
});

test('별 없는 것끼리도 가까운 순이다', () => {
  const 결과 = sortShelters(목록, { sort: 'favorite', favorites: new Set(['라']) });
  assert.equal(이름들(결과), '라가나다');
});

// 원본을 흐트러뜨리면 다음 그리기 때 순서가 엉킨다.
test('원본 배열을 건드리지 않는다', () => {
  const 원본 = [...목록];
  sortShelters(목록, { sort: 'favorite', favorites: new Set(['라']) });
  assert.deepEqual(목록, 원본);
});

test('거리순도 새 배열을 돌려준다', () => {
  const 결과 = sortShelters(목록, { sort: 'distance', favorites: new Set() });
  assert.notEqual(결과, 목록, '같은 배열을 그대로 돌려주면 안 된다');
});

test('빈 목록이어도 터지지 않는다', () => {
  assert.deepEqual(sortShelters([], { sort: 'favorite', favorites: new Set() }), []);
});

// 저장된 값이 망가졌거나 옛 버전일 수 있다. 그때는 거리순이 안전하다.
test('모르는 순서를 주면 거리순으로 본다', () => {
  assert.equal(이름들(sortShelters(목록, { sort: '엉뚱', favorites: new Set() })), '가나다라');
});

test('즐겨찾기가 없어도 터지지 않는다', () => {
  assert.equal(이름들(sortShelters(목록, { sort: 'favorite' })), '가나다라');
});
