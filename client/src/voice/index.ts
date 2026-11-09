// Proximity voice. PLACEHOLDER: the real implementation (WebRTC mesh + Grandma's
// filter) replaces this file; the interface below is the contract the rest of
// the client codes against (see docs/ARCHITECTURE.md, "Voice").
import type { RtcSignal } from '../../../shared/protocol.js';
import type { Vec3 } from '../../../shared/types.js';

export interface VoiceSpeaker { id: string; pos: Vec3; whispering: boolean }

export interface VoiceUpdate {
  selfRole: 'grandma' | 'cousin' | 'lobby';
  listenerPos: Vec3;
  listenerYaw: number;
  aidActive: boolean;
  speakers: VoiceSpeaker[];
}

export interface VoiceManager {
  start(opts: { selfId: string; send: (to: string, data: RtcSignal) => void }): Promise<{ micOk: boolean }>;
  setPeers(ids: string[]): void;
  handleSignal(from: string, data: RtcSignal): void;
  update(p: VoiceUpdate): void;
  setWhisper(on: boolean): void;
  setPushToTalk(mode: boolean): void;
  setTalkKey(down: boolean): void;
  level(id: string | 'self'): number;
  setMuted(id: string, muted: boolean): void;
  stop(): void;
}

export function createVoice(): VoiceManager {
  return {
    async start() { return { micOk: false }; },
    setPeers() {},
    handleSignal() {},
    update() {},
    setWhisper() {},
    setPushToTalk() {},
    setTalkKey() {},
    level() { return 0; },
    setMuted() {},
    stop() {},
  };
}
