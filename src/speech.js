import { walkMinutes } from './geo.js';

const oneLine = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

export function buildSpeechText(shelter, movingCount = 0) {
  if (!shelter) {
    return '가까운 대피소를 찾지 못했습니다. 도움이 필요하면 119로 전화하세요.';
  }
  const minutes = walkMinutes(shelter.distance_m);
  const base = `가장 가까운 대피소는 ${oneLine(shelter.name)}, 걸어서 ${minutes}분입니다.`;
  return movingCount > 0 ? `${base} 지금 ${movingCount}명이 가고 있습니다.` : base;
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// 안드로이드에서는 목소리 목록이 늦게 채워진다.
// 비어 있으면 한 번 기다렸다가 다시 시도한다.
function waitForVoices(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (synth.getVoices().length > 0) {
      resolve();
      return;
    }
    const done = () => {
      synth.onvoiceschanged = null;
      resolve();
    };
    synth.onvoiceschanged = done;
    setTimeout(done, timeoutMs);
  });
}

// 읽어주기에 성공하면 true, 이 브라우저가 못 읽으면 false.
// 호출한 쪽은 false 일 때 글씨로 대신 보여줘야 한다.
export async function speak(text) {
  if (!isSpeechSupported()) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    await waitForVoices();

    const utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 0.9;

    const korean = synth.getVoices().find((v) => v.lang?.startsWith('ko'));
    if (korean) utter.voice = korean;

    let started = false;
    utter.onstart = () => { started = true; };
    synth.speak(utter);

    // 실제로 소리가 나기 시작했는지 확인한다.
    // 인앱 브라우저는 speak() 를 받아만 놓고 아무것도 안 하는 경우가 있다.
    await new Promise((r) => setTimeout(r, 600));
    return started || synth.speaking || synth.pending;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
