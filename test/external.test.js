import test from 'node:test';
import assert from 'node:assert/strict';
import { isInAppBrowser, isAndroid, isIOS, buildExternalUrl } from '../src/external.js';

const 카카오톡 = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.5';
const 안드로이드크롬 = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const 아이폰사파리 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const 인스타 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 302.0.0.23.113';
const 데스크톱 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

const 주소 = 'https://daepiso.github.io/';

test('isInAppBrowser: 카카오톡을 알아본다', () => {
  assert.equal(isInAppBrowser(카카오톡), true);
});

test('isInAppBrowser: 인스타그램을 알아본다', () => {
  assert.equal(isInAppBrowser(인스타), true);
});

test('isInAppBrowser: 일반 브라우저는 아니라고 한다', () => {
  assert.equal(isInAppBrowser(안드로이드크롬), false);
  assert.equal(isInAppBrowser(아이폰사파리), false);
  assert.equal(isInAppBrowser(데스크톱), false);
});

test('isAndroid / isIOS 구분', () => {
  assert.equal(isAndroid(카카오톡), true);
  assert.equal(isIOS(카카오톡), false);
  assert.equal(isIOS(아이폰사파리), true);
  assert.equal(isAndroid(아이폰사파리), false);
});

test('buildExternalUrl: 안드로이드는 크롬을 직접 지정한다', () => {
  const url = buildExternalUrl(주소, 카카오톡);
  assert.ok(url.startsWith('intent://daepiso.github.io/'));
  assert.ok(url.includes('package=com.android.chrome'));
  assert.ok(url.includes('scheme=https'));
});

test('buildExternalUrl: iOS 는 크롬 스킴을 쓴다', () => {
  const url = buildExternalUrl(주소, 인스타);
  assert.equal(url, 'googlechrome://daepiso.github.io/');
});

test('buildExternalUrl: 데스크톱은 그대로 둔다', () => {
  assert.equal(buildExternalUrl(주소, 데스크톱), 주소);
});

test('buildExternalUrl: 물음표 뒤 값도 유지한다', () => {
  const url = buildExternalUrl('https://example.com/a?b=1', 카카오톡);
  assert.ok(url.includes('example.com/a?b=1'));
});

test('buildExternalUrl: 이상한 주소는 그대로 돌려주고 던지지 않는다', () => {
  assert.equal(buildExternalUrl('없는주소', 카카오톡), '없는주소');
});
