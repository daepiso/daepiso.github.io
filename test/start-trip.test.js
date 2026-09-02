import test from 'node:test';
import assert from 'node:assert/strict';

// 길찾기를 누르면 곧바로 카카오맵으로 넘어간다. 그 전에 서버 응답을
// 기다리면 모바일 브라우저가 '사용자가 누른 순간'이 아니라고 보고
// 앱 열기를 막는다. 그러면 '연결중입니다' 화면에 갇힌 채 설치 안내만 뜬다.
//
// 회성 님이 실제로 겪으신 증상이다. 처음 한 번은 되고, 다시 들어와
// 다른 곳을 눌렀을 때부터 안 됐다. 두 번째 start_trip 은 이미 가는 중인
// 기록을 취소하는 일이 하나 더 붙어 더 느리기 때문이다.

function 폰흉내(응답 = { ok: true, status: 200 }) {
  const 부른것 = [];
  globalThis.fetch = (url, opts) => {
    부른것.push({ url: String(url), opts });
    return Promise.resolve({ ...응답, text: () => Promise.resolve('') });
  };
  globalThis.localStorage = {
    _: {},
    getItem(k) { return k in this._ ? this._[k] : null; },
    setItem(k, v) { this._[k] = String(v); },
    removeItem(k) { delete this._[k]; },
  };
  globalThis.crypto ??= { randomUUID: () => '11111111-2222-3333-4444-555555555555' };
  return 부른것;
}

// startTrip 은 심장박동 타이머를 건다. 정리하지 않으면 시험이 끝나도
// Node 가 종료하지 못하고 매달려 있는다.
test.afterEach(async () => {
  const { endTrip } = await import('../src/trips.js');
  await endTrip('cancelled').catch(() => {});
  delete globalThis.fetch;
  delete globalThis.localStorage;
});

test('기다리지 않고 곧바로 서버에 보낸다', async () => {
  const 부른것 = 폰흉내();
  const { startTrip } = await import('../src/trips.js');

  // await 없이 부른다. 돌아온 직후에 이미 요청이 나가 있어야 한다.
  const 약속 = startTrip('대피소-1');
  assert.equal(부른것.length, 1, '되돌아오기 전에 이미 보냈어야 한다');
  assert.match(부른것[0].url, /start_trip$/);

  await 약속.catch(() => {});
});

// 페이지가 카카오맵으로 넘어가면 보통 fetch 는 취소된다.
// keepalive 를 붙여야 페이지가 사라져도 요청이 끝까지 간다.
test('페이지가 사라져도 요청이 끝까지 가게 한다', async () => {
  const 부른것 = 폰흉내();
  const { startTrip } = await import('../src/trips.js');
  await startTrip('대피소-1').catch(() => {});
  assert.equal(부른것[0].opts.keepalive, true, 'keepalive 가 없으면 기록이 새어나간다');
});

test('어느 대피소로 가는지 함께 보낸다', async () => {
  const 부른것 = 폰흉내();
  const { startTrip } = await import('../src/trips.js');
  await startTrip('대피소-7').catch(() => {});
  const 본문 = JSON.parse(부른것[0].opts.body);
  assert.equal(본문.p_shelter_id, '대피소-7');
  assert.ok(본문.p_device_id, '기기 번호가 있어야 누가 가는지 셀 수 있다');
});

// 서버 기록이 실패해도 길찾기는 열려야 한다. 던지되, 부르는 쪽이
// 기다리지 않으므로 길찾기를 막지 않는다.
test('서버가 실패하면 알려주되 조용히 끝난다', async () => {
  폰흉내({ ok: false, status: 500 });
  const { startTrip } = await import('../src/trips.js');
  await assert.rejects(startTrip('대피소-1'), /기록/);
});
