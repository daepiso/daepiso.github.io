function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function buildMapLink(shelter) {
  const name = encodeURIComponent(oneLine(shelter.name));
  return `https://map.kakao.com/link/map/${name},${shelter.lat},${shelter.lng}`;
}

export function buildSmsBody(shelter) {
  return `저는 ${oneLine(shelter.name)} 대피소로 갑니다.\n${buildMapLink(shelter)}`;
}

export function buildSmsHref(shelter) {
  return `sms:?body=${encodeURIComponent(buildSmsBody(shelter))}`;
}

// 문자 앱을 본문이 채워진 채로 연다. 보내기는 사용자가 직접 누른다.
// 발송 비용이 들지 않고, 별도 가입도 필요 없다.
export function openSmsApp(shelter) {
  window.location.href = buildSmsHref(shelter);
}
