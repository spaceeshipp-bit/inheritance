// A simulated network link, for development and tests: latency, jitter and
// loss with the semantics of a WebSocket (TCP). Nothing is dropped or
// reordered: a lost packet is sent again after a retransmission delay and
// everything sent after it waits behind it (head-of-line blocking). So loss
// shows up the way players behind a lossy connection see it: a stall, then a
// burst of late messages.
//
// The retransmission delay is a model, not a measurement: fast retransmit
// needs three duplicate acknowledgements (about 100 ms of later packets at
// our send rates) plus a round trip, and Linux never waits less than 200 ms.

export interface NetSimConfig {
  /** Round-trip time (s), split evenly between the two directions. */
  rtt: number;
  /** Each message's one-way delay varies by up to this much either way (s). */
  jitter: number;
  /** Fraction of packets lost, each way (0..1). */
  loss: number;
}

/**
 * Parse `rtt,jitter,loss` in milliseconds and percent, e.g. "150,20,2" for a
 * 150 ms round trip, ±20 ms jitter and 2% loss (as used by `?netsim=` in the
 * client and INHERITANCE_NETSIM on the server). Missing parts are 0; anything
 * unparseable gives null.
 */
export function parseNetSim(text: string | null | undefined): NetSimConfig | null {
  if (!text) return null;
  const parts = text.split(',').map((s) => s.trim());
  if (parts.length > 3 || parts.some((s) => s !== '' && !/^\d+(\.\d+)?$/.test(s))) return null;
  const [rtt = 0, jitter = 0, loss = 0] = parts.map((s) => (s === '' ? 0 : Number(s)));
  if (rtt > 5000 || jitter > 1000 || loss > 50) return null;
  return { rtt: rtt / 1000, jitter: jitter / 1000, loss: loss / 100 };
}

/** Extra delay for a lost packet (s). */
export function retransmitDelay(cfg: NetSimConfig): number {
  return Math.max(0.2, cfg.rtt + 0.1);
}

/** One direction of a simulated link. */
export class NetLink {
  private last = 0;

  constructor(private readonly cfg: NetSimConfig, private readonly rng: () => number = Math.random) {}

  /** When a message sent at `now` (s) arrives: never before one sent earlier. */
  deliverAt(now: number): number {
    const { rtt, jitter, loss } = this.cfg;
    let t = now + rtt / 2 + (this.rng() * 2 - 1) * jitter;
    if (loss > 0 && this.rng() < loss) t += retransmitDelay(this.cfg);
    t = Math.max(t, now, this.last);
    this.last = t;
    return t;
  }
}
