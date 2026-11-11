// A tiny signalling relay for the voice e2e test: serves the harness page and
// bundle over HTTP and relays `rtc` messages over a WebSocket at /ws?id=ID, the
// same way server/room.ts does (validated RtcSignal, `peers` lists on join/leave).
//
// Test-only knobs (set from run.mjs):
//   relay.glare(a, b)      hold a's offers (and everything after them) to b until
//                          b's own offer to a has been relayed: forces both sides
//                          to offer at once (glare).
//   relay.quiet(id)        the next disconnect/reconnect of `id` is not announced to
//                          the others (simulates a rejoin the room did not notice).
import http from 'node:http';
import { WebSocketServer } from 'ws';

function parseRtc(v) {
  if (!v || typeof v !== 'object') return null;
  if ((v.type === 'offer' || v.type === 'answer') && typeof v.sdp === 'string' && v.sdp.length <= 60000) {
    return { type: v.type, sdp: v.sdp };
  }
  if (v.type === 'ice') {
    if (v.candidate === null) return { type: 'ice', candidate: null };
    const c = v.candidate;
    if (!c || typeof c !== 'object') return null;
    const cand = {};
    if (typeof c.candidate === 'string') cand.candidate = c.candidate;
    if (typeof c.sdpMid === 'string' || c.sdpMid === null) cand.sdpMid = c.sdpMid;
    if (typeof c.sdpMLineIndex === 'number' || c.sdpMLineIndex === null) cand.sdpMLineIndex = c.sdpMLineIndex;
    if (typeof c.usernameFragment === 'string') cand.usernameFragment = c.usernameFragment;
    return { type: 'ice', candidate: cand };
  }
  return null;
}

/**
 * @param {{ port: number, files: Record<string, { type: string, body: string | Buffer }> }} opts
 */
export function startRelay({ port, files }) {
  /** @type {Map<string, import('ws').WebSocket>} */
  const clients = new Map();
  const quiet = new Set();
  /** "a>b" -> { held: object[] } */
  const glare = new Map();
  const stats = { relayed: 0, held: 0 };

  const server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const f = files[path === '/' ? '/harness.html' : path];
    if (!f) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': f.type, 'cache-control': 'no-store' });
    res.end(f.body);
  });
  const wss = new WebSocketServer({ server, path: '/ws' });

  const send = (id, msg) => {
    const ws = clients.get(id);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const sendPeers = (only) => {
    for (const id of clients.keys()) {
      if (only && id !== only) continue;
      send(id, { t: 'peers', ids: [...clients.keys()].filter((x) => x !== id) });
    }
  };
  const forward = (from, to, data) => {
    const key = `${from}>${to}`;
    const g = glare.get(key);
    if (g && (g.held.length > 0 || data.type === 'offer')) {
      g.held.push(data);
      stats.held++;
      return;
    }
    send(to, { t: 'rtc', from, data });
    stats.relayed++;
    // b's offer to a went out: release what we held from a to b, after it.
    const back = glare.get(`${to}>${from}`);
    if (data.type === 'offer' && back && back.held.length) {
      glare.delete(`${to}>${from}`);
      for (const d of back.held) { send(from, { t: 'rtc', from: to, data: d }); stats.relayed++; }
    }
  };

  wss.on('connection', (ws, req) => {
    const id = new URL(req.url ?? '/', 'http://x').searchParams.get('id') ?? '';
    if (!id) { ws.close(); return; }
    const old = clients.get(id);
    clients.set(id, ws);
    if (old) { old.removeAllListeners('close'); old.close(); }
    if (quiet.has(id)) {
      quiet.delete(id);
      sendPeers(id); // only the rejoining client hears about the room
    } else {
      sendPeers();
    }
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (m?.t !== 'rtc' || typeof m.to !== 'string' || m.to === id || !clients.has(m.to)) return;
      const data = parseRtc(m.data);
      if (data) forward(id, m.to, data);
    });
    ws.on('close', () => {
      if (clients.get(id) !== ws) return;
      clients.delete(id);
      if (!quiet.has(id)) sendPeers();
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port,
        stats,
        glare(a, b) { glare.set(`${a}>${b}`, { held: [] }); },
        quiet(id) { quiet.add(id); },
        async close() {
          for (const ws of clients.values()) ws.terminate();
          wss.close();
          await new Promise((r) => server.close(() => r(undefined)));
        },
      });
    });
  });
}
