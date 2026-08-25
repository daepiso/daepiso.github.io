import test from 'node:test';
import assert from 'node:assert/strict';
import { isStale, hasArrived } from '../src/trips.js';

const now = new Date('2026-08-25T10:00:00Z');

test('isStale: 2분 이내 신호는 살아 있다', () => {
  assert.equal(isStale(new Date('2026-08-25T09:59:00Z'), now), false);
});

test('isStale: 2분을 넘기면 유령이다', () => {
  assert.equal(isStale(new Date('2026-08-25T09:57:00Z'), now), true);
});

test('isStale: 정확히 2분은 아직 살아 있다', () => {
  assert.equal(isStale(new Date('2026-08-25T09:58:00Z'), now), false);
});

test('isStale: 문자열 시각도 받는다', () => {
  assert.equal(isStale('2026-08-25T09:57:00Z', now), true);
});

test('hasArrived: 100m 이내면 도착', () => {
  assert.equal(hasArrived({ lat: 37.4980, lng: 127.0277 }, { lat: 37.4979, lng: 127.0276 }), true);
});

test('hasArrived: 100m를 넘으면 이동 중', () => {
  assert.equal(hasArrived({ lat: 37.5006, lng: 127.0365 }, { lat: 37.4979, lng: 127.0276 }), false);
});
