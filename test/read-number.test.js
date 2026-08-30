import test from 'node:test';
import assert from 'node:assert/strict';
import { sinoKorean, readableForSpeech } from '../src/speech.js';

// 음성 엔진은 '1차'를 '한 차'로 읽는다. 대피소 이름의 숫자는
// 거의 언제나 한자어(일, 이, 삼)로 읽어야 맞다.

test('sinoKorean: 한 자리', () => {
  assert.equal(sinoKorean(0), '영');
  assert.equal(sinoKorean(1), '일');
  assert.equal(sinoKorean(9), '구');
});

test('sinoKorean: 십의 자리는 일십이 아니라 십', () => {
  assert.equal(sinoKorean(10), '십');
  assert.equal(sinoKorean(11), '십일');
  assert.equal(sinoKorean(20), '이십');
  assert.equal(sinoKorean(35), '삼십오');
});

test('sinoKorean: 백, 천도 앞의 일을 붙이지 않는다', () => {
  assert.equal(sinoKorean(100), '백');
  assert.equal(sinoKorean(101), '백일');
  assert.equal(sinoKorean(1000), '천');
  assert.equal(sinoKorean(1234), '천이백삼십사');
});

test('우성1차아파트를 우성일차아파트로 읽는다', () => {
  assert.equal(readableForSpeech('우성1차아파트'), '우성일차아파트');
});

test('지하 층수도 한자어로 읽는다', () => {
  assert.equal(readableForSpeech('지하주차장 1층'), '지하주차장 일층');
});

test('물결표는 에서로 읽는다', () => {
  assert.equal(readableForSpeech('강남역 지하1~2층'), '강남역 지하일에서 이층');
});

test('물결표 앞뒤 공백도 처리한다', () => {
  assert.equal(readableForSpeech('지하2 ~ 6층'), '지하이에서 육층');
});

test('숫자가 없으면 그대로 둔다', () => {
  assert.equal(readableForSpeech('건영아파트 지하주차장'), '건영아파트 지하주차장');
});

test('여러 숫자를 모두 바꾼다', () => {
  assert.equal(readableForSpeech('우성2차아파트 지하 3층'), '우성이차아파트 지하 삼층');
});

test('걸어서 18분도 한자어로 읽는다', () => {
  assert.ok(readableForSpeech('걸어서 18분입니다').includes('십팔분'));
});

test('아주 큰 수는 건드리지 않는다', () => {
  assert.equal(readableForSpeech('17228곳'), '17228곳');
});

test('빈 값에 던지지 않는다', () => {
  assert.equal(readableForSpeech(''), '');
  assert.equal(readableForSpeech(null), '');
});
