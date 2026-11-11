// The game server: HTTP (health check + the built client from dist/client)
// and the WebSocket endpoint at /ws. PORT env (default 3000).
// INHERITANCE_FAST=1 shortens every phase (for end-to-end tests);
// INHERITANCE_VISIT_SECONDS=<n> then sets the visit length.
// TRUST_PROXY=1 (or the number of proxy hops) behind a reverse proxy or tunnel:
// per-address limits then use X-Forwarded-For (see server/limits.ts).
// INHERITANCE_NETSIM=<rtt ms>,<jitter ms>,<loss %> (e.g. 150,20,2) delays every
// connection as a slow, lossy network would (testing only; see shared/netsim.ts).
// INHERITANCE_METRICS=<file> sets where playtest records go, one JSON line per
// finished match and per survey answer (default data/playtests.jsonl; "off" = none).
import { existsSync, statSync, createReadStream } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { TICK_HZ } from '../shared/constants.js';
import { NetLink, parseNetSim, type NetSimConfig } from '../shared/netsim.js';
import { CLOSE_CODES, type ServerMsg } from '../shared/protocol.js';
import { clientAddress, limitsWith, trustProxyHops, type Limits } from './limits.js';
import { RoomManager, type Session } from './room.js';
import { MAX_FRAME_BYTES } from './validate.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  fast?: boolean;
  /** With `fast`: visit length in seconds (default 40). */
  visitSeconds?: number;
  /** Test-only: bots sit still. */
  botsIdle?: boolean;
  /** Directory with the built client (default: dist/client next to the repo root). */
  staticDir?: string;
  quiet?: boolean;
  seed?: number;
  /** Proxy hops in front of the server whose X-Forwarded-For entries are trusted (TRUST_PROXY). Default 0. */
  trustProxy?: number;
  /** Override some abuse limits (tests); the rest come from LIMITS in server/limits.ts. */
  limits?: Partial<Limits>;
  /** Simulate a slow, lossy network on every connection, both ways (INHERITANCE_NETSIM). */
  netsim?: NetSimConfig;
  /** Append playtest records to this JSON-lines file (INHERITANCE_METRICS). Off when unset. */
  metricsFile?: string;
}

/** A sink that appends each record as one JSON line, in order, creating the folder first. */
export function jsonLines(file: string, log: (m: string) => void): (line: Record<string, unknown>) => void {
  let chain: Promise<unknown> = mkdir(path.dirname(path.resolve(file)), { recursive: true });
  return (line) => {
    const text = `${JSON.stringify(line)}\n`;
    chain = chain.then(() => appendFile(file, text)).catch((err: unknown) => log(`could not write a playtest record to ${file}: ${String(err)}`));
  };
}

export interface ServerHandle {
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

const here = path.dirname(fileURLToPath(import.meta.url));

function serveStatic(dir: string | null, req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (!dir) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Inheritance game server is running. Build the client with "npm run build", or use "npm run dev" for the Vite dev server.\n');
    return;
  }
  let pathname = '/';
  try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  const rel = path.normalize(pathname).replace(/^([/\\])+/, '');
  let file = path.join(dir, rel);
  if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
  try {
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // Single-page app: anything without an extension gets index.html.
      if (path.extname(rel) && rel !== '') { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
      file = path.join(dir, 'index.html');
      if (!existsSync(file)) { res.writeHead(404).end('Not found'); return; }
    }
    const ext = path.extname(file).toLowerCase();
    const immutable = /[/\\]assets[/\\]/.test(file);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    res.writeHead(500).end();
  }
}

