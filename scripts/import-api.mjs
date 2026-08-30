// 공공데이터포털 오픈API 로 대피소를 받아 data/raw/<종류>.csv 로 저장한다.
// 그다음은 CSV 방식과 완전히 같다. build-upload-csv.mjs 가 이어서 처리한다.
//
//   node --env-file=.env scripts/import-api.mjs --inspect earthquake
//       -> 실제 필드 이름과 첫 레코드를 보여준다 (매핑 전에 반드시 이걸 먼저)
//
//   node --env-file=.env scripts/import-api.mjs earthquake
//       -> 전체를 받아 data/raw/earthquake.csv 로 저장
//
// 필드 이름을 추측하지 않는다. 눈으로 확인하고 scripts/normalize.js 의
// FIELD_MAP 에 적은 뒤 본 수집을 돌린다.

import { writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.DATA_GO_KR_KEY;

// 종류별 엔드포인트. 실제 주소는 활용신청 후 상세 페이지에서 확인해 채운다.
const SOURCES = {
  earthquake: {
    label: '지진 옥외대피장소',
    url: 'https://apis.data.go.kr/1741000/EmergencyAssemblyArea_Earthquake4/getEmergencyAssemblyArea_Earthquake4List',
    pageParam: 'pageNo',
    sizeParam: 'numOfRows',
  },
  heat_cold: {
    label: '무더위쉼터',
    // 아직 모른다. 활용신청 상세 페이지의 '요청주소'를 보고 채우거나
    // 실행할 때 --url 로 넘긴다. 그럴듯한 주소를 미리 적어두면
    // 나중에 왜 안 되는지 찾느라 시간을 버린다.
    url: null,
    pageParam: 'pageNo',
    sizeParam: 'numOfRows',
  },
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 60;

function buildUrl(src, page) {
  const u = new URL(src.url);
  u.searchParams.set('serviceKey', KEY);
  u.searchParams.set(src.pageParam, String(page));
  u.searchParams.set(src.sizeParam, String(PAGE_SIZE));
  u.searchParams.set('type', 'json');
  u.searchParams.set('dataType', 'JSON');
  return u.toString();
}

// 공공데이터 API 는 기관마다 응답 껍데기가 제각각이다.
// 어느 깊이에 있든 "객체들의 배열"을 찾아낸다.
// 진짜 레코드는 값이 대부분 문자열/숫자다.
// { head: [...] } 처럼 값이 전부 배열인 것은 껍데기이지 레코드가 아니다.
function looksLikeRecord(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  return Object.values(x).some((v) => v === null || typeof v !== 'object');
}

// 응답 어딘가에 있는 '레코드 배열'을 찾는다.
//
// 기관마다 껍데기가 달라서 경로를 미리 정해둘 수 없다. 그렇다고 처음
// 만나는 배열을 집으면 { head: [{ totalCount: 2 }] } 같은 머리말을
// 데이터로 착각한다. 그래서 후보를 전부 모은 뒤 가장 긴 것을 고른다.
// 실제 데이터는 머리말보다 압도적으로 길다.
function collectCandidates(node, depth, out) {
  if (depth > 6 || node == null) return;

  if (Array.isArray(node)) {
    if (node.length > 0 && node.every(looksLikeRecord)) out.push(node);
    for (const item of node) collectCandidates(item, depth + 1, out);
    return;
  }

  if (typeof node !== 'object') return;
  for (const value of Object.values(node)) collectCandidates(value, depth + 1, out);
}

export function findRecords(node) {
  const found = [];
  collectCandidates(node, 0, found);
  if (found.length === 0) return null;
  return found.reduce((best, cur) => (cur.length > best.length ? cur : best));
}

async function fetchPage(src, page) {
  const res = await fetch(buildUrl(src, page));
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
  }
  // 키가 잘못되면 JSON 대신 XML 오류 문서가 온다.
  if (text.trimStart().startsWith('<')) {
    const msg = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/)?.[1]
      ?? text.match(/<errMsg>([^<]*)<\/errMsg>/)?.[1]
      ?? text.slice(0, 200);
    throw new Error(`XML 오류 응답 — ${msg}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`JSON 이 아님 — ${text.slice(0, 200)}`);
  }
  return findRecords(json) ?? [];
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const header = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(','));
  return `﻿${lines.join('\n')}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const inspect = args.includes('--inspect');
  const category = args.find((a) => !a.startsWith('--'));

  if (!KEY) {
    console.error('DATA_GO_KR_KEY 가 없습니다. .env 에 넣고 --env-file=.env 로 실행하세요.');
    process.exit(1);
  }
  const base = SOURCES[category];
  if (!base) {
    console.error(`쓸 수 있는 종류: ${Object.keys(SOURCES).join(', ')}`);
    process.exit(1);
  }

  // --url 로 엔드포인트를 덮어쓸 수 있다. 주소를 모를 때 바로 시험해 본다.
  const override = args.find((a) => a.startsWith('--url='))?.slice(6);
  const src = { ...base, url: override ?? base.url };
  if (!src.url) {
    console.error(`${base.label} 의 API 주소를 모릅니다.`);
    console.error('활용신청 상세 페이지의 요청주소를 --url=... 로 넘기세요.');
    process.exit(1);
  }

  console.log(`${src.label} (${category})`);

  if (inspect) {
    const rows = await fetchPage(src, 1);
    console.log(`첫 페이지 ${rows.length}건\n`);
    if (rows.length === 0) {
      console.log('레코드가 없습니다. 엔드포인트 주소를 확인하세요.');
      return;
    }
    console.log('=== 필드 이름 ===');
    for (const k of Object.keys(rows[0])) console.log(`  ${k}`);
    console.log('\n=== 첫 레코드 ===');
    for (const [k, v] of Object.entries(rows[0])) {
      if (String(v ?? '').trim()) console.log(`  ${k.padEnd(24)} = ${String(v).slice(0, 60)}`);
    }
    return;
  }

  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const rows = await fetchPage(src, page);
    if (rows.length === 0) break;
    all.push(...rows);
    console.log(`  ${page}쪽: ${rows.length}건 (누적 ${all.length})`);
    if (rows.length < PAGE_SIZE) break;
  }

  if (all.length === 0) {
    console.error('한 건도 받지 못했습니다.');
    process.exit(1);
  }

  mkdirSync('data/raw', { recursive: true });
  const out = `data/raw/${category}.csv`;
  writeFileSync(out, toCsv(all), 'utf-8');
  console.log(`\n${all.length}건 → ${out}`);
  console.log('다음: node scripts/build-upload-csv.mjs');
}

// 테스트가 이 파일을 불러올 때는 수집이 돌면 안 된다.
if (process.argv[1] && process.argv[1].endsWith('import-api.mjs')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
