import test from 'node:test';
import assert from 'node:assert/strict';
import { readFavorites, toggleFavorite } from '../src/favorites.js';

// 폰의 저장 공간을 흉내낸다.
function 저장소(처음 = {}) {
  const 값 = { ...처음 };
  return {
    getItem: (k) => (k in 값 ? 값[k] : null),
    setItem: (k, v) => { 값[k] = String(v); },
    removeItem: (k) => { delete 값[k]; },
  };
}

// 저장이 막힌 폰. 사생활 보호 모드에서 실제로 이렇게 던진다.
function 막힌저장소() {
  return {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceeded'); },
    removeItem: () => {},
  };
}

test('처음에는 비어 있다', () => {
  assert.equal(readFavorites(저장소()).size, 0);
});

test('별을 달면 들어간다', () => {
  const s = 저장소();
  const 결과 = toggleFavorite('가', s);
  assert.ok(결과.has('가'));
});

test('같은 것을 다시 누르면 빠진다', () => {
  const s = 저장소();
  toggleFavorite('가', s);
  const 결과 = toggleFavorite('가', s);
  assert.ok(!결과.has('가'));
});

test('저장한 것이 다시 읽힌다', () => {
  const s = 저장소();
  toggleFavorite('가', s);
  toggleFavorite('나', s);
  const 다시 = readFavorites(s);
  assert.ok(다시.has('가'));
  assert.ok(다시.has('나'));
  assert.equal(다시.size, 2);
});

// 즐겨찾기가 안 되는 것이 대피소를 못 보는 것으로 번지면 안 된다.
test('저장이 막혀도 던지지 않는다', () => {
  const 결과 = toggleFavorite('가', 막힌저장소());
  assert.ok(결과.has('가'), '이번 화면에서는 켜져 보여야 한다');
});

test('망가진 값이 들어 있으면 빈 것으로 본다', () => {
  assert.equal(readFavorites(저장소({ 'shelter.favorites': '{{{' })).size, 0);
  assert.equal(readFavorites(저장소({ 'shelter.favorites': '"글자"' })).size, 0);
});

test('읽기 자체가 터져도 빈 것을 돌려준다', () => {
  const 터지는저장소 = { getItem: () => { throw new Error('막힘'); } };
  assert.equal(readFavorites(터지는저장소).size, 0);
});
