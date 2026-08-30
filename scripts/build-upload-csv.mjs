// data/raw 의 공공데이터 CSV 원본을 읽어
// Supabase shelters 테이블에 그대로 올릴 수 있는 CSV 한 장으로 만든다.
//
// 실행: node scripts/build-upload-csv.mjs
// 결과: data/shelters_upload.csv
//
// service_role 키가 필요 없다. 만들어진 파일을 Supabase 화면에서 끌어다 놓으면 된다.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { normalizeRow, isValidRow, isOperating, dedupe } from './normalize.js';

const RAW_DIR = 'data/raw';
const OUT = 'data/shelters_upload.csv';

// 파일 이름의 일부로 종류를 판별한다. 내려받은 이름 그대로 넣어도 잡히도록 넉넉히.
const FILE_HINTS = [
  { category: 'civil_defense', match: /civil_defense|민방위/i },
  { category: 'earthquake', match: /earthquake|지진/i },
  { category: 'heat_cold', match: /heat|cold|무더위|한파|쉼터/i },
  { category: 'temp_housing', match: /temp_housing|이재민|임시주거|주거/i },
];

// 공공데이터 CSV 는 대개 CP949 로 내려온다.
// Node 의 TextDecoder 는 'cp949' 라벨을 모르고 'euc-kr' 만 안다.
// 게다가 CP949 확장 문자가 섞여 있어 fatal 모드 euc-kr 로는 통째로 실패한다.
// 그래서 UTF-8 을 먼저 엄격하게 시도하고, 아니면 euc-kr 을 관대한 모드로 읽는다.
function decode(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('euc-kr').decode(buf).replace(/^﻿/, '');
  }
}

// 따옴표 안의 쉼표와 줄바꿈을 지키는 CSV 파서
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(rows) {
  const header = rows[0].map((h) => h.replace(/^﻿/, '').trim());
  return rows.slice(1)
    .filter((r) => r.length >= header.length - 2 && r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function main() {
  if (!existsSync(RAW_DIR)) {
    console.error(`${RAW_DIR} 폴더가 없습니다.`);
    process.exit(1);
  }

  const files = readdirSync(RAW_DIR).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (files.length === 0) {
    console.error(`${RAW_DIR} 에 CSV 파일이 없습니다.`);
    process.exit(1);
  }

  const all = [];
  const report = [];

  for (const file of files) {
    const hint = FILE_HINTS.find((h) => h.match.test(file));
    if (!hint) {
      report.push(`  ? ${file} — 종류를 알 수 없어 건너뜁니다`);
      continue;
    }

    const text = decode(readFileSync(`${RAW_DIR}/${file}`));
    const objects = toObjects(parseCsv(text));

    let normalized;
    try {
      normalized = objects.map((o) => normalizeRow(hint.category, o));
    } catch (err) {
      report.push(`  ! ${file} — ${err.message}`);
      continue;
    }

    const operating = normalized.filter(isOperating);
    const valid = operating.filter(isValidRow);
    all.push(...valid);

    report.push(
      `  ${hint.category.padEnd(14)} ${file}\n` +
      `      원본 ${objects.length} → 운영중 ${operating.length} → 좌표유효 ${valid.length}`,
    );
  }

  const rows = dedupe(all);

  const header = ['ext_id', 'category', 'name', 'address', 'lat', 'lng', 'capacity', 'detail', 'tel'];
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(','));
  writeFileSync(OUT, `﻿${lines.join('\n')}\n`, 'utf-8');

  console.log('처리한 파일');
  console.log(report.join('\n'));
  console.log('');
  console.log(`중복 제거 후 ${rows.length}건 → ${OUT}`);

  const byCategory = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  console.log('');
  console.log('종류별 건수');
  for (const [k, v] of Object.entries(byCategory)) console.log(`  ${k.padEnd(14)} ${v}`);
}

main();
