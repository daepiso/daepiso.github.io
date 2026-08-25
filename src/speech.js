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

export function speak(text) {
  if (!isSpeechSupported()) return false;
  window.speechSynthesis.cancel();
  const utter = new window.SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
