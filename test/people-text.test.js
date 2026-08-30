import test from 'node:test';
import assert from 'node:assert/strict';

// ui.js 는 DOM 을 쓰지만 peopleText 는 순수 함수다.
// 모듈을 불러오려면 document 가 있어야 하므로 최소한만 흉내낸다.
globalThis.document = { getElementById: () => null, createElement: () => ({}) };
const { peopleText } = await import('../src/ui.js');

// 0명일 때 아무것도 안 보여줬더니 "이 기능이 안 된다"는 말을 들었다.
// 요청받은 기능이 평소에 안 보이면 없는 것이나 마찬가지다.
test('0명이어도 문구가 나온다', () => {
  const t = peopleText(0, false);
  assert.ok(t.length > 0);
  assert.ok(t.includes('없습니다'));
});

test('음수가 들어와도 0명처럼 다룬다', () => {
  assert.equal(peopleText(-1, false), peopleText(0, false));
});

test('여러 명이면 숫자를 보여준다', () => {
  assert.ok(peopleText(12, false).includes('12명'));
  assert.ok(peopleText(12, false).includes('가는 중'));
});

test('나 혼자 가는 중이면 나임을 알려준다', () => {
  const t = peopleText(1, true);
  assert.ok(t.includes('1명'));
  assert.ok(t.includes('나'));
});

test('나 포함 여럿이면 나 포함이라고 알려준다', () => {
  const t = peopleText(5, true);
  assert.ok(t.includes('5명'));
  assert.ok(t.includes('나 포함'));
});

test('내가 아니면 나 이야기를 하지 않는다', () => {
  assert.ok(!peopleText(5, false).includes('나'));
});

test('숫자를 그대로 쓰지 소수점이 새지 않는다', () => {
  assert.ok(!peopleText(3, false).includes('.'));
});
