import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentPosition } from '../src/location.js';

// 브라우저 위치 기능을 흉내낸다.
// plan 은 호출 순서대로 어떻게 답할지 적은 것이다.
function 위치기능(plan) {
  const 기록 = [];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition(onOk, onFail, options) {
          기록.push({ 정밀: options.enableHighAccuracy, 제한시간: options.timeout });
          const step = plan[기록.length - 1];
          if (!step) { onFail({ code: 3 }); return; }
          if (step.ok) {
            onOk({ coords: { latitude: step.lat, longitude: step.lng } });
          } else {
            onFail({ code: step.code });
          }
        },
      },
    },
  });
  return 기록;
}

test.afterEach(() => { delete globalThis.navigator; });

// GPS 정밀 측위는 실내에서 20~30초가 걸리거나 실패한다.
// 빠른 방식을 먼저 써야 어르신이 기다리지 않는다.
test('빠른 방식을 먼저 시도한다', async () => {
  const 기록 = 위치기능([{ ok: true, lat: 37.7386, lng: 127.0455 }]);
  const pos = await getCurrentPosition();
  assert.equal(pos.lat, 37.7386);
  assert.equal(기록.length, 1);
  assert.equal(기록[0].정밀, false, '첫 시도는 빠른 방식이어야 한다');
});

test('빠른 방식이 실패하면 GPS 로 다시 시도한다', async () => {
  const 기록 = 위치기능([
    { ok: false, code: 3 },                        // 시간 초과
    { ok: true, lat: 37.5, lng: 127.0 },
  ]);
  const pos = await getCurrentPosition();
  assert.equal(pos.lat, 37.5);
  assert.equal(기록.length, 2);
  assert.equal(기록[1].정밀, true, '두 번째는 GPS 정밀 측위여야 한다');
  assert.ok(기록[1].제한시간 > 기록[0].제한시간, 'GPS 는 더 오래 기다려야 한다');
});

// 권한을 거부했으면 두 번 물어봐야 소용없다. 곧바로 알린다.
test('권한 거부는 곧바로 알리고 다시 묻지 않는다', async () => {
  const 기록 = 위치기능([{ ok: false, code: 1 }]);
  await assert.rejects(getCurrentPosition(), /DENIED/);
  assert.equal(기록.length, 1);
});

test('두 번 다 실패하면 FAILED', async () => {
  const 기록 = 위치기능([{ ok: false, code: 3 }, { ok: false, code: 2 }]);
  await assert.rejects(getCurrentPosition(), /FAILED/);
  assert.equal(기록.length, 2);
});

test('두 번째에서 거부하면 DENIED', async () => {
  위치기능([{ ok: false, code: 3 }, { ok: false, code: 1 }]);
  await assert.rejects(getCurrentPosition(), /DENIED/);
});

test('위치 기능이 없는 브라우저면 UNSUPPORTED', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  await assert.rejects(getCurrentPosition(), /UNSUPPORTED/);
});
