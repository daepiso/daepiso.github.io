import test from 'node:test';
import assert from 'node:assert/strict';
import { savePlace, readSavedPlace, forgetPlace } from '../src/location.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const 호원동 = { lat: 37.7386, lng: 127.0455, label: '경기 의정부시 호원동' };

// 기억하지 않으면 새로고침할 때마다 '지금 계신 곳을 알 수 없습니다'로
// 돌아가고, 어르신은 매번 동네 이름을 다시 입력해야 한다.
test('직접 넣은 동네를 기억했다 다시 꺼낸다', () => {
  const s = fakeStorage();
  savePlace(호원동, s);
  const got = readSavedPlace(s);
  assert.equal(got.label, '경기 의정부시 호원동');
  assert.equal(got.lat, 37.7386);
  assert.equal(got.lng, 127.0455);
});

test('기억한 게 없으면 null', () => {
  assert.equal(readSavedPlace(fakeStorage()), null);
});

test('잊으면 다시 null', () => {
  const s = fakeStorage();
  savePlace(호원동, s);
  forgetPlace(s);
  assert.equal(readSavedPlace(s), null);
});

test('깨진 값이 들어 있어도 던지지 않고 null', () => {
  assert.equal(readSavedPlace(fakeStorage({ 'shelter.place': '{{{' })), null);
});

test('좌표가 숫자가 아니면 쓰지 않는다', () => {
  const s = fakeStorage({ 'shelter.place': JSON.stringify({ lat: '37', lng: 127, label: '가' }) });
  assert.equal(readSavedPlace(s), null);
});

test('동네 이름이 없으면 쓰지 않는다', () => {
  const s = fakeStorage({ 'shelter.place': JSON.stringify({ lat: 37, lng: 127 }) });
  assert.equal(readSavedPlace(s), null);
});

test('저장 공간이 꽉 차도 던지지 않는다', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('Quota'); }, removeItem: () => {} };
  assert.doesNotThrow(() => savePlace(호원동, broken));
});
