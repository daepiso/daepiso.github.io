import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkDirectionsUrl } from '../src/directions.js';

const shelter = { name: '강남역 지하1~2층', lat: 37.4979, lng: 127.0276 };
const me = { lat: 37.5006, lng: 127.0365 };

test('buildWalkDirectionsUrl: 출발지와 목적지 좌표가 모두 들어간다', () => {
  const url = buildWalkDirectionsUrl(me, shelter);
  assert.ok(url.startsWith('https://map.kakao.com/'));
  assert.ok(url.includes('37.4979') && url.includes('127.0276'));
  assert.ok(url.includes('37.5006') && url.includes('127.0365'));
});

test('buildWalkDirectionsUrl: 도보 경로를 지정한다', () => {
  assert.ok(buildWalkDirectionsUrl(me, shelter).includes('WALK'));
});

test('buildWalkDirectionsUrl: 출발지를 모르면 목적지만 있는 링크', () => {
  const url = buildWalkDirectionsUrl(null, shelter);
  assert.ok(url.includes('37.4979'));
  assert.ok(!url.includes('null'));
  assert.ok(!url.includes('WALK'));
});

test('buildWalkDirectionsUrl: 공백과 특수문자가 인코딩된다', () => {
  const url = buildWalkDirectionsUrl(me, { ...shelter, name: '강남 지하 상가' });
  assert.ok(!url.includes(' '));
});
