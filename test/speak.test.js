import test from 'node:test';
import assert from 'node:assert/strict';
import { speak, isSpeechSupported } from '../src/speech.js';

// 브라우저 흉내. speak() 는 window 를 호출 시점에 읽으므로
// 테스트마다 갈아끼우면 된다.
function 브라우저(synth) {
  globalThis.window = {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.onstart = null;
        this.onerror = null;
      }
    },
  };
}

function 브라우저없음() {
  globalThis.window = {};
}

const 기본 = {
  cancel() {},
  getVoices() { return []; },
  speaking: false,
  pending: false,
};

test.afterEach(() => { delete globalThis.window; });

test('isSpeechSupported: speechSynthesis 가 없으면 false', () => {
  브라우저없음();
  assert.equal(isSpeechSupported(), false);
});

test('소리를 실제로 내기 시작하면 true', async () => {
  브라우저({ ...기본, speak(u) { setTimeout(() => u.onstart(), 20); } });
  assert.equal(await speak('테스트'), true);
});

test('speechSynthesis 자체가 없으면 false', async () => {
  브라우저없음();
  assert.equal(await speak('테스트'), false);
});

test('오류가 나면 false', async () => {
  브라우저({ ...기본, speak(u) { setTimeout(() => u.onerror(), 20); } });
  assert.equal(await speak('테스트'), false);
});

// 카카오톡·인스타 등 앱 안에서 열린 브라우저의 실제 행동.
// speak() 를 받아만 놓고 소리는 내지 않으면서 speaking/pending 은 true 로 둔다.
// 이걸 성공으로 판정하면 소리도 안 나고 대체 표시도 안 나오는 최악이 된다.
test('접수만 하고 소리를 안 내면 false (인앱 브라우저)', async () => {
  브라우저({ ...기본, speak() {}, speaking: true, pending: true });
  assert.equal(await speak('테스트'), false);
});

test('cancel 이 터져도 던지지 않고 false', async () => {
  브라우저({ ...기본, cancel() { throw new Error('boom'); }, speak() {} });
  assert.equal(await speak('테스트'), false);
});

// 목소리 지정은 '있으면 좋은' 일이다. 여기서 실패했다고 읽기를 포기하면
// 소리가 날 수 있는 브라우저에서도 소리가 안 난다.
test('목소리 지정이 실패해도 읽기는 계속한다', async () => {
  브라우저({
    ...기본,
    getVoices() { return [{ lang: 'ko-KR' }]; },
    speak(u) { setTimeout(() => u.onstart(), 20); },
  });
  const utterProto = globalThis.window.SpeechSynthesisUtterance.prototype;
  Object.defineProperty(utterProto, 'voice', {
    set() { throw new TypeError('SpeechSynthesisVoice 가 아님'); },
    configurable: true,
  });
  assert.equal(await speak('테스트'), true);
});

test('한국어로 읽도록 지정한다', async () => {
  let 받은것 = null;
  브라우저({ ...기본, speak(u) { 받은것 = u; setTimeout(() => u.onstart(), 20); } });
  await speak('가장 가까운 대피소는');
  assert.equal(받은것.lang, 'ko-KR');
  assert.equal(받은것.text, '가장 가까운 대피소는');
  assert.ok(받은것.rate < 1, '어르신을 위해 조금 천천히 읽어야 한다');
});
