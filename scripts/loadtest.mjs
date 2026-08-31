// 서버가 동시에 몇 사람까지 견디는지 실제로 재본다.
//
// 실행: node scripts/loadtest.mjs
//
// 추측하지 않는다. 동시 요청 수를 늘려가며 응답 시간과 실패율을 잰다.
// 무료 요금제의 통신량을 축내지 않도록 요청 수는 적게 잡는다.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js';

// 의정부, 서울, 부산. 한 곳만 두드리면 캐시 덕을 봐 실제보다 좋게 나온다.
const 지점들 = [
  { lat: 37.7386, lng: 127.0455 },
  { lat: 37.5663, lng: 126.9779 },
  { lat: 35.1490, lng: 129.0495 },
];

async function 한번(i) {
  const p = 지점들[i % 지점들.length];
  const t = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nearby_shelters`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_lat: p.lat, p_lng: p.lng, p_radius_m: 3000,
        p_categories: ['civil_defense'],
      }),
    });
    const text = await res.text();
    return { ok: res.ok && text.startsWith('['), ms: Date.now() - t, status: res.status };
  } catch (err) {
    return { ok: false, ms: Date.now() - t, status: err.message.slice(0, 30) };
  }
}

function 통계(결과들) {
  const 성공 = 결과들.filter((r) => r.ok);
  const ms = 성공.map((r) => r.ms).sort((a, b) => a - b);
  const 백분위 = (p) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] : 0);
  return {
    성공: 성공.length,
    실패: 결과들.length - 성공.length,
    중앙값: 백분위(0.5),
    느린쪽: 백분위(0.95),
    최대: ms.length ? ms[ms.length - 1] : 0,
  };
}

async function 단계(동시) {
  const 시작 = Date.now();
  const 결과 = await Promise.all(Array.from({ length: 동시 }, (_, i) => 한번(i)));
  const 걸린초 = (Date.now() - 시작) / 1000;
  const s = 통계(결과);
  const 초당 = (s.성공 / 걸린초).toFixed(1);
  const 실패표시 = s.실패 > 0 ? `  실패 ${s.실패}건` : '';
  console.log(
    `  동시 ${String(동시).padStart(3)}건  `
    + `중앙 ${String(s.중앙값).padStart(5)}ms  `
    + `느린쪽 ${String(s.느린쪽).padStart(5)}ms  `
    + `최대 ${String(s.최대).padStart(5)}ms  `
    + `초당 ${초당}건${실패표시}`,
  );
  return s;
}

async function main() {
  console.log('서버가 동시 요청을 얼마나 견디는지 잽니다.');
  console.log('요청 1건 = 사용자 한 사람이 앱을 열고 대피소를 찾는 것.\n');

  for (const n of [1, 10, 40, 80, 150, 300]) {
    await 단계(n);
    await new Promise((r) => setTimeout(r, 1500)); // 서버를 몰아붙이지 않는다
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
