// 서버를 깨우고, 앱이 실제로 쓸 수 있는 상태인지 확인한다.
//
// 실행: node scripts/healthcheck.mjs
//
// 왜 필요한가.
// Supabase 무료 요금제는 1주일 동안 아무도 쓰지 않으면 프로젝트를 멈춘다.
// 재난 앱은 평소에 아무도 쓰지 않는다. 그래서 정작 재난이 났을 때
// 서버가 멈춰 있을 수 있다. 매일 한 번 두드려 깨워 둔다.
//
// 깨우는 김에 건강검진도 한다. 대피소가 사라졌거나 조회가 깨졌으면
// 재난이 나기 전에 알아야 한다. 문제가 있으면 0이 아닌 값으로 끝내
// GitHub 이 메일로 알려주게 한다.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js';

// 서울시청. 어느 방향으로든 대피소가 반드시 있어야 하는 곳이다.
const 서울시청 = { lat: 37.5663, lng: 126.9779 };
const RADIUS_M = 3000;

async function rpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} — ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name}: 응답이 JSON 이 아님 — ${text.slice(0, 200)}`);
  }
}

const 문제 = [];

async function main() {
  console.log(`서버: ${SUPABASE_URL}`);
  console.log(`기준점: 서울시청 반경 ${RADIUS_M / 1000}km\n`);

  // 1) 대피소를 찾을 수 있는가. 이게 안 되면 앱의 존재 이유가 없다.
  const shelters = await rpc('nearby_shelters', {
    p_lat: 서울시청.lat,
    p_lng: 서울시청.lng,
    p_radius_m: RADIUS_M,
    p_categories: ['civil_defense', 'earthquake', 'heat_cold', 'temp_housing'],
  });

  if (!Array.isArray(shelters) || shelters.length === 0) {
    문제.push('서울시청 반경 3km 에 대피소가 하나도 없다. 데이터가 사라졌을 수 있다.');
  } else {
    const 첫째 = shelters[0];
    console.log(`대피소 조회: ${shelters.length}건`);
    console.log(`  가장 가까운 곳: ${첫째.name} (${첫째.distance_m}m)`);

    if (!첫째.name || !첫째.address) 문제.push('대피소에 이름이나 주소가 비어 있다.');
    if (!(첫째.lat > 33 && 첫째.lat < 39)) 문제.push(`좌표가 한국 밖이다: ${첫째.lat}`);
  }

  // 2) 종류별 개수. 칩에 쓰인다.
  const counts = await rpc('nearby_counts', {
    p_lat: 서울시청.lat,
    p_lng: 서울시청.lng,
    p_radius_m: RADIUS_M,
  });
  console.log('\n종류별 개수:');
  for (const row of counts) console.log(`  ${row.category.padEnd(14)} ${row.n}곳`);

  // 3) 인원 집계가 살아 있는가. 죽어도 앱은 돌지만 알고는 있어야 한다.
  const live = await rpc('shelter_counts', { p_shelter_ids: [] });
  if (!Array.isArray(live)) 문제.push('인원 집계 조회가 배열을 돌려주지 않았다.');
  else console.log('\n인원 집계: 정상');

  if (문제.length > 0) {
    console.error('\n문제가 있습니다:');
    for (const m of 문제) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log('\n모두 정상. 서버가 깨어 있습니다.');
}

main().catch((err) => {
  console.error(`\n서버 확인 실패: ${err.message}`);
  process.exit(1);
});
