import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheShelters, readCachedShelters } from '../src/shelters.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const list = [{ id: '1', name: '강남역 지하1~2층', lat: 37.5, lng: 127.0, distance_m: 100 }];

test('cacheShelters / readCachedShelters: 왕복한다', () => {
  const s = fakeStorage();
  cacheShelters(list, { lat: 37.5, lng: 127.0 }, s);
  const cached = readCachedShelters(s);
  assert.equal(cached.shelters.length, 1);
  assert.equal(cached.shelters[0].name, '강남역 지하1~2층');
  assert.equal(cached.origin.lat, 37.5);
  assert.ok(cached.savedAt);
});

test('readCachedShelters: 캐시가 없으면 null', () => {
  assert.equal(readCachedShelters(fakeStorage()), null);
});

test('readCachedShelters: 깨진 JSON이면 null 이고 던지지 않는다', () => {
  assert.equal(readCachedShelters(fakeStorage({ 'shelter.cache': '{{{' })), null);
});

test('readCachedShelters: shelters 가 배열이 아니면 null', () => {
  assert.equal(readCachedShelters(fakeStorage({ 'shelter.cache': '{"shelters":"x"}' })), null);
});

test('cacheShelters: 저장 공간이 꽉 차도 던지지 않는다', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.doesNotThrow(() => cacheShelters(list, { lat: 37.5, lng: 127.0 }, broken));
});
