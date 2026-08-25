import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapLink, buildSmsBody, buildSmsHref } from '../src/share.js';

const shelter = { id: 'abc', name: '도곡초등학교 지하', lat: 37.4979, lng: 127.0276 };

test('buildMapLink: 좌표가 들어간 카카오맵 링크', () => {
  const link = buildMapLink(shelter);
  assert.ok(link.startsWith('https://map.kakao.com/link/map/'));
  assert.ok(link.includes('37.4979') && link.includes('127.0276'));
});

test('buildSmsBody: 이름과 링크를 포함한다', () => {
  const body = buildSmsBody(shelter);
  assert.ok(body.includes('도곡초등학교 지하'));
  assert.ok(body.includes('https://map.kakao.com/'));
});

test('buildSmsBody: 이름의 줄바꿈을 정리한다', () => {
  assert.ok(buildSmsBody({ ...shelter, name: '도곡\n초등학교' }).includes('도곡 초등학교'));
});

test('buildSmsHref: sms 스킴이고 공백이 인코딩된다', () => {
  const href = buildSmsHref(shelter);
  assert.ok(href.startsWith('sms:?body='));
  assert.ok(!href.includes(' '));
});
