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
