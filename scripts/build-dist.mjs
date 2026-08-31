// 인터넷에 올릴 파일만 dist/ 로 모은다.
//
// 실행: npm run build
//
// 원본 CSV, .env, node_modules, git 기록 등은 올라가면 안 되므로
// "필요한 것만 골라 담는" 방식으로 만든다. 제외 목록 방식은 실수하기 쉽다.

import {
  mkdirSync, rmSync, copyFileSync, readdirSync, existsSync, statSync,
  readFileSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const OUT = 'dist';

const FILES = ['index.html', 'style.css', '.nojekyll'];
const DIRS = ['src'];

// src 안에서도 이건 빼야 한다. 예시 파일이라 배포할 이유가 없다.
const SKIP = new Set(['config.example.js']);

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (SKIP.has(entry)) continue;
    const src = join(from, entry);
    const dst = join(to, entry);
    if (statSync(src).isDirectory()) copyDir(src, dst);
    else copyFileSync(src, dst);
  }
}

// 브라우저는 같은 주소의 파일을 한동안 재사용한다.
// 그러면 앱을 고쳐도 사용자는 옛 화면을 계속 본다.
// 재난 상황에 쓰는 앱에서는 위험하므로, 배포마다 주소 뒤에 버전을 붙인다.
function version() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return String(Math.floor(Date.now() / 1000));
  }
}

function stampVersion(htmlPath, v) {
  const html = readFileSync(htmlPath, 'utf-8')
    .replace(/(href="\.\/style\.css)"/, `$1?v=${v}"`)
    .replace(/(src="\.\/src\/main\.js)"/, `$1?v=${v}"`);
  writeFileSync(htmlPath, html, 'utf-8');
  console.log(`버전 ${v} 를 붙였습니다.`);
}

// main.js 만 새 주소여도 그 안에서 불러오는 location.js 같은 모듈은
// 예전 주소 그대로라 브라우저 캐시가 섞일 수 있다. 모든 상대 모듈
// import 에 같은 버전을 붙여 한 배포의 파일끼리만 함께 쓰이게 한다.
function stampModuleImports(dir, v) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      stampModuleImports(path, v);
      continue;
    }
    if (!entry.endsWith('.js')) continue;
    const source = readFileSync(path, 'utf-8');
    const stamped = source.replace(
      /((?:from\s+|import\s*\(\s*)['"])(\.\.?\/[^'"]+\.js)(['"])/g,
      `$1$2?v=${v}$3`,
    );
    writeFileSync(path, stamped, 'utf-8');
  }
}

function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  for (const f of FILES) {
    if (!existsSync(f)) throw new Error(`${f} 가 없습니다.`);
    copyFileSync(f, join(OUT, f));
  }
  for (const d of DIRS) copyDir(d, join(OUT, d));

  if (!existsSync(join(OUT, 'src', 'config.js'))) {
    throw new Error('src/config.js 가 없습니다. config.example.js 를 복사해 키를 채우세요.');
  }

  const v = version();
  stampVersion(join(OUT, 'index.html'), v);
  stampModuleImports(join(OUT, 'src'), v);

  let count = 0;
  let bytes = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else { count += 1; bytes += statSync(p).size; }
    }
  };
  walk(OUT);

  console.log(`${OUT}/ 준비 완료 — 파일 ${count}개, ${(bytes / 1024).toFixed(1)}KB`);
  console.log('이 폴더를 통째로 올리면 됩니다.');
}

main();
