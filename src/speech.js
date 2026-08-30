import { walkMinutes } from './geo.js';

const oneLine = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

// isNearest 가 false 면 사용자가 목록에서 직접 고른 대피소다.
// 그때도 '가장 가까운'이라고 말하면 사실이 아닌 안내가 된다.
export function buildSpeechText(shelter, movingCount = 0, isNearest = true) {
  if (!shelter) {
    return '가까운 대피소를 찾지 못했습니다. 도움이 필요하면 119로 전화하세요.';
  }
  const minutes = walkMinutes(shelter.distance_m);
  const 머리말 = isNearest ? '가장 가까운 대피소는' : '선택하신 대피소는';
  const base = `${머리말} ${oneLine(shelter.name)}, 걸어서 ${minutes}분입니다.`;
  return movingCount > 0 ? `${base} 지금 ${movingCount}명이 가고 있습니다.` : base;
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// 안드로이드 음성 엔진은 처음 켤 때 3초 가까이 걸리기도 한다.
// 짧게 잡으면 될 것도 안 된다고 판단해 버린다.
const START_DEADLINE_MS = 3500;

// 읽어주기에 성공하면 true, 이 브라우저가 못 읽으면 false.
// 호출한 쪽은 false 일 때 글씨로 대신 보여줘야 한다.
//
// 두 가지를 지켜야 모바일에서 소리가 난다.
//
// 1. speak() 를 클릭 처리 안에서 '기다림 없이' 곧바로 호출해야 한다.
//    await 를 먼저 걸면 "사용자가 누른 순간"이라는 자격이 풀려서
//    브라우저가 재생을 거부한다. 그래서 이 함수는 async 가 아니다.
//
// 2. 성공 판정은 onstart 로만 한다.
//    인앱 브라우저는 speak() 를 접수만 해놓고 소리를 내지 않으면서
//    speaking/pending 은 true 로 만들어 둔다. 그걸 성공으로 치면
//    소리도 안 나고 대체 표시도 안 나오는 최악이 된다.
export function speak(text) {
  if (!isSpeechSupported()) return Promise.resolve(false);

  const synth = window.speechSynthesis;
  let utter;
  try {
    synth.cancel();
    utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 0.9;
  } catch {
    return Promise.resolve(false);
  }

  // 한국어 목소리를 고르는 것은 '있으면 좋은' 일이다.
  // 여기서 실패했다고 읽기 자체를 포기하면 안 된다. lang 만으로도 대개 읽는다.
  try {
    const korean = synth.getVoices().find((v) => v.lang?.startsWith('ko'));
    if (korean) utter.voice = korean;
  } catch {
    /* 무시 */
  }

  let started = false;
  let failed = false;
  utter.onstart = () => { started = true; };
  utter.onerror = () => { failed = true; };

  try {
    synth.speak(utter);
  } catch {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const step = 100;
    let waited = 0;
    const tick = () => {
      if (started) { resolve(true); return; }
      if (failed) { resolve(false); return; }
      waited += step;
      if (waited >= START_DEADLINE_MS) {
        try { synth.cancel(); } catch { /* 무시 */ }
        resolve(false);
        return;
      }
      setTimeout(tick, step);
    };
    setTimeout(tick, step);
  });
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
