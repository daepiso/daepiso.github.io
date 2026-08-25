// 카카오톡·인스타그램 등 앱 안에서 열린 브라우저는 음성 기능이 막혀 있다.
// 사용자가 메뉴를 뒤지지 않고 버튼 하나로 진짜 브라우저를 열 수 있게 한다.

export function isInAppBrowser(ua = globalThis.navigator?.userAgent ?? '') {
  return /KAKAOTALK|Instagram|FB_IAB|FBAN|FBAV|NAVER\(inapp|Line\//i.test(ua);
}

export function isAndroid(ua = globalThis.navigator?.userAgent ?? '') {
  return /Android/i.test(ua);
}

export function isIOS(ua = globalThis.navigator?.userAgent ?? '') {
  return /iPhone|iPad|iPod/i.test(ua);
}

// 지금 주소를 바깥 브라우저에서 여는 주소를 만든다.
// 안드로이드는 intent 스킴으로 크롬을 직접 지정할 수 있다.
// iOS 는 크롬이 깔려 있을 때만 googlechrome 스킴이 동작한다.
export function buildExternalUrl(href, ua = globalThis.navigator?.userAgent ?? '') {
  let url;
  try {
    url = new URL(href);
  } catch {
    return href;
  }

  const withoutScheme = `${url.host}${url.pathname}${url.search}`;

  if (isAndroid(ua)) {
    return `intent://${withoutScheme}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`;
  }
  if (isIOS(ua)) {
    return `googlechrome://${withoutScheme}`;
  }
  return href;
}

export function openExternally(href = globalThis.location?.href ?? '') {
  globalThis.location.href = buildExternalUrl(href);
}
