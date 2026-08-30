import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeechText } from '../src/speech.js';

test('buildSpeechText: 이름과 도보 시간을 읽는다', () => {
  const text = buildSpeechText({ name: '강남역 지하1~2층', distance_m: 320 }, 0, true);
  assert.ok(text.includes('강남역 지하1~2층'));
  assert.ok(text.includes('5분'));
});

test('가장 가까운 곳이면 그렇게 말한다', () => {
  assert.ok(buildSpeechText({ name: '가나', distance_m: 100 }, 0, true).includes('가장 가까운'));
});

// 목록에서 다른 대피소를 고르면 그게 맨 위로 올라온다.
// 그때도 '가장 가까운'이라고 말하면 사실이 아닌 안내가 된다.
test('내가 고른 곳이면 가장 가깝다고 말하지 않는다', () => {
  const text = buildSpeechText({ name: '가나', distance_m: 900 }, 0, false);
  assert.ok(!text.includes('가장 가까운'));
  assert.ok(text.includes('가나'));
  assert.ok(text.includes('13분'));
});

test('세 번째 인자를 안 주면 가장 가까운 곳으로 본다', () => {
  assert.ok(buildSpeechText({ name: '가나', distance_m: 100 }, 0).includes('가장 가까운'));
});

test('buildSpeechText: 인원이 있으면 인원도 읽는다', () => {
  const text = buildSpeechText({ name: '가나', distance_m: 320 }, 12, true);
  assert.ok(text.includes('12명'));
});

test('buildSpeechText: 인원이 0이면 인원 문장을 뺀다', () => {
  const text = buildSpeechText({ name: '가나', distance_m: 100 }, 0, true);
  assert.ok(!text.includes('0명'));
  assert.ok(text.includes('가나'));
});

test('buildSpeechText: 대피소가 없으면 119 안내를 읽는다', () => {
  const text = buildSpeechText(null, 0);
  assert.ok(text.includes('찾지 못했'));
  assert.ok(text.includes('119'));
});

test('buildSpeechText: 이름의 줄바꿈을 정리한다', () => {
  assert.ok(!buildSpeechText({ name: '가\n나', distance_m: 100 }, 0).includes('\n'));
});
