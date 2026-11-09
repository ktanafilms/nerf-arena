// Sesiones de juego: host (autoritativo), invitado y modo de prueba local.
// Conexión directa entre móviles con WebRTC (PeerJS, broker público gratuito).

import Peer, { type DataConnection } from 'peerjs';
import type { Intent, Profile, Room } from '../types';
import { applyIntent, createRoom, ensureUndo, joinGuest, setConnected, tick } from '../engine/room';

const PREFIX = 'nerfarena-v1-';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const HOST_SAVE = 'nerf.hostRoom';
const HEARTBEAT_MS = 1000;
const TIMEOUT_MS = 4500;

export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'error';

type GuestMsg =
  | { k: 'hello'; profile: Profile; clientId: string }
  | { k: 'intent'; intent: Intent }
  | { k: 'ping'; t0: number };
type HostMsg =
  | { k: 'room'; room: Room }
  | { k: 'pong'; t0: number; th: number }
  | { k: 'full' };

export function randomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function clientId(): string {
  try {
    let id = localStorage.getItem('nerf.clientId');
    if (!id) {
      id = Math.random().toString(36).slice(2);
      localStorage.setItem('nerf.clientId', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export abstract class Session {
  room = $state.raw<Room | null>(null);
  status = $state<NetStatus>('connecting');
  error = $state<string | null>(null);
  abstract readonly me: string;
  abstract readonly kind: 'host' | 'guest' | 'solo';
  /** Reloj del host (ms epoch) visto desde este dispositivo. */
  abstract now(): number;
  abstract send(intent: Intent): void;
  abstract leave(): void;
}

// ───────────────────────────── HOST ─────────────────────────────

export class HostSession extends Session {
  readonly me = 'A';
  readonly kind: 'host' | 'solo' = 'host';
  protected r: Room;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private guestClient: string | null = null;
  private lastGuestSeen = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(code: string, profile: Profile, restored?: Room) {
    super();
    this.r = restored ?? createRoom(code, profile);
    if (restored) {
      const host = this.r.players.find((p) => p.id === 'A')!;
      Object.assign(host, profile, { connected: true });
      if (this.r.game) ensureUndo(this.r.game);
    }
    this.publish();
    this.timer = setInterval(() => this.loop(), 100);
  }

  now() {
    return Date.now();
  }

  start() {
    this.openPeer(0);
  }

  private openPeer(attempt: number) {
    if (this.closed) return;
    this.status = attempt ? 'reconnecting' : 'connecting';
    const peer = new Peer(PREFIX + this.r.code, { debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      this.status = 'online';
      this.error = null;
    });
    peer.on('connection', (c) => this.onConnection(c));
    peer.on('disconnected', () => {
      if (this.closed) return;
      this.status = 'reconnecting';
      setTimeout(() => !this.closed && !peer.destroyed && peer.reconnect(), 1500);
    });
    peer.on('error', (err: any) => {
      if (this.closed) return;
      if (err?.type === 'unavailable-id') {
        // El broker aún recuerda la sesión anterior (recarga rápida): reintentar
        peer.destroy();
        if (attempt < 12) setTimeout(() => this.openPeer(attempt + 1), 2500);
        else {
          this.status = 'error';
          this.error = 'El código de sala está ocupado. Crea una sala nueva.';
        }
      } else if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error') {
        this.status = 'reconnecting';
        this.error = 'Sin conexión con el servidor de emparejamiento. Reintentando…';
        peer.destroy();
        setTimeout(() => this.openPeer(attempt + 1), 3000);
      } else if (err?.type === 'browser-incompatible') {
        this.status = 'error';
        this.error = 'Este navegador no soporta conexiones directas (WebRTC).';
      }
    });
  }

  private onConnection(c: DataConnection) {
    c.on('data', (raw) => {
      const msg = raw as GuestMsg;
      if (msg.k === 'hello') {
        const guest = this.r.players.find((p) => p.id === 'B');
        if (guest && guest.connected && this.guestClient && this.guestClient !== msg.clientId) {
          c.send({ k: 'full' } satisfies HostMsg);
          setTimeout(() => c.close(), 500);
          return;
        }
        if (this.conn && this.conn !== c) this.conn.close();
        this.conn = c;
        this.guestClient = msg.clientId;
        this.lastGuestSeen = Date.now();
        const now = Date.now();
        if (guest) {
          // Reconexión: respetamos su perfil actual de la sala
          setConnected(this.r, 'B', true, now);
        } else {
          joinGuest(this.r, msg.profile);
        }
        this.commit();
        return;
      }
      if (c !== this.conn) return;
      this.lastGuestSeen = Date.now();
      if (msg.k === 'ping') c.send({ k: 'pong', t0: msg.t0, th: Date.now() } satisfies HostMsg);
      else if (msg.k === 'intent') {
        if (applyIntent(this.r, 'B', msg.intent, Date.now())) this.commit();
      }
    });
    c.on('close', () => {
      if (c === this.conn) this.guestLost();
    });
  }

  private guestLost() {
    if (setConnected(this.r, 'B', false, Date.now())) this.commit();
  }

  protected loop() {
    const now = Date.now();
    const guest = this.r.players.find((p) => p.id === 'B');
    if (this.kind === 'host' && guest?.connected && now - this.lastGuestSeen > TIMEOUT_MS) this.guestLost();
    if (tick(this.r, now)) this.commit();
  }

  send(intent: Intent) {
    if (applyIntent(this.r, this.me, intent, Date.now())) this.commit();
  }

  protected commit() {
    this.r.rev++;
    this.publish();
    if (this.conn?.open) this.conn.send({ k: 'room', room: this.r } satisfies HostMsg);
    this.save();
  }

  protected publish() {
    this.room = structuredClone(this.r);
  }

  protected save() {
    if (this.kind !== 'host') return;
    try {
      localStorage.setItem(HOST_SAVE, JSON.stringify({ room: this.r, savedAt: Date.now() }));
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  }

  leave() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.conn?.close();
    this.peer?.destroy();
    if (this.kind === 'host') {
      try {
        localStorage.removeItem(HOST_SAVE);
      } catch {}
    }
  }

  static savedRoom(): Room | null {
    try {
      const raw = localStorage.getItem(HOST_SAVE);
      if (!raw) return null;
      const { room, savedAt } = JSON.parse(raw);
      if (Date.now() - savedAt > 3 * 3600_000) return null;
      return room as Room;
    } catch {
      return null;
    }
  }
}

// ───────────────────────────── INVITADO ─────────────────────────────

export class GuestSession extends Session {
  readonly me = 'B';
  readonly kind = 'guest' as const;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private offset = 0;
  private bestRtt = Infinity;
  private samples: { rtt: number; off: number }[] = [];
  private lastHostSeen = 0;
  private hb: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private connecting = false;
  private queue: Intent[] = [];

  constructor(
    readonly code: string,
    private profile: Profile,
  ) {
    super();
  }

  now() {
    return Date.now() + this.offset;
  }

  start() {
    this.status = 'connecting';
    const peer = new Peer({ debug: 0 });
    this.peer = peer;
    peer.on('open', () => this.connect());
    peer.on('disconnected', () => {
      if (!this.closed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });
    peer.on('error', (err: any) => {
      if (this.closed) return;
      this.connecting = false;
      if (err?.type === 'peer-unavailable') {
        if (!this.room) {
          this.status = 'error';
          this.error = `No existe la sala ${this.code}. Revisa el código.`;
        } else {
          this.status = 'reconnecting';
          setTimeout(() => this.connect(), 2500);
        }
      } else if (err?.type === 'browser-incompatible') {
        this.status = 'error';
        this.error = 'Este navegador no soporta conexiones directas (WebRTC).';
      } else {
        this.status = 'reconnecting';
      }
    });
    this.hb = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible' && !this.conn?.open) this.connect();
  };

  private connect() {
    if (this.closed || this.connecting || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) {
      this.peer.reconnect();
      return;
    }
    this.connecting = true;
    const c = this.peer.connect(PREFIX + this.code, { reliable: true });
    const giveUp = setTimeout(() => {
      if (!c.open) {
        this.connecting = false;
        c.close();
      }
    }, 8000);
    c.on('open', () => {
      clearTimeout(giveUp);
      this.connecting = false;
      this.conn = c;
      this.lastHostSeen = Date.now();
      c.send({ k: 'hello', profile: this.profile, clientId: clientId() } satisfies GuestMsg);
      this.ping();
      for (const it of this.queue.splice(0)) c.send({ k: 'intent', intent: it } satisfies GuestMsg);
    });
    c.on('data', (raw) => {
      const msg = raw as HostMsg;
      this.lastHostSeen = Date.now();
      if (msg.k === 'room') {
        this.room = msg.room;
        this.status = 'online';
        this.error = null;
      } else if (msg.k === 'pong') {
        const t1 = Date.now();
        const rtt = t1 - msg.t0;
        const off = msg.th - (msg.t0 + t1) / 2;
        this.samples.push({ rtt, off });
        if (this.samples.length > 12) this.samples.shift();
        const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        if (best.rtt <= this.bestRtt * 1.5 || this.samples.length < 3) this.offset = best.off;
        this.bestRtt = best.rtt;
      } else if (msg.k === 'full') {
        this.status = 'error';
        this.error = 'La sala ya tiene dos jugadores.';
        this.closed = true;
      }
    });
    c.on('close', () => {
      if (c === this.conn) {
        this.conn = null;
        if (!this.closed) this.status = 'reconnecting';
      }
    });
  }

  private ping() {
    if (this.conn?.open) this.conn.send({ k: 'ping', t0: Date.now() } satisfies GuestMsg);
  }

  private heartbeat() {
    if (this.closed) return;
    if (this.conn?.open) {
      this.ping();
      if (Date.now() - this.lastHostSeen > TIMEOUT_MS) {
        this.status = 'reconnecting';
        this.conn.close();
        this.conn = null;
      }
    } else if (this.room || this.status === 'connecting') {
      this.connect();
    }
  }

  send(intent: Intent) {
    if (this.conn?.open) this.conn.send({ k: 'intent', intent } satisfies GuestMsg);
    else if (intent.t === 'profile' || intent.t === 'ready') this.queue.push(intent);
  }

  get hostLost() {
    return this.status !== 'online';
  }

  leave() {
    this.closed = true;
    if (this.hb) clearInterval(this.hb);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.conn?.close();
    this.peer?.destroy();
  }
}

// ───────────────────────────── PRUEBA (1 dispositivo) ─────────────────────────────

/** Host local con un segundo jugador simulado ("bot") que se controla con botones. */
export class SoloSession extends HostSession {
  override readonly kind = 'solo' as const;

  constructor(profile: Profile, botProfile: Profile) {
    super('SOLO', profile);
    joinGuest(this.r, botProfile);
    this.r.ready = {};
    this.status = 'online';
    this.publish();
  }

  override start() {
    this.status = 'online';
  }

  /** Acciones del rival simulado. */
  bot(intent: Intent) {
    if (applyIntent(this.r, 'B', intent, Date.now())) this.commit();
  }

  /** El bot se marca listo automáticamente cuando el jugador lo está. */
  override send(intent: Intent) {
    super.send(intent);
    if (intent.t === 'ready' && intent.ready) this.bot({ t: 'ready', ready: true });
  }
}
