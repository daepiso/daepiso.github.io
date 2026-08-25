import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, formatDistance, walkMinutes, expandRadius } from '../src/geo.js';

test('haversineMeters: 같은 지점은 0', () => {
  const p = { lat: 37.4979, lng: 127.0276 };
  assert.equal(haversineMeters(p, p), 0);
});

test('haversineMeters: 강남역과 역삼역 사이는 700~900m', () => {
  const d = haversineMeters({ lat: 37.4979, lng: 127.0276 }, { lat: 37.5006, lng: 127.0365 });
  assert.ok(d > 700 && d < 900, `실제 ${d}m`);
});

test('haversineMeters: 대칭이다', () => {
  const a = { lat: 37.5, lng: 127.0 };
  const b = { lat: 37.6, lng: 127.1 };
  assert.equal(haversineMeters(a, b), haversineMeters(b, a));
});

test('formatDistance: 1km 미만은 10m 단위', () => {
  assert.equal(formatDistance(324), '320m');
  assert.equal(formatDistance(5), '10m');
});

test('formatDistance: 1km 이상은 소수점 한 자리', () => {
  assert.equal(formatDistance(1240), '1.2km');
  assert.equal(formatDistance(10000), '10.0km');
});

test('formatDistance: 반올림 후 1000m가 되면 km로 넘긴다', () => {
  assert.equal(formatDistance(999), '1.0km');
});

test('walkMinutes: 최소 1분, 반올림', () => {
  assert.equal(walkMinutes(10), 1);
  assert.equal(walkMinutes(335), 5);
  assert.equal(walkMinutes(670), 10);
});

test('expandRadius: 다음 단계, 마지막이면 null', () => {
  assert.equal(expandRadius(3000), 5000);
  assert.equal(expandRadius(5000), 10000);
  assert.equal(expandRadius(10000), null);
});
