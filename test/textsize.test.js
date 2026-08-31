import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSize, sizeLabel, readSize, saveSize, applySize, SIZES } from '../src/textsize.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('세 단계를 돌아가며 고른다', () => {
  assert.equal(nextSize('m'), 'l');
  assert.equal(nextSize('l'), 'xl');
  assert.equal(nextSize('xl'), 'm', '끝에서 처음으로 돌아와야 계속 누를 수 있다');
});

test('모르는 값이 들어와도 멈추지 않는다', () => {
  assert.ok(SIZES.some((s) => s.key === nextSize('없는값')));
});

// '가'만 있으면 눌러도 뭐가 바뀌었는지 알기 어렵다.
test('단계마다 이름이 있다', () => {
  assert.equal(sizeLabel('m'), '보통');
  assert.equal(sizeLabel('l'), '크게');
  assert.equal(sizeLabel('xl'), '아주 크게');
  assert.equal(sizeLabel('없는값'), '보통');
});

test('고른 크기를 기억했다 다시 꺼낸다', () => {
  const s = fakeStorage();
  saveSize('xl', s);
  assert.equal(readSize(s), 'xl');
});

test('기억한 게 없으면 보통', () => {
  assert.equal(readSize(fakeStorage()), 'm');
});

test('저장된 값이 이상하면 보통으로 되돌린다', () => {
  assert.equal(readSize(fakeStorage({ 'shelter.textSize': '엉뚱한값' })), 'm');
});

test('저장 공간이 막혀도 던지지 않는다', () => {
  const broken = { getItem: () => { throw new Error('막힘'); }, setItem: () => { throw new Error('막힘'); } };
  assert.doesNotThrow(() => saveSize('l', broken));
  assert.equal(readSize(broken), 'm');
});

test('applySize: 단계에 맞는 표시만 남긴다', () => {
  const classes = new Set();
  const body = {
    classList: {
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      add: (c) => classes.add(c),
    },
  };
  applySize('l', body);
  assert.deepEqual([...classes], ['text-l']);
  applySize('xl', body);
  assert.deepEqual([...classes], ['text-xl'], '이전 표시는 지워져야 한다');
  applySize('m', body);
  assert.deepEqual([...classes], [], '보통이면 아무 표시도 없다');
});

test('applySize: 화면이 없어도 던지지 않는다', () => {
  assert.doesNotThrow(() => applySize('l', null));
});
