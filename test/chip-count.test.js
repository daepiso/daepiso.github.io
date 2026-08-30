import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { getElementById: () => null, createElement: () => ({}) };
const { chipCountText } = await import('../src/ui.js');

// 아직 세어보지 않았는데 '없음'이라고 하면 거짓말이 된다.
// 데이터가 늦게 오는 사이에 어르신이 그 종류를 포기해버릴 수 있다.
test('아직 모를 때는 아무 말도 하지 않는다', () => {
  assert.equal(chipCountText(null), '');
  assert.equal(chipCountText(undefined), '');
});

test('있으면 몇 곳인지 말한다', () => {
  assert.equal(chipCountText(1), '1곳');
  assert.equal(chipCountText(50), '50곳');
});

// 눌러도 헛일인 종류를 미리 알려준다.
test('0곳이면 없음이라고 말한다', () => {
  assert.equal(chipCountText(0), '없음');
});

test('0곳을 0곳이라고 쓰지 않는다', () => {
  assert.ok(!chipCountText(0).includes('0'));
});
