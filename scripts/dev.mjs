// Runs the game server (tsx watch) and the Vite client dev server together.
import { spawn } from 'node:child_process';
const procs = [
  spawn('npx', ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit', shell: true }),
  spawn('npx', ['vite'], { stdio: 'inherit', shell: true }),
];
const stop = () => { for (const p of procs) p.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
