// npm run e2e: every end-to-end suite in turn, sharing one client build.
//
//   node tests/e2e/run.mjs              all suites
//   node tests/e2e/run.mjs match voice  only these
//
// Suites run as child processes (each starts its own server and browsers on
// random ports 40000-49999) and their output streams through. Exit code 0 only
// if every suite passed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SUITES = {
  match: { what: 'a whole match in two real browsers', cmd: ['npx', 'tsx', 'tests/e2e/match.e2e.ts'] },
  voice: { what: 'voice mesh and hearing rules (4 pages, fake mics)', cmd: ['node', 'tests/e2e/voice/run.mjs'] },
  'lobby-voice': { what: 'three players in one real lobby', cmd: ['npx', 'tsx', 'tests/e2e/lobby-voice.ts'] },
};

const asked = process.argv.slice(2);
const unknown = asked.filter((s) => !(s in SUITES));
if (unknown.length) {
  console.error(`unknown suite(s): ${unknown.join(', ')}; choose from ${Object.keys(SUITES).join(', ')}`);
  process.exit(2);
}
const names = asked.length ? asked : Object.keys(SUITES);

// One client build for every suite that serves the game.
const clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inh-e2e-client-'));
console.log('building the client once for all suites...');
const built = spawnSync('npx', ['vite', 'build', '--outDir', clientDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: repo, stdio: 'inherit' });
if (built.status !== 0) {
  console.error('client build failed');
  process.exit(1);
}

const results = [];
for (const name of names) {
  const s = SUITES[name];
  console.log(`\n━━ ${name}: ${s.what} ━━`);
  const t0 = Date.now();
  const r = spawnSync(s.cmd[0], s.cmd.slice(1), { cwd: repo, stdio: 'inherit', env: { ...process.env, E2E_CLIENT_DIR: clientDir }, timeout: 30 * 60 * 1000 });
  results.push({ name, ok: r.status === 0, secs: Math.round((Date.now() - t0) / 1000), why: r.error ? String(r.error) : r.signal ? `killed (${r.signal})` : `exit ${r.status}` });
}
fs.rmSync(clientDir, { recursive: true, force: true });

console.log('\n━━ e2e summary ━━');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(12)} ${String(r.secs).padStart(4)} s${r.ok ? '' : `  (${r.why})`}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
