import test from 'node:test';
import assert from 'node:assert/strict';
import { getFastPosition, getAccuratePosition } from '../src/location.js';

// 브라우저 위치 기능을 흉내낸다.
// plan 은 정밀 여부에 따라 어떻게, 얼마나 늦게 답할지 적은 것이다.
function 위치기능(plan) {
  const 기록 = [];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition(onOk, onFail, options) {
          const 정밀 = !!options.enableHighAccuracy;
          기록.push({ 정밀, 제한시간: options.timeout, 캐시허용: options.maximumAge });
          const step = 정밀 ? plan.정밀 : plan.빠름;
          if (!step) return;
          setTimeout(() => {
            if (step.ok) onOk({ coords: { latitude: step.lat, longitude: step.lng } });
            else onFail({ code: step.code });
          }, step.지연 ?? 0);
        },
      },
    },
  });
  return 기록;
}

test.afterEach(() => { delete globalThis.navigator; });

// 하나씩 차례로 하면 앞의 것이 시간 초과될 때까지 뒤의 것이 시작도 못 한다.
test('두 방법을 동시에 물어본다', async () => {
  const 기록 = 위치기능({
    빠름: { ok: true, lat: 37.7, lng: 127.0, 지연: 30 },
    정밀: { ok: true, lat: 37.8, lng: 127.1, 지연: 30 },
  });
  await getFastPosition();
  assert.equal(기록.length, 2, '둘 다 곧바로 시작해야 한다');
  assert.ok(기록.some((r) => r.정밀 === false));
  assert.ok(기록.some((r) => r.정밀 === true));
});

test('먼저 답하는 쪽을 쓴다 — 기지국이 빠를 때', async () => {
  위치기능({
    빠름: { ok: true, lat: 37.7, lng: 127.0, 지연: 10 },
    정밀: { ok: true, lat: 37.8, lng: 127.1, 지연: 200 },
  });
  assert.equal((await getFastPosition()).lat, 37.7);
});

test('먼저 답하는 쪽을 쓴다 — GPS 가 빠를 때', async () => {
  위치기능({
    빠름: { ok: true, lat: 37.7, lng: 127.0, 지연: 200 },
    정밀: { ok: true, lat: 37.8, lng: 127.1, 지연: 10 },
  });
  assert.equal((await getFastPosition()).lat, 37.8);
});

// 한쪽이 실패해도 다른 쪽이 답하면 위치를 얻은 것이다.
test('한쪽이 실패해도 다른 쪽이 답하면 된다', async () => {
  위치기능({
    빠름: { ok: false, code: 3, 지연: 5 },
    정밀: { ok: true, lat: 37.8, lng: 127.1, 지연: 50 },
  });
  assert.equal((await getFastPosition()).lat, 37.8);
});

test('둘 다 실패하면 FAILED', async () => {
  위치기능({ 빠름: { ok: false, code: 3 }, 정밀: { ok: false, code: 2 } });
  await assert.rejects(getFastPosition(), /FAILED/);
});

test('권한을 거부했으면 DENIED', async () => {
  위치기능({ 빠름: { ok: false, code: 1 }, 정밀: { ok: false, code: 1 } });
  await assert.rejects(getFastPosition(), /DENIED/);
});

// 2초로 줄였더니 대부분 시간 초과로 실패해서 오히려 못 찾았다.
test('첫 위치에 넉넉한 시간을 준다', async () => {
  const 기록 = 위치기능({ 빠름: { ok: true, lat: 37.7, lng: 127.0 }, 정밀: { ok: false, code: 3 } });
  await getFastPosition();
  assert.ok(기록.every((r) => r.제한시간 >= 8_000), '8초 미만이면 폰에서 자주 실패한다');
});

test('최근에 잡아둔 위치를 쓸 수 있게 허용한다', async () => {
  const 기록 = 위치기능({ 빠름: { ok: true, lat: 37.7, lng: 127.0 }, 정밀: { ok: false, code: 3 } });
  await getFastPosition();
  assert.ok(기록.every((r) => r.캐시허용 > 0), '있으면 기다림 없이 즉시 답한다');
});

test('위치 기능이 없는 브라우저면 UNSUPPORTED', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  await assert.rejects(getFastPosition(), /UNSUPPORTED/);
});

// 정밀 위치는 첫 화면을 막지 않고 뒤에서 천천히 받는다.
test('정밀 위치는 GPS 만 쓰고 더 오래 기다린다', async () => {
  const 기록 = 위치기능({ 정밀: { ok: true, lat: 37.9, lng: 127.2 } });
  const pos = await getAccuratePosition();
  assert.equal(pos.lat, 37.9);
  assert.equal(기록.length, 1);
  assert.equal(기록[0].정밀, true);
  assert.ok(기록[0].제한시간 >= 15_000, '위성 신호는 실내에서 20초까지 걸린다');
});