export function startServer(opts: ServerOptions = {}): Promise<ServerHandle> {
  const log = opts.quiet ? () => {} : (m: string) => console.log(`[server] ${m}`);
  const limits = limitsWith(opts.limits);
  const trustHops = Math.max(0, Math.floor(opts.trustProxy ?? 0));
  const record = opts.metricsFile ? jsonLines(opts.metricsFile, log) : undefined;
  const rooms = new RoomManager({ fast: opts.fast, visitSeconds: opts.visitSeconds, botsIdle: opts.botsIdle, seed: opts.seed, log, limits, record });
  const defaultDir = path.resolve(here, '../dist/client');
  const dirCandidate = opts.staticDir ?? defaultDir;
  const staticDir = existsSync(path.join(dirCandidate, 'index.html')) ? dirCandidate : null;
  const started = Date.now();

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/health') {
        let players = 0;
        for (const r of rooms.rooms.values()) players += r.connectedHumans().length;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
        res.end(JSON.stringify({ ok: true, rooms: rooms.rooms.size, players, uptime: Math.round((Date.now() - started) / 1000), fast: !!opts.fast }));
        return;
      }
      serveStatic(staticDir, req, res);
    } catch {
      try { res.writeHead(500).end(); } catch { /* ignore */ }
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const sessions = new Map<WebSocket, Session>();
  const alive = new WeakMap<WebSocket, boolean>();
  /** Open sockets per client address (exempt addresses are not counted). */
  const perAddress = new Map<string, number>();
  let warnedProxy = false;

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url ?? '/', 'http://x').pathname; } catch { /* bad url */ }
    if (pathname !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const ip = clientAddress(req, trustHops);
    if (!trustHops && !warnedProxy && req.headers['x-forwarded-for']) {
      warnedProxy = true;
      log('requests carry X-Forwarded-For: behind a proxy or tunnel, set TRUST_PROXY=1 so per-address limits see real clients');
    }
    if (ip) {
      const n = perAddress.get(ip) ?? 0;
      if (n >= limits.socketsPerIp) {
        const refusal: ServerMsg = { t: 'error', message: 'Too many connections from your network. Close some tabs and try again.', refused: true };
        ws.send(JSON.stringify(refusal));
        ws.close(CLOSE_CODES.refused, 'Too many connections');
        return;
      }
      perAddress.set(ip, n + 1);
      ws.once('close', () => {
        const left = (perAddress.get(ip) ?? 1) - 1;
        if (left > 0) perAddress.set(ip, left);
        else perAddress.delete(ip);
      });
    }
    // A simulated network (testing): each direction delays its messages, in order.
    const sim = opts.netsim;
    const toClient = sim ? new NetLink(sim) : null;
    const fromClient = sim ? new NetLink(sim) : null;
    let gone = false;
    ws.once('close', () => { gone = true; });
    const later = (link: NetLink | null, fn: () => void): void => {
      if (!link) { fn(); return; }
      const now = performance.now() / 1000;
      setTimeout(() => { if (!gone) fn(); }, Math.max(0, (link.deliverAt(now) - now) * 1000));
    };
    const s = rooms.connect({
      send: (data) => later(toClient, () => {
        if (ws.readyState !== ws.OPEN) return;
        // Backpressure. A client that is not reading gets no more snapshots, and one
        // that has fallen a whole megabyte behind (whatever we were sending it) is
        // dropped: it can rejoin with its token, and the server's memory stays flat.
        const queued = ws.bufferedAmount;
        if (queued + data.length > limits.maxBacklog) { ws.terminate(); return; }
        if (queued > limits.snapBacklog && data.startsWith('{"t":"snap"')) return;
        ws.send(data);
      }),
      close: (code, reason) => later(toClient, () => ws.close(code, reason)),
    }, ip);
    sessions.set(ws, s);
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const bytes = Buffer.isBuffer(data) ? data.length : Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : data.byteLength;
      later(fromClient, () => rooms.onFrame(s, bytes, () => data.toString()));
    });
    ws.on('close', () => {
      sessions.delete(ws);
      rooms.onClose(s);
    });
    ws.on('error', () => { /* close follows */ });
  });

  // Fixed-rate loop: real elapsed time is fed to the rooms, which step their
  // matches in fixed ticks.
  let last = performance.now();
  const loop = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    rooms.tick(dt);
  }, 1000 / TICK_HZ);

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) { ws.terminate(); continue; }
      alive.set(ws, false);
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 15000);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 3000, opts.host, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port ?? 3000;
      log(`listening on http://localhost:${port} (WebSocket /ws${opts.fast ? ', FAST phases' : ''}${staticDir ? ', serving ' + staticDir : ''})`);
      resolve({
        port,
        rooms,
        close: () => new Promise<void>((done) => {
          clearInterval(loop);
          clearInterval(heartbeat);
          for (const r of rooms.rooms.values()) r.close();
          for (const ws of wss.clients) ws.terminate();
          wss.close();
          server.close(() => done());
          server.closeAllConnections?.();
        }),
      });
    });
  });
}

const isMain = !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const visitSeconds = Number(process.env.INHERITANCE_VISIT_SECONDS) || undefined;
  const trustProxy = trustProxyHops(process.env.TRUST_PROXY);
  const netsim = parseNetSim(process.env.INHERITANCE_NETSIM) ?? undefined;
  if (process.env.INHERITANCE_NETSIM && !netsim) console.warn('[server] INHERITANCE_NETSIM should look like 150,20,2 (round trip ms, jitter ms, loss %); ignored');
  if (netsim) console.log(`[server] simulating the network: ${netsim.rtt * 1000} ms round trip, ±${netsim.jitter * 1000} ms, ${netsim.loss * 100}% loss`);
  const metricsEnv = process.env.INHERITANCE_METRICS;
  const metricsFile = metricsEnv === 'off' ? undefined : metricsEnv || 'data/playtests.jsonl';
  if (metricsFile) console.log(`[server] playtest records go to ${metricsFile} (INHERITANCE_METRICS=off to stop)`);
  startServer({ port, fast: process.env.INHERITANCE_FAST === '1', visitSeconds, trustProxy, netsim, metricsFile }).then((h) => {
    const stop = (): void => { void h.close().then(() => process.exit(0)); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }).catch((err) => {
    console.error('[server] failed to start:', err);
    process.exit(1);
  });
}
